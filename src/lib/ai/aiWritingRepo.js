// FANCLUV — AI 작성 지원 클라이언트 리포지토리(dual-mode: Supabase Edge / Mock).
//
// 프론트는 Provider 를 직접 부르지 않는다(§4). Supabase 모드에서는 ai-writing-assist
// Edge 를 호출하고(서버가 검증·안전성·rate·Provider 실행), Mock 앱 모드(백엔드 미설정)
// 에서는 로컬 결정론적 Mock 으로 동일 흐름을 재현한다.
//
// 전송 데이터(§6): operation, sourceText(사용자 본인 원문, 우리 Edge 로만), locale,
//   teamId(비식별 slug), requestId. JWT/이메일/DI/비밀번호/프로필 PII 는 보내지 않는다.
// 중복 억제(§18): 동일 사용자·동일 입력·동일 operation 은 in-flight 단일화(버튼 연타 → 1회).
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { invokeFunction } from '../edgeFunctions.js'
import { runMockOperation } from './mockAiWritingProvider.js'
import { normalizeLocale } from './aiWritingConfig.js'
import { logger } from '../logger.js'

// 진행 중 요청(클라이언트 단일화). key → Promise. 개인 원문/출력은 여기 잠깐만 머물고
// 공용 캐시(withCache 등)에는 절대 넣지 않는다(§18).
const inflight = new Map()
function flightKey(operation, sourceText) { return `${operation}::${sourceText}` }

function newRequestId() {
  try { return crypto.randomUUID() } catch { return `r-${Date.now()}-${Math.random().toString(16).slice(2)}` }
}

// Edge/Mock 결과를 공통 형태로 정규화.
function normalizeResult(raw, requestId) {
  if (!raw) return { ok: false, code: 'network_error', requestId }
  if (raw.ok === false) return { ok: false, code: raw.code || 'server_error', warnings: raw.warnings || [], requestId }
  return {
    ok: true,
    operation: raw.operation,
    outputText: raw.outputText || '',
    titleSuggestions: raw.titleSuggestions || [],
    warnings: raw.warnings || [],
    provider: raw.provider || 'mock',
    model: raw.model || null,
    requestId: raw.requestId || requestId,
    usage: raw.usage || null,
    safety: raw.safety || null,
    duplicateSuppressed: !!raw.duplicateSuppressed,
  }
}

async function callEdge({ operation, sourceText, locale, teamId }) {
  const requestId = newRequestId()
  const { data, error } = await invokeFunction(
    'ai-writing-assist',
    { body: { operation, sourceText, locale, teamId: teamId || null, requestId } },
    { timeoutMs: 20000 },
  )
  if (error) {
    const status = error?.context?.status ?? error?.status ?? null
    // 4xx 는 서버가 구조화 코드를 body 로 주지만 invoke 가 error 로 감싸는 경우가 있어 폴백.
    logger.warn('ai-writing-assist 호출 실패', { error })
    return { ok: false, code: status === 429 ? 'rate_limited' : 'network_error', requestId }
  }
  return normalizeResult(data, requestId)
}

function callMock({ operation, sourceText, locale }) {
  const requestId = newRequestId()
  const r = runMockOperation({ operation, sourceText, locale, requestId })
  if (!r.success) return { ok: false, code: r.code, warnings: r.warnings || [], requestId }
  return {
    ok: true, operation, outputText: r.outputText, titleSuggestions: r.titleSuggestions,
    warnings: r.warnings, provider: r.provider, model: r.model, requestId: r.requestId,
    usage: r.usage, safety: r.safetyResult ? { severity: r.safetyResult.severity } : null, duplicateSuppressed: false,
  }
}

// 공개 API — AI 작성 지원 요청. 동일 in-flight 요청은 같은 Promise 를 공유(단일화).
export function requestAiWriting({ operation, sourceText, locale, teamId, context } = {}) {
  const loc = normalizeLocale(locale)
  const text = String(sourceText ?? '')
  const key = flightKey(operation, text)
  if (inflight.has(key)) return inflight.get(key)

  const p = (isSupabaseConfigured
    ? callEdge({ operation, sourceText: text, locale: loc, teamId, context })
    : Promise.resolve(callMock({ operation, sourceText: text, locale: loc })))
    .catch((e) => { logger.warn('requestAiWriting 예외', { error: e }); return { ok: false, code: 'network_error' } })
    .finally(() => { inflight.delete(key) })

  inflight.set(key, p)
  return p
}

// kill switch 상태(팬 UI 버튼 노출 판단). Mock 모드는 항상 활성.
export async function getAiEnabled() {
  if (!isSupabaseConfigured) return true
  const { data, error } = await supabase.rpc('ai_writing_enabled')
  if (error) { logger.warn('ai_writing_enabled 조회 실패', { error }); return true }
  return data !== false
}

// ── 관리자 ───────────────────────────────────────────────────────────
export async function getAiStats(day = null) {
  if (!isSupabaseConfigured) {
    return { ok: true, day: day || 'mock', total: 0, success: 0, failed: 0, rate_limited: 0, duplicate: 0, by_operation: {}, avg_ms: 0, estimated_units: 0, recent_error_codes: [] }
  }
  const { data, error } = await supabase.rpc('ai_writing_admin_stats', { p_day: day })
  if (error) return { ok: false, code: 'error' }
  return data
}
export async function getAiSettings() {
  if (!isSupabaseConfigured) return { ok: true, provider: 'mock', enabled: true, rate_per_min: 5, rate_per_day: 30, admin_per_min: 20, admin_per_day: 200, dedupe_window_secs: 10 }
  const { data, error } = await supabase.rpc('ai_writing_get_settings')
  if (error) return { ok: false, code: 'error' }
  return data
}
export async function setAiEnabled(enabled) {
  if (!isSupabaseConfigured) return { ok: true, enabled }
  const { data, error } = await supabase.rpc('ai_writing_set_enabled', { p_enabled: enabled })
  if (error) return { ok: false, code: 'error' }
  return data
}
export async function setAiProvider(provider) {
  if (!isSupabaseConfigured) return { ok: true, provider }
  const { data, error } = await supabase.rpc('ai_writing_set_provider', { p_provider: provider })
  if (error) return { ok: false, code: 'error' }
  return data
}
