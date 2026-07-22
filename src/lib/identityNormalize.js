// FANCLUV — 회원가입 이메일·닉네임 정규화(중복 비교 기준). 순수 함수, 단위 테스트 대상.
//
// DB 의 최종 강제 기준(public.normalize_identity_text: NFC + trim + lower)과 동일 규칙을
// 클라이언트/Edge UX 검증에 사용한다. DB 가 source of truth 이며 여기서는 사전 검증·표시용이다.
// 주의(§5.2): Gmail 점/+tag 제거, provider alias 통합, IDN 변환은 하지 않는다. NFKC(전각 폴딩)도
// 도입하지 않는다(요구 기준=NFC).

// 문자열이 아니거나 비면 null. 그 외 NFC → trim → lower.
function normalizeCore(v) {
  if (typeof v !== 'string') return null
  const n = v.normalize('NFC').trim().toLowerCase()
  return n === '' ? null : n
}

// 이메일 canonical 값(중복 비교용). 형식 검증은 별도(isValidEmail).
export function normalizeEmail(email) {
  return normalizeCore(email)
}

// 닉네임 canonical 값(중복 비교용). display 원문은 별도 유지한다.
export function normalizeNickname(nickname) {
  return normalizeCore(nickname)
}

// 두 값이 같은 정규화 결과인지(대소문자·공백·NFC 변형 동일 취급).
export function sameNormalized(a, b) {
  const na = normalizeCore(a), nb = normalizeCore(b)
  return na !== null && na === nb
}
