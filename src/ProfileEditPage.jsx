import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import { logout, getCurrentUser, updateAvatar, changeNickname, nicknameChangeInfo } from './lib/auth.js'
import { getTeam, TeamEmblem, menuPath } from './teams.jsx'
import Avatar from './components/Avatar.jsx'
import './ClubHomePage.css'
import './SettingsPage.css'
import './AccountPages.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

function formatDate(iso) {
  if (!iso) return ''
  return iso.slice(0, 10).replace(/-/g, '.')
}

export default function ProfileEditPage() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { t } = useLang()
  const fileRef = useRef(null)

  const user = getCurrentUser()
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || null)
  const [nickname, setNickname] = useState(user?.nickname || '')
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const info = nicknameChangeInfo()

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

  function onPickFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result
      setAvatarUrl(url)
      updateAvatar(url)
      setOkMsg(t('profile.imageUpdated'))
      setError('')
    }
    reader.readAsDataURL(file)
  }

  function removeImage() {
    setAvatarUrl(null)
    updateAvatar(null)
    setOkMsg(t('profile.imageRemoved'))
  }

  function saveNickname() {
    setError(''); setOkMsg('')
    const res = changeNickname(nickname)
    if (res.ok) {
      setOkMsg(t('profile.nicknameUpdated'))
    } else {
      setError(res.nextChangeAt
        ? t('profile.nicknameLockedUntil', { date: formatDate(res.nextChangeAt) })
        : res.error)
    }
  }

  return (
    <div className="ch-root" style={themeStyle}>
      <header className="ch-header">
        <div className="ch-topbar">
          <div className="ch-logo" onClick={() => navigate('/team-select')}>FANCLUV</div>
          <div className="ch-club">
            <TeamEmblem color={team.color} size={30} className="ch-club-emblem" />
            <span className="ch-club-name">{team.name}</span>
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
        <h1 className="ac-title">{t('profile.title')}</h1>

        {/* Profile image */}
        <section className="st-card">
          <h2 className="st-card-title">{t('profile.image')}</h2>
          <div className="ac-avatar-row">
            <Avatar name={nickname} src={avatarUrl} size={84} />
            <div className="ac-avatar-actions">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
              <button className="st-btn" onClick={() => fileRef.current?.click()}>{t('profile.changeImage')}</button>
              {avatarUrl && <button className="ac-text-btn" onClick={removeImage}>{t('profile.removeImage')}</button>}
            </div>
          </div>
        </section>

        {/* Nickname */}
        <section className="st-card">
          <h2 className="st-card-title">{t('profile.nickname')}</h2>
          <input
            type="text"
            className="ac-input"
            value={nickname}
            onChange={e => { setNickname(e.target.value); setError(''); setOkMsg('') }}
            maxLength={20}
            disabled={!info.canChange}
          />
          <p className="ac-hint">
            {info.canChange
              ? t('profile.nicknameRule')
              : t('profile.nicknameLockedUntil', { date: formatDate(info.nextChangeAt) })}
          </p>
          <button className="ac-save-btn" onClick={saveNickname} disabled={!info.canChange || !nickname.trim() || nickname.trim() === user?.nickname}>
            {t('profile.saveNickname')}
          </button>
        </section>

        {error && <div className="ac-msg error" role="alert">⚠ {error}</div>}
        {okMsg && <div className="ac-msg ok" role="status">✓ {okMsg}</div>}
      </main>
    </div>
  )
}
