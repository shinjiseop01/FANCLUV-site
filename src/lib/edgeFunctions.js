// FANCLUV — Supabase Edge Function 호출 헬퍼 (재시도 포함).
//
// supabase.functions.invoke 를 직접 부르지 않고 invokeFunction() 을 통해 호출한다.
// - 일시적 오류(네트워크/5xx)면 최대 3회 지수 백오프로 자동 재시도.
// - 권한/요청 오류(4xx)는 재시도해도 소용 없어 즉시 중단.
// - 반환 형태는 supabase 와 동일한 { data, error } 라 호출부 코드를 바꾸지 않는다.
import { supabase } from './supabase.js'
import { withRetry, withTimeout } from './retry.js'
import { logger } from './logger.js'

// Edge Function 기본 타임아웃(무한 대기 방지). AI 분석 등 느린 작업은 호출부에서 늘린다.
const DEFAULT_TIMEOUT_MS = 20000

// FunctionsHttpError 는 context(Response)에 status 를 담는다. 5xx/네트워크만 재시도.
function statusOf(error) {
  return error?.context?.status ?? error?.status ?? null
}
function isTransient(error) {
  const status = statusOf(error)
  if (status && status < 500) return false // 4xx = 재시도 무의미
  return true                              // 5xx / status 없음(네트워크) = 재시도
}

export async function invokeFunction(name, options = {}, retryOpts = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = retryOpts
  try {
    return await withRetry(async () => {
      // 각 시도를 타임아웃으로 감싼다 → 특정 시도가 무한 대기하지 않는다.
      const res = await withTimeout(() => supabase.functions.invoke(name, options), timeoutMs, `edge:${name}`)
      // invoke 는 throw 대신 { data, error } 반환 → 일시적 error 면 throw 로 바꿔 재시도 유도.
      if (res?.error && isTransient(res.error)) throw res.error
      return res
    }, {
      retries: 3,
      label: `edge:${name}`,
      shouldRetry: err => isTransient(err),
      ...rest,
    })
  } catch (error) {
    logger.warn(`Edge Function 호출 실패: ${name}`, { error })
    return { data: null, error }
  }
}

export default invokeFunction
