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
// PASSWORD_RECOVERY: 비밀번호 재설정 메일 링크가 만드는 임시 인증 세션.
// 일반 SIGNED_IN과 다르게, /reset-password 화면에서만 허용하고,
// 비밀번호 변경 후 signOut으로 세션을 종료한다.
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { loadCurrentSupabaseUser, getCurrentUser } from '../lib/auth.js'

const AuthContext = createContext({ user: null, loading: false, isPasswordRecovery: false })

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (isSupabaseConfigured ? null : getCurrentUser()))
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true

    // 초기 세션 로드
    loadCurrentSupabaseUser().then(u => {
      if (!active) return
      setUser(u)
      setLoading(false)
    })

    // 로그인/로그아웃/토큰갱신/OAuth 콜백 등 세션 변화 구독
    const { data: sub } = supabase.auth.onAuthStateChange(async (event) => {
      // PASSWORD_RECOVERY: 비밀번호 재설정 메일 링크에서 생성되는 임시 세션
      // 일반 인증과 구분해 /reset-password 접근만 허용하고, 변경 후 signOut
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
        const u = await loadCurrentSupabaseUser()
        if (active) setUser(u)
        return
      }

      // 일반 인증 이벤트 (SIGNED_IN, SIGNED_OUT, INITIAL_SESSION 등)
      setIsPasswordRecovery(false)
      const u = await loadCurrentSupabaseUser()
      if (active) setUser(u)
    })

    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, isPasswordRecovery }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
