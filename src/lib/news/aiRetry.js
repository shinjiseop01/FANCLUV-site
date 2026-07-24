// FANCLUV — 뉴스 AI Worker 재시도 정책(순수 함수, 테스트 가능). Worker(Deno) 가 동일 규칙을 미러링.
//   목적: 429/5xx/timeout 은 제한적 재시도(exponential backoff), 잘못된 입력은 즉시 실패,
//         무한 재시도·비용 폭증 방지(MAX_ATTEMPTS). 개인정보/키는 저장하지 않는다(짧은 코드만).

export const MAX_ATTEMPTS = 8

// 재시도 대상 오류 분류. 반환: { retryable, rateLimited, code } — code 는 저장용 짧은 문자열.
export function classifyFailure({ httpStatus = null, kind = null } = {}) {
  // kind: 'timeout' | 'network' | 'parse' | 'empty_content' | 'bad_input' | null
  if (kind === 'timeout') return { retryable: true, rateLimited: false, code: 'timeout' }
  if (kind === 'network') return { retryable: true, rateLimited: false, code: 'network' }
  if (kind === 'empty_content') return { retryable: false, rateLimited: false, code: 'empty_content' }
  if (kind === 'bad_input') return { retryable: false, rateLimited: false, code: 'bad_input' }
  if (kind === 'parse') return { retryable: false, rateLimited: false, code: 'parse_error' }
  const s = Number(httpStatus)
  if (s === 429) return { retryable: true, rateLimited: true, code: 'rate_limited' }
  if (s >= 500 && s <= 599) return { retryable: true, rateLimited: false, code: `http_${s}` }
  if (s === 401 || s === 403) return { retryable: false, rateLimited: false, code: `http_${s}` } // 설정 오류 — 재시도 무의미
  if (s >= 400 && s <= 499) return { retryable: false, rateLimited: false, code: `http_${s}` }
  return { retryable: false, rateLimited: false, code: httpStatus ? `http_${s}` : 'unknown' }
}

// attempt(1부터) → backoff 초. 1m,5m,15m,1h,3h,6h(cap). ±20% jitter(선택, deterministic 옵션).
const BACKOFF_STEPS_SEC = [60, 300, 900, 3600, 10800, 21600]
export function backoffSeconds(attempt, { jitter = true, rand = Math.random } = {}) {
  const a = Math.max(1, Math.floor(attempt))
  const base = BACKOFF_STEPS_SEC[Math.min(a - 1, BACKOFF_STEPS_SEC.length - 1)]
  if (!jitter) return base
  const delta = base * 0.2 * (rand() * 2 - 1) // ±20%
  return Math.max(30, Math.round(base + delta))
}

// 다음 상태 결정. 반환: { status:'done'|'retry'|'failed', nextRetrySec?:int, code? }
//   attempts = 이번 시도까지 누적 실패 횟수(이번 실패 포함). MAX 초과 시 영구 failed.
export function decideNext({ ok, httpStatus = null, kind = null, attempts = 1 } = {}) {
  if (ok) return { status: 'done' }
  const c = classifyFailure({ httpStatus, kind })
  if (!c.retryable) return { status: 'failed', code: c.code }
  if (attempts >= MAX_ATTEMPTS) return { status: 'failed', code: `max_attempts:${c.code}` }
  return { status: 'retry', nextRetrySec: backoffSeconds(attempts, { jitter: false }), code: c.code, rateLimited: c.rateLimited }
}
