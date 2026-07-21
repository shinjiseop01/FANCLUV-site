// FANCLUV — AI 의견 작성 지원: 공통 설정(순수 상수 + 해석 함수).
//
// 클라이언트(Vite)·Edge(Deno)·단위 테스트가 모두 같은 규칙을 공유하기 위해
// 외부 의존성 없이 상수와 resolveConfig(env) 로만 구성한다. 정확한 제한값은
// 환경변수로 덮어쓸 수 있고, 미설정 시 아래 기본값을 쓴다.
//
// 원칙: 프론트 제한은 UX 용이며, 실제 강제는 서버(Edge+RPC)에서 이뤄진다.

// 지원 operation — 이 목록 밖의 값은 서버에서 거부한다.
export const AI_OPERATIONS = ['improve', 'constructive', 'summarize', 'titles', 'structure']

// 지원 로케일(향후 'ja' 확장 대비 — 하드코딩 최소화).
export const AI_LOCALES = ['ko', 'en']

// 기본 제한값(운영 기준). 환경변수로 재정의 가능.
export const AI_DEFAULTS = Object.freeze({
  minInputChars: 10,        // 너무 짧은 입력 거부
  maxInputChars: 2000,      // 최대 입력 길이
  maxOutputChars: 4000,     // 최대 출력 길이(결과 크기 제한)
  maxRequestBytes: 12000,   // 요청 payload 최대 크기
  ratePerMin: 5,            // 사용자당 1분
  ratePerDay: 30,           // 사용자당 1일
  adminRatePerMin: 20,      // 관리자/개발 별도 높은 제한(무제한 아님)
  adminRatePerDay: 200,
  dedupeWindowMs: 10000,    // 동일 원문·동일 operation 중복 억제 창(단시간)
  timeoutMs: 15000,         // Provider timeout
  provider: 'mock',         // 기본 provider id
  killSwitchDefault: true,  // AI 기능 기본 활성(관리자가 즉시 끌 수 있음)
})

function toInt(v, fallback) {
  const n = parseInt(v, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

// env(객체)에서 오버라이드를 읽어 최종 설정을 만든다.
// 클라이언트는 import.meta.env, Edge 는 Deno.env.toObject() 를 넘긴다. env 없으면 기본값.
export function resolveAiConfig(env = {}) {
  const g = (k) => env[`VITE_AI_${k}`] ?? env[`AI_${k}`]
  return Object.freeze({
    minInputChars: toInt(g('MIN_INPUT'), AI_DEFAULTS.minInputChars),
    maxInputChars: toInt(g('MAX_INPUT'), AI_DEFAULTS.maxInputChars),
    maxOutputChars: toInt(g('MAX_OUTPUT'), AI_DEFAULTS.maxOutputChars),
    maxRequestBytes: toInt(g('MAX_BYTES'), AI_DEFAULTS.maxRequestBytes),
    ratePerMin: toInt(g('RATE_MIN'), AI_DEFAULTS.ratePerMin),
    ratePerDay: toInt(g('RATE_DAY'), AI_DEFAULTS.ratePerDay),
    adminRatePerMin: toInt(g('ADMIN_RATE_MIN'), AI_DEFAULTS.adminRatePerMin),
    adminRatePerDay: toInt(g('ADMIN_RATE_DAY'), AI_DEFAULTS.adminRatePerDay),
    dedupeWindowMs: toInt(g('DEDUPE_MS'), AI_DEFAULTS.dedupeWindowMs),
    timeoutMs: toInt(g('TIMEOUT_MS'), AI_DEFAULTS.timeoutMs),
    provider: (g('PROVIDER') || AI_DEFAULTS.provider).toString().toLowerCase(),
  })
}

// operation / locale 유효성(순수) — 서버·클라이언트 공용.
export function isValidOperation(op) { return AI_OPERATIONS.includes(op) }
export function isValidLocale(loc) { return AI_LOCALES.includes(loc) }
export function normalizeLocale(loc) { return AI_LOCALES.includes(loc) ? loc : 'ko' }

// 입력 길이 검증 → { ok, code }. code: too_short | too_long | ok
export function validateInputLength(text, cfg = AI_DEFAULTS) {
  const s = String(text ?? '')
  const trimmed = s.trim()
  if (trimmed.length < cfg.minInputChars) return { ok: false, code: 'too_short' }
  if (s.length > cfg.maxInputChars) return { ok: false, code: 'too_long' }
  return { ok: true, code: 'ok' }
}

// 사용자 등급별 제한(일반/관리자) 반환.
export function limitsForRole(role, cfg = AI_DEFAULTS) {
  const isAdmin = role === 'admin'
  return {
    perMin: isAdmin ? cfg.adminRatePerMin : cfg.ratePerMin,
    perDay: isAdmin ? cfg.adminRatePerDay : cfg.ratePerDay,
  }
}
