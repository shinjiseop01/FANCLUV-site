import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import Icon from './components/Icon.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import { logout, getCurrentUser, changePassword } from './lib/auth.js'
import { getTeam, teamName, TeamEmblem, menuPath } from './teams.jsx'
import './ClubHomePage.css'
import './SettingsPage.css'
import './AccountPages.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

export default function ChangePasswordPage() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { lang, t } = useLang()
  const user = getCurrentUser()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>{t('common.notFoundTeam')}</p>
        <button onClick={() => navigate('/team-select')}>{t('common.reselectTeam')}</button>
      </div>
    )
  }

  const themeStyle = { '--team': team.color, '--team-deep': team.colorDeep }
  const NICKNAME = user?.nickname || '팬'

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!current) { setError(t('pw.errCurrent')); return }
    if (!next) { setError(t('pw.errNew')); return }
    if (next.length < 4) { setError(t('pw.errLen')); return }
    if (next !== confirm) { setError(t('pw.errMatch')); return }
    if (next === current) { setError(t('pw.errSame')); return }
    const res = await changePassword(current, next)
    if (res.ok) {
      setDone(true)
    } else {
      setError(res.error)
    }
  }

  return (
    <div className="ch-root" style={themeStyle}>
      <header className="ch-header">
        <div className="ch-topbar">
          <div className="ch-logo" role="button" tabIndex={0} onClick={() => navigate(`/club/${teamId}`)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/club/${teamId}`) } }}>FANCLUV</div>
          <div className="ch-club">
            <TeamEmblem color={team.color} size={30} className="ch-club-emblem" />
            <span className="ch-club-name">{teamName(team, lang)}</span>
          </div>
          <div className="ch-actions">
            <span className="ch-user">{NICKNAME}{t('common.honorific')}</span>
            <NotificationBell />
            <button className="ch-icon-btn" title={t('common.settings')} aria-label={t('common.settings')} onClick={() => navigate(`/club/${team.id}/settings`)}>
              <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.4"/></svg>
            </button>
            <button className="ch-logout" onClick={() => { logout(); navigate('/') }}>{t('common.logout')}</button>
          </div>
        </div>
        <nav className="ch-nav" aria-label="메인 메뉴">
          {MENU.map(item => (
            <a key={item} href="#" className="ch-nav-item"
              onClick={e => { e.preventDefault(); navigate(menuPath(item, team.id)) }}>{t(NAV_KEYS[item])}</a>
          ))}
        </nav>
      </header>

      <main className="ac-main">
        <button className="ac-back" onClick={() => navigate(`/club/${team.id}/settings`)}>{t('common.back')}</button>
        <h1 className="ac-title">{t('pw.title')}</h1>

        {done ? (
          <section className="st-card ac-done">
            <span className="ac-done-icon" aria-hidden="true"><Icon name="successCircle" size={26} /></span>
            <h2>{t('pw.doneTitle')}</h2>
            <p>{t('pw.doneDesc')}</p>
            <button className="ac-save-btn" onClick={() => navigate(`/club/${team.id}/settings`)}>{t('pw.backSettings')}</button>
          </section>
        ) : (
          <form className="st-card" onSubmit={handleSubmit} noValidate>
            <div className="ac-field">
              <label>{t('pw.current')}</label>
              <input type="password" className="ac-input" value={current}
                onChange={e => { setCurrent(e.target.value); setError('') }} autoComplete="current-password" />
            </div>
            <div className="ac-field">
              <label>{t('pw.new')}</label>
              <input type="password" className="ac-input" value={next}
                onChange={e => { setNext(e.target.value); setError('') }} autoComplete="new-password" />
            </div>
            <div className="ac-field">
              <label>{t('pw.confirm')}</label>
              <input type="password" className="ac-input" value={confirm}
                onChange={e => { setConfirm(e.target.value); setError('') }} autoComplete="new-password" />
            </div>
            {error && <div className="ac-msg error" role="alert"><Icon name="warningTriangle" size={14} className="fc-inline-ico" />{error}</div>}
            <button type="submit" className="ac-save-btn">{t('pw.submit')}</button>
          </form>
        )}
      </main>
    </div>
  )
}
