// FANCLUV — Auth session provider.
//
// Supabase 세션은 비동기이므로, 앱 시작 시 세션/프로필을 로드해 컨텍스트로
// 노출하고, 라우트 가드가 `loading` 동안 판단을 보류하게 한다.
// 로드된 사용자는 auth.js 의 동기 캐시에도 반영되어(loadCurrentSupabaseUser),
// 기존 화면들의 동기 getCurrentUser() 호출이 그대로 동작한다.
//
// Mock 모드(Supabase 미설정)에서는 비동기 로딩이 없으며, 라우트 가드가
// 동기 isAuthenticated() 를 그대로 사용한다(기존 동작 유지).
//
// ── recoveryStatus 상태 모델 ────────────────────────────────────────────────
// implicit flow에서 PASSWORD_RECOVERY 이벤트는 createClient의 initialize()가
// React 구독보다 먼저 emit→소실될 수 있다(authRecoveryState 참고). 따라서 단일
// boolean 대신 3-상태로 판정한다:
//   • 'checking'  : auth bootstrap 진행 중 — 아직 recovery 여부 미확정
//   • 'active'    : recovery 세션(비밀번호 변경 화면 허용)
//   • 'inactive'  : 일반 세션 또는 무세션 — 일반 라우팅 허용
// 판정 근거를 종합한다:
//   1) createClient 이전에 보존한 recovery intent (hasRecoveryIntent)
//   2) eager/React 리스너의 PASSWORD_RECOVERY 이벤트
//   3) bootstrap 완료 여부
// 유효 세션이 있다는 이유만으로 recovery로 단정하지 않고, PASSWORD_RECOVERY를
// 놓쳤다는 이유만으로 inactive로 단정하지 않는다.
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { loadCurrentSupabaseUser, getCurrentUser } from '../lib/auth.js'
import { hasRecoveryIntent, markRecoverySignal } from '../lib/authRecoveryState.js'

const AuthContext = createContext({
  user: null,
  loading: false,
  recoveryStatus: 'inactive',
  isPasswordRecovery: false,
})

// 초기 recoveryStatus: Mock이면 항상 inactive. Supabase면 보존된 intent가 있으면
// 즉시 active(레이스로 이벤트를 놓쳐도 홈 리다이렉트를 막기 위함), 없으면 checking.
function initialRecoveryStatus() {
  if (!isSupabaseConfigured) return 'inactive'
  return hasRecoveryIntent() ? 'active' : 'checking'
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (isSupabaseConfigured ? null : getCurrentUser()))
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [recoveryStatus, setRecoveryStatus] = useState(initialRecoveryStatus)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true

    // 초기 세션 로드(bootstrap). 완료 후 recovery 여부를 확정한다.
    loadCurrentSupabaseUser().then(u => {
      if (!active) return
      setUser(u)
      setLoading(false)
      setRecoveryStatus(prev => {
        if (prev === 'active') return 'active'      // 이미 active면 유지
        return hasRecoveryIntent() ? 'active' : 'inactive'
      })
    })

    // 로그인/로그아웃/토큰갱신/OAuth 콜백 등 세션 변화 구독
    const { data: sub } = supabase.auth.onAuthStateChange(async (event) => {
      // PASSWORD_RECOVERY: 재설정 링크 세션. (eager listener가 먼저 잡을 수도 있으나
      // 여기서도 수신하면 확정) → active 유지 + intent 보존.
      if (event === 'PASSWORD_RECOVERY') {
        markRecoverySignal()
        setRecoveryStatus('active')
        const u = await loadCurrentSupabaseUser()
        if (active) setUser(u)
        return
      }

      // 일반 인증 이벤트(INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED / SIGNED_OUT 등)
      const u = await loadCurrentSupabaseUser()
      if (!active) return
      setUser(u)
      // recovery intent가 보존돼 있으면 INITIAL_SESSION을 일반 로그인으로 오판하지 않는다.
      if (hasRecoveryIntent()) {
        setRecoveryStatus('active')
      } else {
        // 명시적 로그아웃 등으로 세션이 사라지면 inactive로 되돌린다.
        setRecoveryStatus(prev => (prev === 'active' ? prev : 'inactive'))
      }
    })

    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  // 하위 호환용 파생 boolean.
  const isPasswordRecovery = recoveryStatus === 'active'

  return (
    <AuthContext.Provider value={{ user, loading, recoveryStatus, isPasswordRecovery }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
