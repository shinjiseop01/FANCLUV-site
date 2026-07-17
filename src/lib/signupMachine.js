// FANCLUV — 회원가입 이메일 인증 상태 머신(순수, 문서/가드용).
//
// SignupPage 의 실제 UI 상태는 개별 플래그로 관리되지만, 허용/금지 전이를 이 표로
// 명시해 회귀를 막는다(특히 "인증 완료 후 자동 재전송" 같은 금지 전이).
//
// 상태:
//  idle · sending · code_sent · verifying · verified · completing_signup ·
//  completed · send_failed · verification_failed · expired · rate_limited · completion_failed
export const SIGNUP_STATES = [
  'idle', 'sending', 'code_sent', 'verifying', 'verified', 'completing_signup',
  'completed', 'send_failed', 'verification_failed', 'expired', 'rate_limited', 'completion_failed',
]

// 허용 전이표. (재전송 = *_failed/expired/code_sent → sending, 이메일 변경 = → idle)
const TRANSITIONS = {
  idle: ['sending'],
  sending: ['code_sent', 'send_failed', 'rate_limited'],
  code_sent: ['verifying', 'sending', 'expired', 'idle'],       // sending=재전송, idle=이메일 변경
  verifying: ['verified', 'verification_failed', 'expired'],
  verified: ['completing_signup', 'idle'],                       // idle=이메일 변경(인증 무효화). sending 금지
  completing_signup: ['completed', 'verified', 'completion_failed'],
  completed: [],                                                 // 종료 — 어떤 전이도 없음
  send_failed: ['sending', 'idle'],
  verification_failed: ['verifying', 'sending', 'idle'],
  expired: ['sending', 'idle'],
  rate_limited: ['sending', 'idle'],
  completion_failed: ['completing_signup', 'verified', 'idle'],
}

export function canTransition(from, to) {
  const allowed = TRANSITIONS[from]
  if (!allowed) return false
  return allowed.includes(to)
}

export function nextStates(from) {
  return TRANSITIONS[from] ? [...TRANSITIONS[from]] : []
}

// 금지 전이(명시). 테스트/가드에서 사용.
export const FORBIDDEN_TRANSITIONS = [
  ['verified', 'sending'],            // 인증 완료 후 자동 재전송 금지
  ['completing_signup', 'code_sent'],
  ['completed', 'sending'],
  ['completed', 'verifying'],
  ['completed', 'code_sent'],
]
