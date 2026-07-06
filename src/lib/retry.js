// FANCLUV — 비동기 요청 자동 재시도(Retry).
//
// 일시적 네트워크/서버 오류(Supabase · Edge Function · 뉴스/리그 Provider)에 대해
// 최대 N회까지 지수 백오프로 재시도한다. 마지막까지 실패하면 마지막 오류를 throw.
//
// 사용:
//   const data = await withRetry(() => supabase.from('x').select(), { retries: 3 })
//   const res  = await withRetry(() => fetch(url), { retries: 3, shouldRetry })
//
// 기본 정책:
//   - retries=3 (최초 1회 + 재시도 3회 = 최대 4회 시도)  ← "최대 3회 재시도"
//   - baseDelay=300ms, 지수 증가(300 → 600 → 1200) + 지터(랜덤 ±).
//   - shouldRetry: 기본은 "throw 된 오류면 재시도". 4xx 등 재시도 불필요한 경우는
//     호출부에서 shouldRetry 로 걸러낸다.
import { logger } from './logger.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

export async function withRetry(fn, options = {}) {
  const {
    retries = 3,
    baseDelay = 300,
    maxDelay = 4000,
    factor = 2,
    jitter = true,
    shouldRetry = () => true,
    label = 'request',
  } = options

  let attempt = 0
  let lastError

  // 최초 시도 + retries 회 재시도.
  while (attempt <= retries) {
    try {
      return await fn(attempt)
    } catch (err) {
      lastError = err
      // 재시도 여부 판단(마지막 시도이거나 shouldRetry=false 면 중단).
      if (attempt >= retries || !shouldRetry(err, attempt)) break
      const backoff = Math.min(baseDelay * factor ** attempt, maxDelay)
      const wait = jitter ? Math.round(backoff * (0.5 + Math.random() * 0.5)) : backoff
      logger.debug(`retry(${label}) ${attempt + 1}/${retries} — ${wait}ms 후 재시도`, { error: err })
      await sleep(wait)
      attempt += 1
    }
  }
  throw lastError
}

// Supabase 쿼리 빌더는 { data, error } 를 반환(throw 하지 않음)한다. 이를 위해
// error 가 있으면 throw 로 바꿔 withRetry 가 재시도하게 하는 헬퍼.
//   const { data, error } = await retrySupabase(() => supabase.from('x').select())
export async function retrySupabase(queryFn, options = {}) {
  try {
    const res = await withRetry(async () => {
      const out = await queryFn()
      // PostgREST 오류 중 일시적(네트워크/5xx/타임아웃)만 재시도. 권한/제약 위반은 즉시 중단.
      if (out?.error && isTransientPgError(out.error)) throw out.error
      return out
    }, { label: 'supabase', ...options })
    return res
  } catch (error) {
    // 재시도 소진 후에도 실패 → 호출부가 기존처럼 error 를 다룰 수 있도록 형태 유지.
    return { data: null, error }
  }
}

// 재시도할 가치가 있는 "일시적" 오류인지 판정.
function isTransientPgError(error) {
  const code = String(error?.code || '')
  const msg = String(error?.message || '').toLowerCase()
  // Postgres 권한/제약/RLS 위반(42xxx, 23xxx, PGRST 권한류)은 재시도해도 소용 없음 → 중단.
  if (/^(23|42|28|22)/.test(code)) return false
  // 네트워크/타임아웃/5xx 신호는 재시도.
  return (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('temporarily') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('500') ||
    code === '' // 코드 없는 순수 네트워크 오류
  )
}

export default withRetry
