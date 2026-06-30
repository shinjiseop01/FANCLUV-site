import { useNavigate } from 'react-router-dom'
import { useLang } from './contexts/LanguageContext.jsx'
import { isAuthenticated, getCurrentUser } from './lib/auth.js'

// Friendly 404 for unknown URLs. Sends the user home — to their club if a
// team is already selected, otherwise to login.
export default function NotFoundPage() {
  const navigate = useNavigate()
  const { t } = useLang()

  function goHome() {
    const team = getCurrentUser()?.selectedTeam
    if (isAuthenticated() && team) navigate(`/club/${team}`)
    else navigate('/')
  }

  return (
    <div className="fc-404">
      <div className="fc-404-inner">
        <div className="fc-404-brand">FANCLUV</div>
        <div className="fc-404-code">404</div>
        <h1 className="fc-404-title">{t('nf.heading')}</h1>
        <p className="fc-404-msg">{t('nf.msg')}</p>
        <button className="fc-404-btn" onClick={goHome}>{t('nf.home')}</button>
      </div>
    </div>
  )
}
