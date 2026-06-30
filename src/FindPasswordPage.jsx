import { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from './lib/auth.js'
import { useLang } from './contexts/LanguageContext.jsx'
import { useToast } from './contexts/ToastContext.jsx'
import './SignupPage.css'
import './RecoveryPages.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function FindPasswordPage() {
  const { t } = useLang()
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sentTo, setSentTo] = useState(null) // email once reset is "sent"

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError(t('findPw.errEmail')); return }
    if (!EMAIL_RE.test(email.trim())) { setError(t('findPw.errFormat')); return }
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      const res = requestPasswordReset(email)
      if (res.ok) {
        setSentTo(email.trim())
        toast(t('findPw.toastSent'), { icon: '✉' })
      } else {
        setError(t('findPw.notFound'))
      }
    }, 700)
  }

  function reset() {
    setSentTo(null)
    setEmail('')
    setError('')
  }

  return (
    <div className="signup-root">
      <div className="signup-card">

        <div className="signup-brand">FANCLUV</div>

        <div className="signup-header">
          <h1 className="signup-title">{t('findPw.title')}</h1>
          <p className="signup-subtitle">{t('findPw.subtitle')}</p>
        </div>

        {sentTo ? (
          <div className="rec-result" role="status">
            <span className="rec-result-icon" aria-hidden="true">✉</span>
            <p className="rec-result-label">{t('findPw.done')}</p>
            <p className="rec-result-value">{sentTo}</p>
            <p className="rec-result-note">{t('findPw.doneDesc')}</p>
            <div className="rec-result-actions">
              <Link to="/" className="su-btn rec-btn-link">{t('findId.goLogin')}</Link>
              <button type="button" className="rec-btn-ghost" onClick={reset}>{t('findPw.again')}</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="su-field">
              <label className="su-label">{t('findPw.inputLabel')}</label>
              <input
                type="email"
                className="su-input"
                placeholder={t('findPw.inputPh')}
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                autoComplete="email"
              />
            </div>

            {error && <div className="su-error" role="alert">⚠ {error}</div>}

            <button type="submit" className="su-btn" disabled={loading}>
              {loading ? (
                <span className="su-btn-loading"><span className="su-spinner" />{t('findPw.loading')}</span>
              ) : (
                <span>{t('findPw.submit')}</span>
              )}
            </button>
          </form>
        )}

        <div className="rec-links">
          <Link to="/" className="signup-login-link">{t('find.backToLogin')}</Link>
          <span className="rec-sep">·</span>
          <Link to="/find-id" className="signup-login-link">{t('login.findId')}</Link>
        </div>
      </div>

      <Link to="/" className="signup-home-link">{t('common.backToHome')}</Link>
    </div>
  )
}
