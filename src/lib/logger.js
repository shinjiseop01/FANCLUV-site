// FANCLUV — 운영 로그 Wrapper.
//
// 앱 전역에서 console.* 를 직접 쓰지 않고 logger.* 를 통해 로그를 남긴다.
// - 지금은 console 로 출력하는 단순 구현(+ 치명 오류는 sink 로 전달할 준비).
// - 향후 Sentry / Datadog / 자체 수집 API 등 원격 수집기를 붙일 때 `addSink()` 로
//   sink 하나만 등록하면 되고, 호출부(logger.error(...))는 바꾸지 않는다.
//
// 레벨: debug < info < warn < error.
//   - 개발(dev): 모든 레벨을 콘솔에 출력.
//   - 운영(prod): warn / error 만 콘솔에 출력(디버그 노이즈 제거). error 는 sink 로도 전달.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
const IS_DEV = Boolean(import.meta.env?.DEV)

// 운영에서 콘솔로 내보낼 최소 레벨(warn 이상). 개발은 전부.
const CONSOLE_MIN = IS_DEV ? LEVELS.debug : LEVELS.warn

// 원격 수집기(sink) 목록. 각 sink = ({ level, message, error, context, at }) => void
const sinks = []

// 치명 오류를 받을 원격 수집기 등록(예: Sentry). 반환값으로 해제 함수 제공.
export function addSink(fn) {
  if (typeof fn !== 'function') return () => {}
  sinks.push(fn)
  return () => {
    const i = sinks.indexOf(fn)
    if (i >= 0) sinks.splice(i, 1)
  }
}

function emit(level, message, meta) {
  const rank = LEVELS[level] || LEVELS.info
  const entry = {
    level,
    message: typeof message === 'string' ? message : String(message),
    error: meta?.error,
    context: meta?.context,
    at: new Date().toISOString(),
  }

  // 1) 콘솔 출력(레벨 게이트)
  if (rank >= CONSOLE_MIN) {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'debug' ? console.debug : console.info
    if (meta?.error) fn(`[FANCLUV] ${entry.message}`, meta.error)
    else if (meta?.context) fn(`[FANCLUV] ${entry.message}`, meta.context)
    else fn(`[FANCLUV] ${entry.message}`)
  }

  // 2) warn/error 는 등록된 sink 로도 전달(원격 수집 준비 지점). sink 실패는 무시.
  if (rank >= LEVELS.warn && sinks.length) {
    for (const s of sinks) {
      try { s(entry) } catch { /* sink 오류가 앱을 막지 않도록 무시 */ }
    }
  }
}

export const logger = {
  debug: (message, meta) => emit('debug', message, meta),
  info: (message, meta) => emit('info', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  // logger.error('설명', { error, context }) — 치명 오류.
  error: (message, meta) => emit('error', message, meta),
}

export default logger
