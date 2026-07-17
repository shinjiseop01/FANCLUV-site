// FANCLUV — 인증 폼 순수 헬퍼(이메일 형식 검증 / 회원가입 단계 / 재전송 쿨다운).
//
// UI(SignupPage/LoginPage) 와 분리해 순수 함수로 단위 테스트한다. React·DOM·i18n
// 의존이 없어야 한다(문구는 호출측에서 t() 로 매핑).

// ── 이메일 형식 검증(RFC 수준의 "형식" 검사 — 도달성/실존 여부는 인증번호로 확인) ──
// local@domain.tld 구조를 검사한다:
//   • local: RFC 5322 에서 허용하는 문자 집합, 선행/후행 dot 금지, 연속 dot(..) 금지
//   • domain: 라벨(영숫자+하이픈, 하이픈 선행/후행 금지, 라벨 1~63자) 을 dot 로 연결
//   • TLD: 알파벳 2자 이상
//   • 전체 길이 254자 이하(RFC 5321 실무 상한)
const LOCAL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/
const LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/

export function isValidEmail(email) {
  const s = (email || '').trim()
  if (!s || s.length > 254) return false
  const at = s.lastIndexOf('@')
  if (at <= 0 || at === s.length - 1) return false
  const local = s.slice(0, at)
  const domain = s.slice(at + 1)
  if (local.length > 64) return false
  if (!LOCAL_RE.test(local)) return false
  if (domain.length > 255) return false
  const labels = domain.split('.')
  if (labels.length < 2) return false
  if (!labels.every(l => LABEL_RE.test(l))) return false
  const tld = labels[labels.length - 1]
  if (!/^[A-Za-z]{2,}$/.test(tld)) return false
  return true
}

// ── 세션 저장소 라우팅(로그인 상태 유지) ──
// keep=true → 활성=local(영구), keep=false → 활성=session(브라우저 종료 시 소멸).
// 반대편(other) 저장소는 setItem 시 잔재 제거 대상. 저장소 객체를 주입받아 순수.
export function pickStores(keep, localStore, sessionStore) {
  return keep
    ? { active: localStore, other: sessionStore }
    : { active: sessionStore, other: localStore }
}

// ── 재전송 쿨다운(연속 클릭 방지 Rate Limit) ──
export const RESEND_COOLDOWN_SEC = 60

// 남은 초에 따라 재전송 버튼의 활성/문구 키를 결정(순수). 문구는 호출측에서 t() 매핑.
//   sending  → 발송 중(비활성)
//   cooldown>0 → 대기(비활성, 남은 초 표시)
//   codeSent → 재전송 가능
//   그 외 → 최초 발송
export function resendButtonState({ sending = false, cooldown = 0, codeSent = false } = {}) {
  if (sending) return { disabled: true, key: 'sending', seconds: 0 }
  if (cooldown > 0) return { disabled: true, key: 'cooldown', seconds: cooldown }
  if (codeSent) return { disabled: false, key: 'resend', seconds: 0 }
  return { disabled: false, key: 'send', seconds: 0 }
}

// ── 회원가입 단계(① 이메일 → ② 인증 → ③ 프로필 → ④ 완료) ──
export const SIGNUP_STEPS = ['email', 'code', 'profile', 'done']

// 현재 상태 플래그로 각 단계의 status(done/active/todo) 와 현재 단계 index(1~4) 계산.
//   emailValid       : 이메일 형식 유효
//   codeSent         : 인증번호 발송됨
//   emailVerified    : 인증번호 검증 완료
//   profileComplete  : 닉네임/나이대/비밀번호 등 프로필 입력 완료
//   done             : 회원가입 완료(제출 성공)
export function signupProgress({ emailValid = false, codeSent = false, emailVerified = false, profileComplete = false, done = false } = {}) {
  // 완료된 단계 수(앞에서부터 순차 충족).
  let completed = 0
  if (emailValid) completed = 1                          // ① 이메일 형식 OK
  if (completed === 1 && codeSent) completed = 1.5       // 인증번호 발송(②의 진행 중)
  if (emailVerified) completed = 2                        // ② 인증 완료
  if (completed >= 2 && profileComplete) completed = 3    // ③ 프로필 완료
  if (done) completed = 4                                 // ④ 가입 완료

  const currentIndex = done ? 4 : Math.min(Math.floor(completed) + 1, 4) // 1~4
  const steps = SIGNUP_STEPS.map((key, i) => {
    const n = i + 1
    let status = 'todo'
    if (done || n < currentIndex) status = 'done'
    else if (n === currentIndex) status = 'active'
    return { key, index: n, status }
  })
  return { currentIndex, steps }
}
