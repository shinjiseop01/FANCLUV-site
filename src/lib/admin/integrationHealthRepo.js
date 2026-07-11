// FANCLUV — 통합(외부 서비스) 상태 repository (Supabase-우선 + Mock 폴백).
//
// 관리자 시스템 상태 대시보드(AdminSystemStatus)의 데이터 레이어. 8개 외부 서비스의
// 상태/응답시간을 점검(연결 테스트)하고, 결과를 저장하며, 최근 오류 로그를 조회한다.
//   - Supabase 설정 시: integration_health / integration_logs 테이블(0022).
//     서버 의존 서비스(DB/Auth/Edge/OpenAI/Email)는 health-check Edge Function 으로 점검.
//   - 미설정(Mock): localStorage. 서버 서비스는 '비활성화'(Supabase 미연결)로 표시.
//   - Team News / League 는 실제 Provider 파이프라인(getTeamNews/getStandings)으로 점검.
//   - Push Notification 은 브라우저 권한(Notification.permission)으로 점검(양 모드 공통).
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { invokeFunction } from '../edgeFunctions.js'
import { logger } from '../logger.js'
import { isAdmin } from '../auth.js'
import { pushMockNotification, notifyAdmins } from '../notificationsRepo.js'
import { getTeamNews } from '../news/teamNewsProvider.js'
import { getStandings } from '../../services/league/leagueProvider.js'

export const FAILURE_THRESHOLD = 3   // 연속 3회 실패 → 관리자 알림
export const SLOW_MS = 1500          // 응답 지연 기준
const HKEY = 'fancluv_integration_health'
const LKEY = 'fancluv_integration_logs'
const LOG_LIMIT = 100

// 점검 대상 서비스 (표시 순서). server=서버 점검(health-check), 나머지는 클라이언트 점검.
export const SERVICES = [
  { key: 'db',       labelKey: 'admin.sys.svc.db',       kind: 'server' },
  { key: 'auth',     labelKey: 'admin.sys.svc.auth',     kind: 'server' },
  { key: 'edge',     labelKey: 'admin.sys.svc.edge',     kind: 'server' },
  { key: 'teamNews', labelKey: 'admin.sys.svc.teamNews', kind: 'news' },
  { key: 'league',   labelKey: 'admin.sys.svc.league',   kind: 'league' },
  { key: 'openai',   labelKey: 'admin.sys.svc.openai',   kind: 'server' },
  { key: 'email',    labelKey: 'admin.sys.svc.email',    kind: 'server' },
  { key: 'push',     labelKey: 'admin.sys.svc.push',     kind: 'push' },
  // OAuth 는 상호작용(사용자 동의)이 필요해 클라이언트에서 실제 로그인은 검사 못 한다.
  // 대신 "설정 여부"를 점검한다: configured(🟢) / 미설정(🟡 비활성). 실제 로그인은 QA로 확인.
  { key: 'oauthGoogle', labelKey: 'admin.sys.svc.oauthGoogle', kind: 'oauth' },
  { key: 'oauthKakao',  labelKey: 'admin.sys.svc.oauthKakao',  kind: 'oauth' },
  { key: 'oauthNaver',  labelKey: 'admin.sys.svc.oauthNaver',  kind: 'oauth' },
]
const SERVICE_MAP = Object.fromEntries(SERVICES.map(s => [s.key, s]))

function readMock(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def } catch { return def } }
function writeMock(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* ignore */ } }

// 상태 판정: disabled | error | slow | ok
function computeStatus({ disabled, ok, ms }) {
  if (disabled) return 'disabled'
  if (!ok) return 'error'
  if (ms != null && ms > SLOW_MS) return 'slow'
  return 'ok'
}

// ── 서비스 목록 + 최신 상태 ──
export async function listServices() {
  if (!isAdmin()) return []
  let stored = {}
  if (isSupabaseConfigured) {
    const { data } = await supabase.from('integration_health').select('*')
    for (const r of data || []) stored[r.service] = {
      status: r.status, lastSuccessAt: r.last_success_at, lastFailureAt: r.last_failure_at,
      responseMs: r.response_ms, consecutiveFailures: r.consecutive_failures,
    }
  } else {
    stored = readMock(HKEY, {})
  }
  return SERVICES.map(s => {
    // OAuth 설정 상태는 순수 클라이언트 점검이라 저장값 없이 즉시 계산해 보여준다.
    if (s.kind === 'oauth') {
      const r = checkOAuth(s.key)
      return {
        key: s.key, labelKey: s.labelKey, kind: s.kind,
        status: computeStatus(r), reason: r.error || null,
        lastSuccessAt: null, lastFailureAt: null, responseMs: null, consecutiveFailures: 0,
      }
    }
    return {
      key: s.key, labelKey: s.labelKey, kind: s.kind,
      status: stored[s.key]?.status || 'unknown',
      lastSuccessAt: stored[s.key]?.lastSuccessAt || null,
      lastFailureAt: stored[s.key]?.lastFailureAt || null,
      responseMs: stored[s.key]?.responseMs ?? null,
      consecutiveFailures: stored[s.key]?.consecutiveFailures || 0,
    }
  })
}

// ── 최근 시스템 로그(오류) ──
export async function listLogs(limit = LOG_LIMIT) {
  if (!isAdmin()) return []
  if (isSupabaseConfigured) {
    const { data } = await supabase.from('integration_logs').select('*').order('created_at', { ascending: false }).limit(limit)
    return (data || []).map(r => ({ id: r.id, service: r.service, status: r.status, message: r.message, responseMs: r.response_ms, createdAt: r.created_at }))
  }
  return readMock(LKEY, []).slice(0, limit)
}

// ── 단일 서비스 연결 테스트 ──
export async function testService(key) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  const def = SERVICE_MAP[key]
  if (!def) return { ok: false, error: 'unknown_service' }
  const res = await runTest(def)
  await recordResult(key, res)
  return { ...res, status: computeStatus(res), at: new Date().toISOString() }
}

// ── 전체 테스트 ──
export async function testAll() {
  if (!isAdmin()) return []
  // 서버 서비스는 health-check 한 번에 조회(효율), 나머지는 개별.
  const serverKeys = SERVICES.filter(s => s.kind === 'server').map(s => s.key)
  const serverResults = await runServerChecks(null) // 전체
  for (const k of serverKeys) {
    const r = serverResults[k] || { ok: false, ms: null, error: 'no_result', disabled: !isSupabaseConfigured }
    await recordResult(k, r)
  }
  for (const s of SERVICES.filter(s => s.kind !== 'server')) {
    await recordResult(s.key, await runTest(s))
  }
  return listServices()
}

// ── 실제 테스트 실행 ──
async function runTest(def) {
  switch (def.kind) {
    case 'server': {
      const map = await runServerChecks(def.key)
      return map[def.key] || { ok: false, ms: null, error: 'no_result', disabled: !isSupabaseConfigured }
    }
    case 'news': return timedPipeline(() => getTeamNews('seoul'), v => Array.isArray(v) && v.length > 0)
    case 'league': return timedPipeline(() => getStandings(), v => v && Array.isArray(v.rows) && v.rows.length > 0)
    case 'push': return checkPush()
    case 'oauth': return checkOAuth(def.key)
    default: return { ok: false, ms: null, error: 'unknown' }
  }
}

// OAuth 설정 여부 점검(클라이언트 감지 가능한 범위).
//   • Kakao/Naver: 프론트에 REST 키(VITE_*_CLIENT_ID)가 있어야 authorize 이동 가능.
//   • Google: Supabase 네이티브 provider(대시보드 설정) — 프론트가 활성 여부를 알 수 없어
//     Supabase 연결 여부를 전제로 '설정됨(추정)'으로 표시. 실제 로그인은 QA로 확인.
function isConfigured(v) {
  const s = String(v || '').trim()
  return !!s && !s.includes('your-')
}
function checkOAuth(key) {
  const env = import.meta.env || {}
  if (key === 'oauthKakao') {
    return isConfigured(env.VITE_KAKAO_CLIENT_ID) ? { ok: true, ms: null } : { ok: false, ms: null, disabled: true, error: 'not_configured' }
  }
  if (key === 'oauthNaver') {
    return isConfigured(env.VITE_NAVER_CLIENT_ID) ? { ok: true, ms: null } : { ok: false, ms: null, disabled: true, error: 'not_configured' }
  }
  // google (native): Supabase 미설정이면 불가, 설정이면 '설정됨(추정)'.
  return isSupabaseConfigured ? { ok: true, ms: null } : { ok: false, ms: null, disabled: true, error: 'not_configured' }
}

// health-check Edge Function 호출(서버 서비스). Mock 모드면 전부 '비활성화'.
async function runServerChecks(only) {
  const keys = only ? [only] : SERVICES.filter(s => s.kind === 'server').map(s => s.key)
  if (!isSupabaseConfigured) {
    // Supabase 미설정 → 서버 서비스 비활성화(Mock).
    return Object.fromEntries(keys.map(k => [k, { ok: false, ms: null, error: 'supabase_not_configured', disabled: true }]))
  }
  const { data, error } = await invokeFunction('health-check', { body: { only } })
  if (error || !data?.ok) {
    const reason = error ? (error.message || 'network') : (data?.code || 'error')
    return Object.fromEntries(keys.map(k => [k, { ok: false, ms: null, error: reason }]))
  }
  const out = {}
  for (const k of keys) {
    const s = data.services?.[k]
    out[k] = s
      ? { ok: !!s.ok, ms: s.ms ?? null, error: s.error || null, disabled: s.status === 'disabled' }
      : { ok: false, ms: null, error: 'no_result' }
  }
  return out
}

async function timedPipeline(fn, isValid) {
  const t0 = Date.now()
  try {
    const v = await fn()
    const ms = Date.now() - t0
    return isValid(v) ? { ok: true, ms, error: null } : { ok: false, ms, error: 'empty' }
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: String(e?.message || e) }
  }
}

// 브라우저 푸시 알림 권한 확인(클라이언트).
function checkPush() {
  if (typeof Notification === 'undefined') return { ok: false, ms: 0, error: 'unsupported', disabled: true }
  const p = Notification.permission
  if (p === 'granted') return { ok: true, ms: 0, error: null }
  if (p === 'denied') return { ok: false, ms: 0, error: 'denied' }
  return { ok: false, ms: 0, error: 'not_requested', disabled: true }  // 'default'
}

// ── 결과 기록 + 로그 + 자동 장애 감지(연속 3회) ──
async function recordResult(key, res) {
  const status = computeStatus(res)
  const now = new Date().toISOString()
  const isFail = status === 'error'

  if (isSupabaseConfigured) {
    const { data: cur } = await supabase.from('integration_health').select('consecutive_failures,alerted_at').eq('service', key).maybeSingle()
    const consecutive = isFail ? (cur?.consecutive_failures || 0) + 1 : 0
    const patch = { service: key, status, response_ms: res.ms ?? null, consecutive_failures: consecutive, updated_at: now }
    if (status !== 'error' && status !== 'disabled') { patch.last_success_at = now; patch.alerted_at = null }
    if (isFail) patch.last_failure_at = now
    await supabase.from('integration_health').upsert(patch)
    if (isFail || status === 'slow') {
      await supabase.from('integration_logs').insert({ service: key, status, message: res.error || null, response_ms: res.ms ?? null })
    }
    if (isFail && consecutive >= FAILURE_THRESHOLD && !cur?.alerted_at) {
      await createAlert(key)
      await supabase.from('integration_health').update({ alerted_at: now }).eq('service', key)
    }
    return
  }

  // Mock
  const health = readMock(HKEY, {})
  const prev = health[key] || {}
  const consecutive = isFail ? (prev.consecutiveFailures || 0) + 1 : 0
  health[key] = {
    status, responseMs: res.ms ?? null, consecutiveFailures: consecutive,
    lastSuccessAt: (status === 'ok' || status === 'slow') ? now : prev.lastSuccessAt || null,
    lastFailureAt: isFail ? now : prev.lastFailureAt || null,
    alertedAt: isFail ? prev.alertedAt || null : null,
  }
  if (isFail || status === 'slow') {
    const logs = readMock(LKEY, [])
    logs.unshift({ id: Date.now() + Math.random(), service: key, status, message: res.error || null, responseMs: res.ms ?? null, createdAt: now })
    writeMock(LKEY, logs.slice(0, LOG_LIMIT))
  }
  if (isFail && consecutive >= FAILURE_THRESHOLD && !health[key].alertedAt) {
    createAlert(key)
    health[key].alertedAt = now
  }
  writeMock(HKEY, health)
}

// 연속 실패 임계 → 관리자 알림.
async function createAlert(key) {
  const name = SERVICE_MAP[key]?.key || key
  const title = '서비스 연결 실패'
  const body = `${labelText(key)} 연속 ${FAILURE_THRESHOLD}회 이상 연결 실패`
  if (isSupabaseConfigured) {
    // 직접 insert 금지 → notify_admins RPC(SECURITY DEFINER)로 일원화.
    const res = await notifyAdmins({ type: 'notice', title, body })
    if (!res.ok) logger.warn('상태 알림 생성 실패', { error: res.error })
  } else {
    pushMockNotification({ type: 'notice', title, body, isImportant: true, audience: 'admin' })
  }
  logger.warn(body, { context: { service: name } })
}

// 알림 문구용 서비스 표시명(영문 키 기반 — locale 미접근).
function labelText(key) {
  return {
    db: 'Supabase Database', auth: 'Supabase Auth', edge: 'Edge Functions',
    teamNews: 'Team News', league: 'League API', openai: 'OpenAI API',
    email: 'Email Service', push: 'Push Notification',
  }[key] || key
}

export { computeStatus as statusOf }
