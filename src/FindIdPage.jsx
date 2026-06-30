import { useState } from 'react'
import { Link } from 'react-router-dom'
import { findAccountByHint } from './lib/auth.js'
import { useLang } from './contexts/LanguageContext.jsx'
import './SignupPage.css'
import './RecoveryPages.css'

export default function FindIdPage() {
  const { t } = useLang()
  const [hint, setHint] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null) // { maskedEmail } once found

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!hint.trim()) { setError(t('findId.errInput')); return }
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      const res = findAccountByHint(hint)
      if (res.ok) {
        setResult({ maskedEmail: res.maskedEmail })
      } else {
        setError(t('findId.notFound'))
      }
    }, 700)
  }

  function reset() {
    setResult(null)
    setHint('')
    setError('')
  }

  return (
    <div className="signup-root">
      <div className="signup-card">

        <div className="signup-brand">FANCLUV</div>

        <div className="signup-header">
          <h1 className="signup-title">{t('findId.title')}</h1>
          <p className="signup-subtitle">{t('findId.subtitle')}</p>
        </div>

        {result ? (
          <div className="rec-result" role="status">
            <span className="rec-result-icon" aria-hidden="true">✓</span>
            <p className="rec-result-label">{t('findId.resultLabel')}</p>
            <p className="rec-result-value">{result.maskedEmail}</p>
            <div className="rec-result-actions">
              <Link to="/" className="su-btn rec-btn-link">{t('findId.goLogin')}</Link>
              <button type="button" className="rec-btn-ghost" onClick={reset}>{t('findId.again')}</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="su-field">
              <label className="su-label">{t('findId.inputLabel')}</label>
              <input
                type="text"
                className="su-input"
                placeholder={t('findId.inputPh')}
                value={hint}
                onChange={e => { setHint(e.target.value); setError('') }}
                autoComplete="off"
              />
            </div>

            {error && <div className="su-error" role="alert">⚠ {error}</div>}

            <button type="submit" className="su-btn" disabled={loading}>
              {loading ? (
                <span className="su-btn-loading"><span className="su-spinner" />{t('findId.loading')}</span>
              ) : (
                <span>{t('findId.submit')}</span>
              )}
            </button>
          </form>
        )}

        <div className="rec-links">
          <Link to="/" className="signup-login-link">{t('find.backToLogin')}</Link>
          <span className="rec-sep">·</span>
          <Link to="/find-password" className="signup-login-link">{t('login.findPw')}</Link>
        </div>
      </div>

      <Link to="/" className="signup-home-link">{t('common.backToHome')}</Link>
    </div>
  )
}
