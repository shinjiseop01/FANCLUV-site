import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signup } from './lib/auth.js'
import { useLang } from './contexts/LanguageContext.jsx'
import './SignupPage.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SignupPage() {
  const navigate = useNavigate()
  const { t } = useLang()
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!nickname.trim()) { setError(t('signup.errNickname')); return }
    if (!email.trim()) { setError(t('signup.errEmail')); return }
    if (!EMAIL_RE.test(email)) { setError(t('signup.errEmailFormat')); return }
    if (!password) { setError(t('signup.errPw')); return }
    if (password.length < 4) { setError(t('signup.errPwLen')); return }
    if (password !== passwordConfirm) { setError(t('signup.errPwMatch')); return }

    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      const result = signup({ nickname: nickname.trim(), email: email.trim(), password })
      if (result.ok) {
        // 가입 직후 자동 로그인(미인증) → 이메일 인증 안내 화면으로 이동
        navigate('/verify-email', { state: { reason: 'signup' } })
      } else {
        setError(result.error)
      }
    }, 800)
  }

  return (
    <div className="signup-root">
      <div className="signup-card">

        <div className="signup-brand">FANCLUV</div>

        <div className="signup-header">
          <h1 className="signup-title">{t('signup.title')}</h1>
          <p className="signup-subtitle">{t('signup.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="su-field">
            <label className="su-label">{t('signup.nickname')}</label>
            <input
              type="text"
              className="su-input"
              placeholder={t('signup.nicknamePh')}
              value={nickname}
              onChange={e => { setNickname(e.target.value); setError('') }}
              autoComplete="nickname"
            />
          </div>

          <div className="su-field">
            <label className="su-label">{t('signup.email')}</label>
            <input
              type="email"
              className="su-input"
              placeholder={t('signup.emailPh')}
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              autoComplete="email"
            />
          </div>

          <div className="su-field">
            <label className="su-label">{t('signup.password')}</label>
            <input
              type="password"
              className="su-input"
              placeholder={t('signup.passwordPh')}
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              autoComplete="new-password"
            />
          </div>

          <div className="su-field">
            <label className="su-label">{t('signup.passwordConfirm')}</label>
            <input
              type="password"
              className="su-input"
              placeholder={t('signup.passwordConfirmPh')}
              value={passwordConfirm}
              onChange={e => { setPasswordConfirm(e.target.value); setError('') }}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="su-error" role="alert">⚠ {error}</div>
          )}

          <button type="submit" className="su-btn" disabled={loading}>
            {loading ? (
              <span className="su-btn-loading"><span className="su-spinner" />{t('signup.loading')}</span>
            ) : (
              <>
                <span>{t('signup.submit')}</span>
                <svg className="su-btn-arrow" viewBox="0 0 20 20" fill="none">
                  <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </>
            )}
          </button>
        </form>

        <p className="signup-login-row">
          {t('signup.haveAccount')} <Link to="/" className="signup-login-link">{t('signup.loginLink')}</Link>
        </p>
      </div>

      <Link to="/" className="signup-home-link">{t('common.backToHome')}</Link>
    </div>
  )
}
