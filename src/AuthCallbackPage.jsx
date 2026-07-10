// FANCLUV — OAuth 콜백 처리 화면 (/auth/callback).
//
// Google / Kakao(Supabase 기본) · NAVER(커스텀 Edge Function) 로그인 성공 후
// 브라우저가 이 경로로 되돌아온다. supabase-js 가 URL(해시 or ?code=)에서 세션을
// 자동 교환(detectSessionInUrl)하면 AuthContext(onAuthStateChange)가 사용자를
// 로드한다. 이 화면은 그 동안 로딩을 보여주고, 세션이 잡히면 규칙에 따라 이동한다.
//
//   · 세션 성공 → postAuthPath(팀 선택 없으면 /team-select, 있으면 구단 홈 등)
//   · provider 에러/타임아웃 → 안내 후 로그인으로 복귀
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext.jsx'
import { useLang } from './contexts/LanguageContext.jsx'
import { postAuthPath } from './lib/authRoute.js'
import { isSupabaseConfigured } from './lib/supabase.js'
import './LoginPage.css'

// naver-callback / Supabase 가 전달하는 실패 코드 → 안내 문구 키.
const ERROR_KEYS = {
  naver_denied: 'authcb.errDenied',
  kakao_denied: 'authcb.errDenied',
  no_email: 'authcb.errNoEmail',
  token_exchange_failed: 'authcb.errProvider',
  profile_failed: 'authcb.errProvider',
  lookup_failed: 'authcb.errProvider',
  create_failed: 'authcb.errProvider',
  session_failed: 'authcb.errProvider',
  server_misconfigured: 'authcb.errConfig',
  oauth_timeout: 'authcb.errTimeout',
  access_denied: 'authcb.errDenied',
  server_error: 'authcb.errProvider',
}

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const { t } = useLang()
  const { user, loading } = useAuth()
  // URL 의 에러 파라미터를 첫 렌더에 동기 반영(세션 자동 라우팅과의 레이스 방지).
  const [errorCode, setErrorCode] = useState(() => {
    const qs = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const err = qs.get('error') || hash.get('error') || ''
    return err && !err.startsWith('account_exists') ? err : ''
  })
  const done = useRef(false)

  // 1) 계정충돌(account_exists_*)은 로그인 화면 전용 안내로 위임 / Mock 직접접근은 로그인으로.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const err = qs.get('error') || hash.get('error')
    if (err?.startsWith('account_exists')) { navigate(`/?error=${encodeURIComponent(err)}`, { replace: true }); return }
    if (!err && !isSupabaseConfigured) navigate('/', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2) 세션이 잡히면 규칙에 따라 이동.
  useEffect(() => {
    if (done.current || errorCode) return
    if (!loading && user) {
      done.current = true
      navigate(postAuthPath(user), { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, errorCode])

  // 3) 일정 시간 안에 세션이 안 잡히면 타임아웃 처리.
  useEffect(() => {
    if (errorCode) return
    const id = setTimeout(() => {
      if (!done.current && !user) setErrorCode('oauth_timeout')
    }, 9000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, errorCode])

  const errText = errorCode ? t(ERROR_KEYS[errorCode] || 'authcb.errProvider') : ''

  return (
    <div className="ch-root authcb-root">
      <div className="authcb-box" role="status" aria-live="polite">
        {errorCode ? (
          <>
            <div className="authcb-icon authcb-icon-err" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 8v5M12 16.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/><circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.8"/></svg>
            </div>
            <h1 className="authcb-title">{t('authcb.failTitle')}</h1>
            <p className="authcb-msg">{errText}</p>
            <button className="authcb-btn" onClick={() => navigate('/', { replace: true })}>{t('authcb.backLogin')}</button>
          </>
        ) : (
          <>
            <span className="authcb-spinner" aria-hidden="true" />
            <h1 className="authcb-title">{t('authcb.loadingTitle')}</h1>
            <p className="authcb-msg">{t('authcb.loadingMsg')}</p>
          </>
        )}
      </div>
    </div>
  )
}
