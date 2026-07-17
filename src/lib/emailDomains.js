// FANCLUV — 공개(팬) 회원가입 허용 이메일 도메인 정책.
//
// 정책(Hotfix): 이메일 "직접" 회원가입은 아래 대표 서비스 도메인만 허용한다.
//   • OAuth(Google/Kakao/Naver) 로그인: 이 제한 미적용(Provider 검증 이메일 그대로).
//   • 관리자/구단 초대 계정: 운영자가 발급 → 이 제한 미적용.
//   • 기존 가입 계정 로그인: 이 제한 미적용(로그인 차단 아님).
//
// ⚠️ 이 목록은 서버(send-email-code / complete-signup Edge)에도 동일하게 존재한다.
//    드리프트 방지를 위해 emailDomains.test.js 가 Edge 사본과 일치를 검증한다.
//    (목록을 바꾸면 Edge 의 ALLOWED_EMAIL_DOMAINS 도 함께 수정할 것.)
export const ALLOWED_EMAIL_DOMAINS = [
  // Google
  'gmail.com', 'googlemail.com',
  // Naver
  'naver.com',
  // Daum / Kakao
  'daum.net', 'hanmail.net', 'kakao.com',
  // Yahoo (대표 + 한국 호환)
  'yahoo.com', 'yahoo.co.kr',
  // Microsoft
  'msn.com', 'outlook.com', 'hotmail.com',
  // ZUM
  'zum.com',
  // Nate
  'nate.com',
  // Apple
  'icloud.com',
]

const ALLOWED_SET = new Set(ALLOWED_EMAIL_DOMAINS)

import { isValidEmail } from './authForm.js'

// 이메일에서 도메인(마지막 @ 뒤)만 소문자로 추출. 형식이 아니면 null.
export function emailDomain(email) {
  const s = (email || '').trim().toLowerCase()
  const at = s.lastIndexOf('@')
  if (at <= 0 || at === s.length - 1) return null
  return s.slice(at + 1)
}

// 공개 회원가입 허용 여부(형식 + 도메인). 서브도메인·유사도메인·IDN/punycode 차단.
// RFC 수준 형식(연속 점/시작·끝 점/비정상 local part 등)도 함께 검사해 단독으로도 안전하다.
// (SignupPage 는 형식 오류와 도메인 오류 문구를 구분하기 위해 isValidEmail 을 먼저 확인한다.)
export function isAllowedEmailDomain(email) {
  if (!isValidEmail(email)) return false
  const domain = emailDomain(email)
  if (!domain) return false
  // 국제화 도메인/punycode 는 이번 정책에서 차단.
  if (domain.startsWith('xn--') || domain.includes('.xn--')) return false
  if (!/^[a-z0-9.-]+$/.test(domain)) return false
  return ALLOWED_SET.has(domain) // 정확 일치(서브도메인/유사도메인 자동 차단)
}
