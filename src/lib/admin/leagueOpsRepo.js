// FANCLUV — League API 운영 관리 repository (관리자 진단 도구).
//
// 관리자 화면(AdminLeagueApi)에서 K리그 데이터 파이프라인 상태를 확인·테스트한다.
//   • 현재 Provider/모드/베이스 URL · 마지막 성공/실패 · 캐시 상태 · 마지막 사용 데이터
//   • 연결 테스트(순위표/일정/결과) — 응답시간·팀수·경기수·실패사유
//   • normalize 검증 — 외부 응답이 FANCLUV 표준 형태로 정상 변환되는지
//   • 연속 3회 실패 → 관리자 알림, 복구 시 복구 알림
//   • fallback: 실 API → 마지막 성공 데이터 → Mock (사용자 화면은 안 깨짐)
//
// 상태/카운터는 localStorage(관리자 진단 도구라 클라이언트 기록)에 저장하고,
// 알림은 Supabase notifications(admins) 또는 Mock 알림으로 발송한다.
import { leagueProviderInfo, probeLeague, refreshLeague } from '../../services/league/leagueProvider.js'
import { peekCache } from '../cache.js'
import { isSupabaseConfigured, supabase } from '../supabase.js'
import { isAdmin } from '../auth.js'
import { pushMockNotification, notifyAdmins } from '../notificationsRepo.js'
import { invokeFunction } from '../edgeFunctions.js'
import { logger } from '../logger.js'

export const FAILURE_THRESHOLD = 3       // 연속 3회 실패 → 관리자 알림
export const STANDINGS_TTL_MS = 5 * 60 * 1000
const OPS_KEY = 'fancluv_league_ops'
const PROBE_TEAM = 'seoul'               // 경기 일정/결과 프로브 기준 구단

// 표준(외부 계약) 필드 — normalize 검증 체크리스트(요구사항 4).
export const STANDING_FIELDS = ['rank', 'clubId', 'teamName', 'played', 'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst', 'goalDifference', 'points']
export const MATCH_FIELDS = ['id', 'homeClubId', 'awayClubId', 'homeTeamName', 'awayTeamName', 'matchDate', 'matchTime', 'stadium', 'status', 'homeScore', 'awayScore', 'round', 'competition']

function readOps() { try { return JSON.parse(localStorage.getItem(OPS_KEY)) || {} } catch { return {} } }
function writeOps(v) { try { localStorage.setItem(OPS_KEY, JSON.stringify(v)) } catch { /* ignore */ } }

// 내부 Provider 표준 → 외부 표준(계약) 순위행 (normalize 검증/미리보기).
function toStandardStanding(r) {
  if (!r) return null
  return {
    rank: r.rank,
    clubId: r.teamId ?? r.clubId,
    teamName: r.teamName,
    played: r.played,
    wins: r.win ?? r.wins,
    draws: r.draw ?? r.draws,
    losses: r.loss ?? r.losses,
    goalsFor: r.goalsFor,
    goalsAgainst: r.goalsAgainst,
    goalDifference: r.goalDiff ?? r.goalDifference,
    points: r.points,
  }
}
// 내부 Provider 표준 → 외부 표준(계약) 경기.
function toStandardMatch(m) {
  if (!m) return null
  return {
    id: m.id,
    homeClubId: m.homeTeamId ?? m.homeClubId,
    awayClubId: m.awayTeamId ?? m.awayClubId,
    homeTeamName: m.homeTeamName,
    awayTeamName: m.awayTeamName,
    matchDate: m.date ?? m.matchDate,
    matchTime: m.kickoff ?? m.matchTime,
    stadium: m.stadium,
    status: m.status,
    homeScore: m.homeScore ?? null,
    awayScore: m.awayScore ?? null,
    round: m.round,
    competition: m.competition,
  }
}
// 표준 객체가 모든 필드를 갖췄는지 검증(값이 undefined 면 미충족; null 은 허용 — 점수 등).
function checkFields(obj, fields) {
  const missing = fields.filter(f => !obj || obj[f] === undefined)
  return { ok: missing.length === 0, missing }
}

// ── 현재 상태(요구사항 2/6) ──
export async function getLeagueStatus() {
  if (!isAdmin()) return null
  const info = leagueProviderInfo()
  const ops = readOps()
  const cache = peekCache('league:').map(c => ({
    key: c.key, ageSec: Math.round(c.ageMs / 1000), fresh: c.ageMs < STANDINGS_TTL_MS,
  }))
  return {
    mode: info.mode,                                  // edge | api | mock
    edgeEnabled: info.edgeEnabled,
    apiConfigured: info.apiConfigured,
    baseUrl: info.mode === 'api' ? (info.apiBaseUrl || '') : (info.mode === 'edge' ? 'server-secret' : ''),
    lastSuccessAt: ops.lastSuccessAt || null,
    lastFailureAt: ops.lastFailureAt || null,
    consecutiveFailures: ops.consecutiveFailures || 0,
    alerting: (ops.consecutiveFailures || 0) >= FAILURE_THRESHOLD,
    lastSource: ops.lastSource || null,               // edge|api|cache|mock (마지막 사용 데이터)
    lastTest: ops.lastTest || null,
    cache,
  }
}

async function timedProbe(resource, teamId) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const r = await probeLeague(resource, teamId)
  const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
  return { ...r, ms }
}

// ── 연결 테스트(요구사항 3/4/5/6) ──
// opts.simulateFail: 개발/점검 환경에서 실패 흐름(3회 알림·복구)을 검증하기 위한 강제 실패.
export async function testLeagueApi(opts = {}) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  const simulate = !!opts.simulateFail
  const info = leagueProviderInfo()
  const realMode = info.mode === 'edge' || info.mode === 'api'
  const now = new Date().toISOString()

  // 캐시를 비우고 실제 프로브 실행 → 매번 실 파이프라인을 탄다.
  refreshLeague(PROBE_TEAM)
  const stProbe = await timedProbe('standings')
  const fxProbe = await timedProbe('fixtures', PROBE_TEAM)

  const standings = stProbe.value || []
  const fx = fxProbe.value || {}
  const upcoming = fx.upcoming || []
  const recent = fx.recent || []

  // normalize 검증 — 표준 형태로 변환 후 필드 충족 확인 + 샘플.
  const stdStanding = toStandardStanding(standings[0])
  const stdMatch = toStandardMatch(upcoming[0] || recent[0] || fx.next)
  const stdChk = checkFields(stdStanding, STANDING_FIELDS)
  const matchChk = checkFields(stdMatch, MATCH_FIELDS)

  // 각 항목 결과.
  const mk = (probe, count) => simulate
    ? { ok: false, source: 'mock', ms: probe.ms, count: count, error: 'simulated' }
    : { ok: count > 0, source: probe.source, ms: probe.ms, count, error: count > 0 ? null : (probe.error || 'empty') }

  const result = {
    at: now,
    standings: mk(stProbe, standings.length),
    schedule: mk(fxProbe, upcoming.length),
    results: mk(fxProbe, recent.length),
    normalize: {
      standing: { ok: !simulate && stdChk.ok, missing: stdChk.missing, sample: stdStanding },
      match: { ok: !simulate && matchChk.ok, missing: matchChk.missing, sample: stdMatch },
    },
    // 마지막 사용 데이터(fallback 단계): edge/api=실 API, cache=마지막 성공, mock=Mock.
    source: simulate ? 'mock' : stProbe.source,
    realMode,
    simulated: simulate,
  }

  // 실패 판정: 시뮬레이션이거나, 실모드에서 실 Provider 가 실패(폴백)한 경우.
  const realFail = simulate || (realMode && (!stProbe.primaryOk || !fxProbe.primaryOk))
  recordOutcome({ realFail, source: result.source, summary: summarize(result) })

  return { ok: true, ...result }
}

function summarize(r) {
  return {
    at: r.at, source: r.source,
    standings: r.standings.count, schedule: r.schedule.count, results: r.results.count,
    standingsOk: r.standings.ok, scheduleOk: r.schedule.ok, resultsOk: r.results.ok,
    normalizeOk: r.normalize.standing.ok && r.normalize.match.ok,
  }
}

// ── 결과 기록 + 자동 실패 감지/복구 알림(요구사항 5) ──
function recordOutcome({ realFail, source, summary }) {
  const ops = readOps()
  const now = new Date().toISOString()
  if (realFail) {
    ops.consecutiveFailures = (ops.consecutiveFailures || 0) + 1
    ops.lastFailureAt = now
    if (ops.consecutiveFailures >= FAILURE_THRESHOLD && !ops.alertedAt) {
      sendAlert('K리그 API 연결 실패', `K리그 API 연결 실패 ${ops.consecutiveFailures}회`)
      ops.alertedAt = now
    }
  } else {
    // 성공 — 직전에 장애 알림을 보냈다면 복구 알림.
    if (ops.alertedAt) sendAlert('K리그 API 복구', 'K리그 API 연결이 복구되었습니다.')
    ops.consecutiveFailures = 0
    ops.alertedAt = null
    ops.lastSuccessAt = now
  }
  ops.lastSource = source
  ops.lastTest = summary
  writeOps(ops)
}

// 관리자 알림 발송 — Supabase(admins) 또는 Mock 알림.
async function sendAlert(title, body) {
  if (isSupabaseConfigured) {
    const res = await notifyAdmins({ type: 'notice', title, body })
    if (!res.ok) logger.warn('League API 알림 생성 실패', { error: res.error })
  } else {
    pushMockNotification({ type: 'notice', title, body, isImportant: true, audience: 'admin' })
  }
  logger.warn(body, { context: { service: 'league_api' } })
}

// 실패 카운터/알림 상태 초기화(관리자 수동 리셋).
export function resetLeagueOps() {
  if (!isAdmin()) return
  const ops = readOps()
  ops.consecutiveFailures = 0
  ops.alertedAt = null
  writeOps(ops)
}

// ── API 계정 상태/quota (관리자 표시) ── league-fetcher status action 경유.
//   API-FOOTBALL /status: requests.current(오늘 사용), requests.limit_day(일 한도).
export async function getApiQuota() {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  if (!isSupabaseConfigured) return { ok: false, code: 'not_configured' }
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const { data, error } = await invokeFunction('league-fetcher', { body: { action: 'status' } })
  const responseMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)
  if (error || !data?.ok) return { ok: false, code: data?.code || 'error', responseMs }
  const s = data.status || {}
  const req = s.requests || {}
  const current = num(req.current)
  const limitDay = num(req.limit_day)
  return {
    ok: true,
    plan: s.subscription?.plan || s.account?.plan || null,
    active: s.subscription?.active ?? null,
    todayCalls: current,
    limitDay,
    remaining: limitDay ? Math.max(0, limitDay - current) : null,
    responseMs,
    fetchedAt: data.fetchedAt || new Date().toISOString(),
  }
}
function num(v) { const n = Number(v); return isNaN(n) ? 0 : n }

// ── 강제 동기화 ── 캐시 무시하고 순위+일정을 즉시 재수집(관리자 버튼).
export async function forceSyncLeague() {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  if (!isSupabaseConfigured) return { ok: false, code: 'not_configured' }
  const results = {}
  for (const resource of ['standings', 'fixtures']) {
    const { data, error } = await invokeFunction('league-fetcher', { body: { resource, force: true } })
    results[resource] = { ok: !error && !!data?.ok, source: data?.source || null, code: data?.code || null }
  }
  // 캐시 무효화(프론트 5분 캐시)까지 비워 즉시 최신 반영.
  refreshLeague()
  const ok = Object.values(results).some(r => r.ok)
  return { ok, results, at: new Date().toISOString() }
}

// K리그 공식 소스(kleague-sync) 수집 상태 — 관리자용(§24). league_sync_health RPC.
//   { season, standingsTeams, matches, sync:[{resource,lastSuccessAt,lastErrorAt,lastError,lastRows}] }
export async function getLeagueSyncHealth() {
  if (!isAdmin() || !isSupabaseConfigured) return null
  const { data, error } = await supabase.rpc('league_sync_health')
  return (!error && data && data.ok !== false) ? data : null
}
