// FANCLUV — 회원가입 서버 오류 코드 → UX 정책(순수 함수, 단위 테스트 대상).
//
// 서버 메시지 문자열을 파싱하지 않고 stable code 로 분기한다. 메시지 자체는 auth.js/locale 이
// 담당하고, 여기서는 "어디에 focus 할지 / 로그인 안내를 띄울지 / 재시도 가능한지"만 결정한다.
//
// 코드 원천: signup()/complete-signup Edge — nickname_taken, nickname_invalid,
//   already_registered, duplicate, signin_after_signup, unverified/not_verified/stale,
//   rate_limited, network_error 등.

// 닉네임 입력 유지·focus 대상(이메일 OTP 단계로 되돌리지 않는다).
const NICKNAME_CODES = new Set(['nickname_taken', 'nickname_invalid', 'NICKNAME_ALREADY_TAKEN', 'INVALID_NICKNAME'])
// 이미 가입된 이메일 계열 → 로그인 안내 CTA(무한 OTP 재요청 금지).
const LOGIN_CTA_CODES = new Set(['already_registered', 'email_already_registered', 'duplicate', 'EMAIL_ALREADY_REGISTERED', 'signin_after_signup', 'SIGNUP_ALREADY_COMPLETED'])
// 인증 세션 만료 계열 → 인증 단계 재개.
const REVERIFY_CODES = new Set(['unverified', 'not_verified', 'stale', 'verification_expired', 'UNAUTHENTICATED', 'SESSION_EXPIRED'])
// 재시도해도 되는 일시적 오류.
const RETRIABLE_CODES = new Set(['network_error', 'NETWORK_ERROR', 'complete_failed', 'server_error', 'UNKNOWN_ERROR', 'PROFILE_CONFLICT'])

export function signupErrorPolicy(code) {
  const c = code || ''
  return {
    focusNickname: NICKNAME_CODES.has(c),
    showLoginLink: LOGIN_CTA_CODES.has(c),
    reverify: REVERIFY_CODES.has(c),
    // 재시도 가능: 명시적 재시도군이거나, 위 분류에 안 걸리는 미분류 오류(보수적으로 재시도 허용).
    retriable: RETRIABLE_CODES.has(c) || (!NICKNAME_CODES.has(c) && !LOGIN_CTA_CODES.has(c) && !REVERIFY_CODES.has(c)),
    // 성공에 준하는 처리(계정은 생성됨 — 로그인 유도): signin_after_signup / already_completed.
    accountReady: c === 'signin_after_signup' || c === 'SIGNUP_ALREADY_COMPLETED',
  }
}
