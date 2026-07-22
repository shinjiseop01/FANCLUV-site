// FANCLUV — 비밀번호 재설정(recovery) intent 보존 모듈.
//
// ┌─ 왜 필요한가 (implicit flow 타이밍 레이스) ─────────────────────────────┐
// │ Supabase(@supabase/auth-js)는 implicit flow에서 recovery 링크를 클릭하면 │
// │ createClient() 생성자가 initialize()를 "즉시" 실행해 URL hash            │
// │ (#access_token=...&type=recovery)를 파싱→세션 수립→PASSWORD_RECOVERY     │
// │ emit→hash 제거 를 한다. 이 emit은 그 순간 구독자에게만 전달되고 replay   │
// │ 되지 않는다. React AuthContext의 onAuthStateChange 구독은 useEffect에서  │
// │ "늦게" 붙으므로 PASSWORD_RECOVERY를 놓치고 INITIAL_SESSION만 받는다.     │
// │ → recovery 세션이 일반 로그인으로 오판되어 홈으로 리다이렉트된다.        │
// └──────────────────────────────────────────────────────────────────────────┘
//
// 이 모듈은 createClient() "이전"(모듈 import 시점)에 동기적으로 실행되어,
// URL hash의 recovery marker(type=recovery) 여부를 boolean 으로만 보존한다.
// → auth-js가 hash를 제거하기 전에 intent를 확보한다.
//
// ⚠️ 보안: 토큰/hash 원문/이메일/세션 객체는 절대 저장하지 않는다. boolean("1")만.
// ⚠️ 저장소: sessionStorage(탭 단위) — localStorage보다 우선. 다른 탭/영구 잔존 방지.

const RECOVERY_INTENT_KEY = 'fancluv:password-recovery-intent'

// 초기 URL의 recovery marker를 동기 캡처.
// 링크가 /reset-password 가 아니라 '/'(Site URL fallback)로 떨어져도 감지하도록
// pathname 제한 없이 hash의 type=recovery 만 확인한다.
function captureInitialRecoveryIntent() {
  try {
    if (typeof window === 'undefined') return false
    const hash = window.location.hash || ''
    const type = new URLSearchParams(hash.slice(1)).get('type')
    const isRecovery = type === 'recovery'
    if (isRecovery) {
      window.sessionStorage.setItem(RECOVERY_INTENT_KEY, '1')
    }
    return isRecovery
  } catch {
    return false
  }
}

// 모듈 로드 시점(= createClient 이전)에 1회 동기 실행.
let moduleRecoverySignal = captureInitialRecoveryIntent()

// recovery intent 존재 여부(모듈 플래그 또는 sessionStorage).
export function hasRecoveryIntent() {
  if (moduleRecoverySignal) return true
  try {
    return typeof window !== 'undefined' &&
      window.sessionStorage.getItem(RECOVERY_INTENT_KEY) === '1'
  } catch {
    return moduleRecoverySignal
  }
}

// PASSWORD_RECOVERY 이벤트를 (eager listener가) 관측했을 때 호출.
// 초기 hash marker를 놓쳤더라도 intent를 확정한다.
export function markRecoverySignal() {
  moduleRecoverySignal = true
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(RECOVERY_INTENT_KEY, '1')
    }
  } catch { /* ignore */ }
}

// 비밀번호 변경 성공(또는 명시적 포기) 후 intent 정리.
// ⚠️ 복구 가능한 실패(재입력 가능)에서는 호출하지 말 것.
export function clearRecoveryIntent() {
  moduleRecoverySignal = false
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(RECOVERY_INTENT_KEY)
    }
  } catch { /* ignore */ }
}
