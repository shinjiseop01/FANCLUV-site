import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useLang } from './contexts/LanguageContext.jsx'
import Icon from './components/Icon.jsx'
import { getCurrentUser, verifyEmail, logout } from './lib/auth.js'
import './SignupPage.css'
import './RecoveryPages.css'

// Email verification notice. Reached after signup or a login attempt on an
// unverified account. There is NO in-app "complete verification" bypass — the
// user must click the link in the real verification email. This page only lets
// them re-send that email (server-side); it never flips the verified flag.
export default function VerifyEmailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useLang()
  const reason = location.state?.reason === 'login' ? 'login' : 'signup'

  const user = getCurrentUser()
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [err, setErr] = useState('')

  if (!user) {
    // No session → nothing to verify; send back to login.
    navigate('/', { replace: true })
    return null
  }

  async function handleResend() {
    if (resending) return
    setResending(true); setErr(''); setResent(false)
    const res = await verifyEmail(user.email) // 실제 확인 메일 재전송(우회 아님)
    setResending(false)
    if (res.ok) setResent(true)
    else setErr(res.error || t('verify.resendFail'))
  }

  function backToLogin() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="signup-root">
      <div className="signup-card">
        <div className="signup-brand">FANCLUV</div>

        <div className="signup-header">
          <span className="ve-badge" aria-hidden="true"><Icon name="mail" size={22} /></span>
          <h1 className="signup-title">{reason === 'login' ? t('verify.needTitle') : t('verify.sentTitle')}</h1>
          <p className="signup-subtitle">{t('verify.toEmail', { email: user.email })}</p>
        </div>

        <p className="ve-note">{t('verify.linkNote')}</p>

        <button type="button" className="su-btn" onClick={handleResend} disabled={resending}>
          {resending ? t('verify.resending') : t('verify.resendBtn')}
        </button>

        {resent && (
          <p className="su-verified" role="status"><Icon name="check" size={14} className="fc-inline-ico" />{t('verify.resent')}</p>
        )}
        {err && (
          <p className="su-code-msg error" role="alert">{err}</p>
        )}

        <p className="signup-login-row">
          <Link to="/" className="signup-login-link" onClick={e => { e.preventDefault(); backToLogin() }}>
            {t('find.backToLogin')}
          </Link>
        </p>
      </div>

      <Link to="/" className="signup-home-link" onClick={e => { e.preventDefault(); backToLogin() }}>
        {t('common.backToHome')}
      </Link>
    </div>
  )
}
