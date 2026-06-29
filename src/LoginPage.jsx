import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login } from './lib/auth.js'
import { useLang } from './contexts/LanguageContext.jsx'
import './LoginPage.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const { t } = useLang()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError(t('login.errEmail')); return }
    if (!password.trim()) { setError(t('login.errPw')); return }
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      const result = login({ email: email.trim(), password })
      if (result.ok) {
        // 응원팀을 이미 선택했다면 해당 구단 홈으로, 아니면 응원팀 선택으로 이동
        if (result.user.selectedTeam) {
          navigate(`/club/${result.user.selectedTeam}`)
        } else {
          navigate('/team-select')
        }
      } else {
        setError(result.error)
      }
    }, 800)
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

          <form onSubmit={handleSubmit} noValidate>
            <div className="field-group">
              <label className="field-label">{t('login.email')}</label>
              <input
                type="email"
                className="field-input"
                placeholder={t('login.emailPh')}
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                autoComplete="email"
              />
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
                <button type="button" className="pw-toggle" onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                  {showPw ? (
                    <svg viewBox="0 0 24 24" fill="none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/></svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="error-msg" role="alert">⚠ {error}</div>
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

          <div className="form-footer">
            <a href="#" className="form-link">{t('login.findId')}</a>
            <span className="footer-sep">|</span>
            <a href="#" className="form-link">{t('login.findPw')}</a>
            <span className="footer-sep">|</span>
            <Link to="/signup" className="form-link">{t('login.signup')}</Link>
          </div>
        </div>
      </div>

    </div>
  )
}
