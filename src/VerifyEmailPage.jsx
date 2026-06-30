import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useLang } from './contexts/LanguageContext.jsx'
import { getCurrentUser, verifyEmail, logout } from './lib/auth.js'
import './SignupPage.css'
import './RecoveryPages.css'

// Mock email verification. Reached after signup ("we sent a mail") or after a
// login attempt on an unverified account ("verification required"). Pressing
// the button flips isEmailVerified in the mock store, then continues to team
// selection (or the user's club if already chosen).
export default function VerifyEmailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useLang()
  const reason = location.state?.reason === 'login' ? 'login' : 'signup'

  const user = getCurrentUser()
  const [done, setDone] = useState(false)

  if (!user) {
    // No session → nothing to verify; send back to login.
    navigate('/', { replace: true })
    return null
  }

  function handleVerify() {
    verifyEmail(user.email)
    setDone(true)
  }

  function goNext() {
    const team = getCurrentUser()?.selectedTeam
    navigate(team ? `/club/${team}` : '/team-select', { replace: true })
  }

  function backToLogin() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="signup-root">
      <div className="signup-card">
        <div className="signup-brand">FANCLUV</div>

        {done ? (
          <div className="rec-result" role="status">
            <span className="rec-result-icon" aria-hidden="true">✓</span>
            <p className="rec-result-label">{t('verify.doneLabel')}</p>
            <p className="rec-result-value">{user.email}</p>
            <div className="rec-result-actions">
              <button type="button" className="su-btn rec-btn-link" onClick={goNext}>{t('verify.goTeam')}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="signup-header">
              <span className="ve-badge" aria-hidden="true">✉</span>
              <h1 className="signup-title">{reason === 'login' ? t('verify.needTitle') : t('verify.sentTitle')}</h1>
              <p className="signup-subtitle">{t('verify.toEmail', { email: user.email })}</p>
            </div>

            <p className="ve-note">{t('verify.mvpNote')}</p>

            <button type="button" className="su-btn" onClick={handleVerify}>{t('verify.completeBtn')}</button>

            <p className="signup-login-row">
              <Link to="/" className="signup-login-link" onClick={e => { e.preventDefault(); backToLogin() }}>
                {t('find.backToLogin')}
              </Link>
            </p>
          </>
        )}
      </div>

      <Link to="/" className="signup-home-link" onClick={e => { e.preventDefault(); backToLogin() }}>
        {t('common.backToHome')}
      </Link>
    </div>
  )
}
