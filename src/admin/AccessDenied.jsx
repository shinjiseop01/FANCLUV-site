import { useNavigate } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext.jsx'
import { isAuthenticated, getCurrentUser } from '../lib/auth.js'
import './admin.css'

// Shown when a non-admin reaches an /admin route.
export default function AccessDenied() {
  const navigate = useNavigate()
  const { t } = useLang()

  function goHome() {
    const team = getCurrentUser()?.selectedTeam
    if (isAuthenticated() && team) navigate(`/club/${team}`)
    else if (isAuthenticated()) navigate('/team-select')
    else navigate('/')
  }

  return (
    <div className="adm-denied">
      <div className="adm-denied-inner">
        <div className="adm-denied-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" />
          </svg>
        </div>
        <h1 className="adm-denied-title">{t('admin.deniedTitle')}</h1>
        <p className="adm-denied-msg">{t('admin.deniedMsg')}</p>
        <button className="adm-denied-btn" onClick={goHome}>{t('admin.deniedHome')}</button>
      </div>
    </div>
  )
}
