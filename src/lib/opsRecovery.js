// FANCLUV — 자동 복구 유틸.
//
// 1) withRetry: 일시적(transient) 실패는 짧게 재시도해 자동 복구(false alarm 감소).
// 2) shouldNotifyRecovery: 장애 알림 상태였다가 정상으로 돌아오면 '복구' 알림을 보낼지 판정.

// 네트워크/타임아웃/일시적 5xx 등은 재시도 가치가 있는 transient 로 본다.
export function isTransientError(err) {
  const m = String(err?.message || err || '').toLowerCase()
  return /network|timeout|timed out|fetch failed|econn|temporarily|rate|429|502|503|504/.test(m)
}

// fn 을 실행하고, transient 실패면 retries 회까지 delay 후 재시도.
// isValid(result)==false 도 실패로 간주(빈 응답 등). 성공하면 { ok:true, value, attempts }.
export async function withRetry(fn, { retries = 1, delayMs = 300, isValid = () => true, isTransient = isTransientError, sleep } = {}) {
  const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)))
  let attempt = 0
  let lastErr = null
  while (attempt <= retries) {
    attempt++
    try {
      const value = await fn()
      if (isValid(value)) return { ok: true, value, attempts: attempt }
      lastErr = new Error('invalid_result')
    } catch (e) {
      lastErr = e
      if (!isTransient(e)) return { ok: false, error: e, attempts: attempt } // 영구 오류는 즉시 중단
    }
    if (attempt <= retries) await wait(delayMs)
  }
  return { ok: false, error: lastErr, attempts: attempt }
}

// 이전에 장애 알림이 나간 상태(prevAlertedAt 존재)에서 지금 정상(ok/slow)으로 돌아오면 복구 알림.
export function shouldNotifyRecovery(prevAlertedAt, currentStatus) {
  const recovered = currentStatus === 'ok' || currentStatus === 'slow'
  return Boolean(prevAlertedAt) && recovered
}
