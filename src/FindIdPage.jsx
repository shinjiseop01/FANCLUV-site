import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { findAccountByNickname } from './lib/auth.js'
import { validateNicknameFormat } from './lib/nicknameValidation.js'
import { useLang } from './contexts/LanguageContext.jsx'
import Alert from './components/Alert.jsx'
import './LoginPage.css'

export default function FindIdPage() {
  const navigate = useNavigate()
  const { t } = useLang()
  const [nickname, setNickname] = useState('')
  const [nicknameErr, setNicknameErr] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null) // { kind: 'success' | 'error', text }

  // 닉네임 형식 검증 실시간
  const nicknameValid = !nickname.trim() || validateNicknameFormat(nickname)

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage(null)

    const q = nickname.trim()
    if (!q) {
      setNicknameErr(true)
      setMessage({ kind: 'error', text: t('findId.errNicknameRequired') })
      return
    }

    if (!nicknameValid) {
      setNicknameErr(true)
      setMessage({ kind: 'error', text: t('signup.errNicknameFormat') })
      return
    }

    setLoading(true)
    const result = await findAccountByNickname(q)
    setLoading(false)

    if (result.ok) {
      // 계정 존재 여부와 관계없이 성공 응답 표시
      setMessage({ kind: 'success', text: t('findId.sentMessage') })
      // 3초 후 로그인 페이지로 이동
      setTimeout(() => navigate('/'), 3000)
    } else {
      setMessage({ kind: 'error', text: result.error || t('findId.errRequest') })
    }
  }

  return (
    <div className="login-root">

      {/* ── LEFT HERO ── */}
      <div className="hero-panel">
        <div className="hero-gradient" />
        <div className="hero-content">

          <div className="hero-copy">
            <h1 className="hero-title">
              <span className="title-line1">{t('login.tagline1')}</span>
              <span className="title-line2">{t('login.tagline2')}</span>
            </h1>
            <p className="hero-desc">{t('login.heroDesc')}</p>
          </div>

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
            <h2 className="form-title">{t('findId.title')}</h2>
            <p className="form-subtitle">{t('findId.subtitle')}</p>
          </div>

          {message && (
            <Alert kind={message.kind} boxed className="login-alert">{message.text}</Alert>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="field-group">
              <label className="field-label">{t('signup.nickname')}</label>
              <input
                type="text"
                className={`field-input${nicknameErr ? ' invalid' : ''}`}
                placeholder={t('findId.nicknamePh')}
                value={nickname}
                onChange={e => {
                  setNickname(e.target.value)
                  setMessage(null)
                  if (nicknameErr) setNicknameErr(false)
                }}
                onBlur={() => {
                  if (nickname.trim().length > 0 && !nicknameValid) {
                    setNicknameErr(true)
                  }
                }}
                autoComplete="username"
                aria-invalid={nicknameErr}
              />
              {nicknameErr && (
                <p className="field-hint error" role="alert">{t('signup.errNicknameFormat')}</p>
              )}
            </div>

            <button type="submit" className="login-btn" disabled={loading || !nicknameValid}>
              {loading ? (
                <span className="btn-loading"><span className="spinner" />{t('common.loading')}</span>
              ) : (
                <>
                  <span>{t('findId.submitCta')}</span>
                  <svg className="btn-arrow" viewBox="0 0 20 20" fill="none">
                    <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </>
              )}
            </button>
          </form>

          <div className="form-footer">
            <Link to="/find-password" className="form-link">{t('login.findPw')}</Link>
            <span className="footer-sep">|</span>
            <Link to="/signup" className="form-link">{t('login.signup')}</Link>
            <span className="footer-sep">|</span>
            <Link to="/" className="form-link">{t('login.submit')}</Link>
          </div>
        </div>
      </div>

    </div>
  )
}
