import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { login } from './lib/auth.js'
import { isValidEmail } from './lib/authForm.js'
import { postAuthPath } from './lib/authRoute.js'
import { isSupabaseConfigured, isProdMisconfigured } from './lib/supabase.js'
import { hasRecoveryIntent } from './lib/authRecoveryState.js'
import { useAuth } from './contexts/AuthContext.jsx'
import { useLang } from './contexts/LanguageContext.jsx'
import Alert from './components/Alert.jsx'
import SocialAuth from './components/SocialAuth.jsx'
import './LoginPage.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useLang()
  const { user: sessionUser, recoveryStatus } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // "로그인 상태 유지": 체크 → 영구 세션(localStorage), 해제(기본) → 세션 로그인
  // (sessionStorage, 브라우저 종료 시 자동 로그아웃). OAuth 버튼에도 동일 적용.
  const [keep, setKeep] = useState(false)
  // 이메일 형식 오류 인라인 안내(입력을 마친 뒤에만 표시).
  const [emailErr, setEmailErr] = useState(false)
  // 소셜 로그인 안내(에러/성공) — 로그인 폼 상단 Alert 로 표시
  const [notice, setNotice] = useState(null) // { kind: 'error' | 'success', text }

  // 계정 충돌 안내를 provider 별 문구로 변환.
  function conflictMessage(errCode) {
    const map = {
      account_exists_google: t('login.conflictGoogle'),
      account_exists_kakao: t('login.conflictKakao'),
      account_exists_naver: t('login.conflictNaver'),
    }
    return map[errCode] || t('login.conflictGeneric')
  }

  // 로그인 성공 후 이동 경로는 postAuthPath(공유 규칙)로 결정한다. (콜백 화면과 동일)
  function routeAfterAuth(user) { navigate(postAuthPath(user)) }

  // 소셜 로그인 콜백의 ?error=account_exists_* 를 읽어 안내 후, 새로고침 반복을 막기 위해
  // Query Parameter 를 제거한다(history.replaceState).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err && err.startsWith('account_exists')) {
      setNotice({ kind: 'error', text: conflictMessage(err) })
      params.delete('error')
      const qs = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 비밀번호 재설정 성공 후 리다이렉트(state.passwordResetSuccess) → "새 비밀번호로 로그인" 안내.
  // 안내 표시 후 history state 를 비워, 새로고침/뒤로가기에서 재표시되지 않게 한다.
  useEffect(() => {
    if (location.state?.passwordResetSuccess) {
      setNotice({ kind: 'success', text: t('resetPw.loginPrompt') })
      navigate(location.pathname, { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  // recovery 세션(비밀번호 재설정 링크)이 Site URL fallback으로 '/'(로그인 화면)에
  // 떨어질 수 있다. 이 경우 홈으로 라우팅하지 말고 /reset-password로 넘긴다.
  // ⚠️ 판정은 recoveryStatus(컨텍스트 상태)가 아니라 hasRecoveryIntent()(보존된
  //    intent)로 한다. 사용자가 /reset-password에서 "로그인으로 돌아가기"로 나오면
  //    핸들러가 intent를 먼저 비우므로, 여기서 다시 /reset-password로 바운스되지 않는다.
  useEffect(() => {
    if (!isSupabaseConfigured) return
    if (hasRecoveryIntent()) {
      navigate('/reset-password', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoveryStatus])

  // 환영 메시지는 "이번에 새로 세션이 생긴 경우(무→유 전이)"에만 표시한다.
  // 로그아웃 직후 stale 한 sessionUser 로 리마운트되어 환영이 재표시/잔존하는 것을 막고,
  // 세션이 없어지면(로그아웃) 로그인 성공 안내를 즉시 제거한다.
  // recovery 상태(checking/active)에서는 절대 routeAfterAuth를 실행하지 않는다.
  const prevUserRef = useRef(sessionUser)
  useEffect(() => {
    if (!isSupabaseConfigured) return
    const hadUser = !!prevUserRef.current
    prevUserRef.current = sessionUser
    if (!sessionUser) {
      // 로그아웃/무세션 → 로그인 성공(환영) 안내 잔존 제거
      setNotice(prev => (prev?.kind === 'success' ? null : prev))
      return
    }
    if (hadUser) return // 마운트 시 이미 세션이 있던(stale) 경우엔 환영 재표시 금지
    // recovery 판정 중이거나 recovery 세션이면 홈 라우팅 금지(/reset-password에서 처리)
    if (recoveryStatus === 'checking' || recoveryStatus === 'active') return
    setNotice({ kind: 'success', text: t('login.welcome') })
    const id = setTimeout(() => routeAfterAuth(sessionUser), 1000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser, recoveryStatus])

  // 소셜 로그인(Mock) 성공 → 환영 메시지 짧게 표시 후 이동.
  function handleSocialSuccess(res) {
    setError('')
    setNotice({ kind: 'success', text: t('login.welcome') })
    setTimeout(() => routeAfterAuth(res.user), 1000)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError(t('login.errEmail')); return }
    if (!isValidEmail(email)) { setEmailErr(true); setError(t('signup.errEmailFormat')); return }
    if (!password.trim()) { setError(t('login.errPw')); return }
    setLoading(true)
    const result = await login({ email: email.trim(), password, keep })
    setLoading(false)
    // 이메일 미인증 계정은 login()에서 차단되어 여기 도달하지 않는다.
    if (result.ok) routeAfterAuth(result.user)
    else setError(result.error)
  }

  // 운영 배포인데 Supabase 미설정 → 로그인/서비스 차단, 설정 미완료 안내만 표시.
  if (isProdMisconfigured) {
    return (
      <div className="login-root">
        <div className="form-panel" style={{ width: '100%' }}>
          <div className="form-inner" style={{ textAlign: 'center' }}>
            <div className="form-header">
              <h2 className="form-title">FANCLUV</h2>
            </div>
            <Alert kind="error" boxed className="login-alert" style={{ marginTop: 16 }}>{t('login.setupIncomplete')}</Alert>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="login-root">

      {/* ── LEFT HERO ── */}
      <div className="hero-panel">
        <div className="hero-gradient" />
        <div className="hero-content">

          {/* Main copy */}
          <div className="hero-copy">
            <h1 className="hero-title">
              <span className="title-line1">{t('login.tagline1')}</span>
              <span className="title-line2">{t('login.tagline2')}</span>
            </h1>
            <p className="hero-desc">{t('login.heroDesc')}</p>
          </div>

          {/* Features */}
          <ul className="feature-list">
            <li className="feature-item">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div className="feature-text">
                <strong>{t('login.feat1')}</strong>
                <span>{t('login.feat1desc')}</span>
              </div>
            </li>
            <li className="feature-item">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              </div>
              <div className="feature-text">
                <strong>{t('login.feat2')}</strong>
                <span>{t('login.feat2desc')}</span>
              </div>
            </li>
            <li className="feature-item">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.8"/><path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              </div>
              <div className="feature-text">
                <strong>{t('login.feat3')}</strong>
                <span>{t('login.feat3desc')}</span>
              </div>
            </li>
          </ul>
        </div>
      </div>

      {/* ── RIGHT FORM ── */}
      <div className="form-panel">
        <div className="form-inner">

          <div className="form-header">
            <h2 className="form-title">FANCLUV</h2>
            <p className="form-subtitle">{t('login.formSubtitle')}</p>
          </div>

          {notice && (
            <Alert kind={notice.kind === 'success' ? 'success' : 'error'} boxed className="login-alert">{notice.text}</Alert>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="field-group">
              <label className="field-label">{t('login.email')}</label>
              <input
                type="email"
                className={`field-input${emailErr ? ' invalid' : ''}`}
                placeholder={t('login.emailPh')}
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); if (emailErr) setEmailErr(false) }}
                onBlur={() => setEmailErr(email.trim().length > 0 && !isValidEmail(email))}
                autoComplete="email"
                aria-invalid={emailErr}
              />
              {emailErr && (
                <p className="field-hint error" role="alert">{t('signup.errEmailFormat')}</p>
              )}
            </div>

            <div className="field-group">
              <label className="field-label">{t('login.password')}</label>
              <div className="pw-wrap">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="field-input pw-input"
                  placeholder={t('login.passwordPh')}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  autoComplete="current-password"
                />
                <button type="button" className="pw-toggle" onClick={() => setShowPw(v => !v)} tabIndex={-1}
                  aria-label={showPw ? t('common.hidePassword') : t('common.showPassword')} aria-pressed={showPw}>
                  {showPw ? (
                    <svg viewBox="0 0 24 24" fill="none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/></svg>
                  )}
                </button>
              </div>
            </div>

            <label className="keep-signed-in">
              <input
                type="checkbox"
                checked={keep}
                onChange={e => setKeep(e.target.checked)}
              />
              <span>{t('login.keepSignedIn')}</span>
            </label>

            {error && (
              <Alert kind="error" boxed className="login-alert">{error}</Alert>
            )}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? (
                <span className="btn-loading"><span className="spinner" />{t('login.loading')}</span>
              ) : (
                <>
                  <span>{t('login.submitCta')}</span>
                  <svg className="btn-arrow" viewBox="0 0 20 20" fill="none">
                    <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </>
              )}
            </button>
          </form>

          <SocialAuth onSuccess={handleSocialSuccess} onError={setError} keep={keep} />

          <div className="form-footer">
            <Link to="/find-id" className="form-link">{t('login.findId')}</Link>
            <span className="footer-sep">|</span>
            <Link to="/find-password" className="form-link">{t('login.findPw')}</Link>
            <span className="footer-sep">|</span>
            <Link to="/signup" className="form-link">{t('login.signup')}</Link>
          </div>
        </div>
      </div>

    </div>
  )
}
