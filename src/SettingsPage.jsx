import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import { useTheme } from './contexts/ThemeContext.jsx'
import { logout, getCurrentUser, deleteAccount } from './lib/auth.js'
import { getTeam, teamName, TeamEmblem, menuPath } from './teams.jsx'
import { getCurrentDevice } from './lib/deviceInfo.js'
import { getPrefs, setPref } from './lib/notifyPrefs.js'
import { getPermission, requestPermission, sendTestNotification, isSupported } from './lib/browserPush.js'
import Icon from './components/Icon.jsx'
import './ClubHomePage.css'
import './SettingsPage.css'

// 브라우저 알림 설정 항목 (localStorage/Supabase preference 로 저장)
const NOTI_PREFS = [
  ['email', 'set.notiEmail'],
  ['survey', 'set.notiSurvey'],
  ['news', 'set.notiNews'],
  ['comment', 'set.notiComment'],
  ['empathy', 'set.notiEmpathy'],
  ['notice', 'set.notiNotice'],
]

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']
const APP_VERSION = '1.0.0 (MVP)'

// Minimal line icons for the theme switch (sun / moon / monitor) — no emoji.
const THEME_ICONS = {
  light: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>,
  dark: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  system: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
}
const THEME_OPTIONS = [
  ['light', 'set.themeLight'],
  ['dark', 'set.themeDark'],
  ['system', 'set.themeSystem'],
]

export default function SettingsPage() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { lang, setLang, t } = useLang()
  const { theme, setTheme } = useTheme()
  const user = getCurrentUser()
  const nickname = user?.nickname || '팬'
  const email = user?.email || '-'
  const device = getCurrentDevice()

  const genderLabel = user?.gender === 'male' ? t('signup.genderMale')
    : user?.gender === 'female' ? t('signup.genderFemale')
      : t('set.notSet')
  const ageLabel = user?.ageGroup ? (user.ageGroup === '50+' ? t('signup.age50') : t(`signup.age${user.ageGroup}`)) : t('set.notSet')
  const fmtDate = iso => (iso ? iso.slice(0, 10).replace(/-/g, '.') : '-')

  // 알림 설정(localStorage 영속) + 브라우저 알림 권한 상태
  const [prefs, setPrefs] = useState(getPrefs())
  const [perm, setPerm] = useState(getPermission())
  const [toast, setToast] = useState('')
  // 회원탈퇴
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [withdrawText, setWithdrawText] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>{t('common.notFoundTeam')}</p>
        <button onClick={() => navigate('/team-select')}>{t('common.reselectTeam')}</button>
      </div>
    )
  }

  const themeStyle = { '--team': team.color, '--team-deep': team.colorDeep }
  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 1800) }
  function handleLogout() { logout(); navigate('/') }

  // 알림 설정 토글(영속 저장)
  function togglePref(key) {
    const next = !prefs[key]
    const updated = setPref(key, next)
    setPrefs({ ...updated })
  }

  // 브라우저 알림 켜기/끄기 — 켤 때 권한 요청
  async function toggleBrowser() {
    if (!prefs.browser) {
      let p = getPermission()
      if (p === 'default') { p = await requestPermission(); setPerm(p) }
      else setPerm(p)
      if (p !== 'granted') { flash(t('set.browserBlocked')); return }
      setPrefs({ ...setPref('browser', true) })
    } else {
      setPrefs({ ...setPref('browser', false) })
    }
  }

  async function onTestNotification() {
    let p = getPermission()
    if (p === 'default') { p = await requestPermission(); setPerm(p) }
    if (p !== 'granted') { flash(t('set.browserBlocked')); return }
    const res = await sendTestNotification(t('set.testBody'))
    flash(res.ok ? t('set.testSent') : t('set.browserBlocked'))
  }

  const permLabel = perm === 'granted' ? t('set.permGranted')
    : perm === 'denied' ? t('set.permDenied')
      : perm === 'unsupported' ? t('set.permUnsupported')
        : t('set.permDefault')

  const withdrawPhrase = t('set.withdrawPhrase')
  async function handleWithdraw() {
    if (withdrawText.trim() !== withdrawPhrase) return
    setWithdrawing(true)
    await deleteAccount()
    setWithdrawing(false)
    navigate('/', { replace: true })
  }

  return (
    <div className="ch-root" style={themeStyle}>

      {/* ── Header (shared style) ── */}
      <header className="ch-header">
        <div className="ch-topbar">
          <div className="ch-logo" role="button" tabIndex={0} onClick={() => navigate(`/club/${teamId}`)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/club/${teamId}`) } }}>FANCLUV</div>
          <div className="ch-club">
            <TeamEmblem color={team.color} size={30} className="ch-club-emblem" />
            <span className="ch-club-name">{teamName(team, lang)}</span>
          </div>
          <div className="ch-actions">
            <span className="ch-user">{nickname}{t('common.honorific')}</span>
            <NotificationBell />
            <button className="ch-icon-btn" title={t('common.settings')} aria-label={t('common.settings')} onClick={() => navigate(`/club/${team.id}/settings`)}>
              <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.4"/></svg>
            </button>
            <button className="ch-logout" onClick={handleLogout}>{t('common.logout')}</button>
          </div>
        </div>
        <nav className="ch-nav" aria-label="메인 메뉴">
          {MENU.map(item => (
            <a key={item} href="#" className="ch-nav-item"
              onClick={e => { e.preventDefault(); navigate(menuPath(item, team.id)) }}>{t(NAV_KEYS[item])}</a>
          ))}
        </nav>
      </header>

      {/* ── Main ── */}
      <main className="st-main">
        <section className="st-pagehead">
          <h1>{t('set.title')}</h1>
          <p>{t('set.subtitle')}</p>
        </section>

        {/* Account */}
        <section className="st-card">
          <h2 className="st-card-title">{t('set.account')}</h2>
          <div className="st-profile">
            {user?.avatarUrl
              ? <img className="st-avatar" src={user.avatarUrl} alt="" />
              : <span className="st-avatar" aria-hidden="true">{nickname[0]}</span>}
            <div className="st-profile-info">
              <span className="st-profile-name">{nickname}</span>
              <span className="st-profile-email">{email}</span>
            </div>
          </div>
          <div className="st-row" role="button" tabIndex={0}
            onClick={() => navigate(`/club/${team.id}/profile`)}>
            <span>{t('set.editProfile')}</span>
            <span className="st-chevron" aria-hidden="true">›</span>
          </div>
          <div className="st-row" role="button" tabIndex={0}
            onClick={() => navigate(`/club/${team.id}/password`)}>
            <span>{t('set.changePw')}</span>
            <span className="st-chevron" aria-hidden="true">›</span>
          </div>
        </section>

        {/* Profile info — 이메일 / 가입일 / 성별 / 나이대 (간결) */}
        <section className="st-card">
          <h2 className="st-card-title">{t('set.profileInfo')}</h2>
          <div className="st-row st-row-static"><span>{t('set.infoEmail')}</span><span className="st-muted">{email}</span></div>
          <div className="st-row st-row-static"><span>{t('set.infoJoined')}</span><span className="st-muted">{fmtDate(user?.joinedAt)}</span></div>
          <div className="st-row st-row-static"><span>{t('set.infoGender')}</span><span className="st-muted">{genderLabel}</span></div>
          <div className="st-row st-row-static"><span>{t('set.infoAge')}</span><span className="st-muted">{ageLabel}</span></div>
        </section>

        {/* Account security — current login device (Mock 구조) */}
        <section className="st-card">
          <h2 className="st-card-title">{t('set.security')}</h2>
          <div className="st-device">
            <span className="st-device-ic" aria-hidden="true"><Icon name="users" size={20} /></span>
            <div className="st-device-body">
              <span className="st-device-name">{device.device} · {device.browser}</span>
              <span className="st-device-meta">{device.os} · {device.country}</span>
            </div>
            <span className="st-device-badge">{t('set.currentLogin')}</span>
          </div>
        </section>

        {/* Verification status */}
        <section className="st-card">
          <h2 className="st-card-title">{t('set.verifyTitle')}</h2>
          <div className="st-row st-row-static">
            <span>{t('set.verifyEmail')}</span>
            <span className={`st-vbadge ${user?.isEmailVerified ? 'ok' : 'no'}`}>
              {user?.isEmailVerified ? t('set.verifyDone') : t('set.verifyNot')}
            </span>
          </div>
          <div className="st-row st-row-static">
            <span>{t('set.verifyPhone')}</span>
            <span className="st-vbadge soon">{t('set.verifySoon')}</span>
          </div>
          <div className="st-row st-row-static">
            <span>{t('set.verifyMethod')}</span>
            <span className="st-muted">
              {user?.verificationMethod === 'email'
                ? t('set.verifyMethodEmail')
                : user?.verificationMethod === 'phone'
                  ? t('set.verifyMethodPhone')
                  : t('set.verifyMethodNone')}
            </span>
          </div>
          {!user?.isEmailVerified && (
            <div className="st-row" role="button" tabIndex={0}
              onClick={() => navigate('/verify-email', { state: { reason: 'login' } })}>
              <span>{t('set.verifyGo')}</span>
              <span className="st-chevron" aria-hidden="true">›</span>
            </div>
          )}
          <button className="st-phone-btn" disabled>{t('set.verifyPhoneBtn')}</button>
          <p className="st-phone-note">{t('set.verifyPhoneNote')}</p>
        </section>

        {/* Team */}
        <section className="st-card">
          <h2 className="st-card-title">{t('set.team')}</h2>
          <div className="st-row st-row-static">
            <span className="st-team">
              <TeamEmblem color={team.color} size={26} className="st-team-emblem" />
              {team.name}
            </span>
            <button className="st-btn" onClick={() => navigate('/team-select')}>{t('set.changeTeam')}</button>
          </div>
        </section>

        {/* Language */}
        <section className="st-card">
          <h2 className="st-card-title">{t('set.language')}</h2>
          <div className="st-lang-toggle" role="group" aria-label={t('set.language')}>
            <button className={`st-lang${lang === 'ko' ? ' on' : ''}`} onClick={() => setLang('ko')}>
              {t('set.langKo')}
            </button>
            <button className={`st-lang${lang === 'en' ? ' on' : ''}`} onClick={() => setLang('en')}>
              {t('set.langEn')}
            </button>
          </div>
        </section>

        {/* Theme */}
        <section className="st-card">
          <h2 className="st-card-title">{t('set.theme')}</h2>
          <div className="st-lang-toggle" role="group" aria-label={t('set.theme')}>
            {THEME_OPTIONS.map(([key, label]) => (
              <button
                key={key}
                className={`st-lang st-theme${theme === key ? ' on' : ''}`}
                aria-pressed={theme === key}
                onClick={() => setTheme(key)}>
                <svg className="st-theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {THEME_ICONS[key]}
                </svg>
                <span>{t(label)}</span>
              </button>
            ))}
          </div>
          <p className="st-hint">{t('set.themeHint')}</p>
        </section>

        {/* Browser (push) notification */}
        <section className="st-card">
          <h2 className="st-card-title">{t('set.browserTitle')}</h2>
          <div className="st-row st-row-static">
            <span>{t('set.browserPermission')}</span>
            <span className={`st-vbadge ${perm === 'granted' ? 'ok' : perm === 'denied' ? 'no' : 'soon'}`}>{permLabel}</span>
          </div>
          <div className="st-row st-row-static">
            <span>{t('set.notiBrowser')}</span>
            <button
              className={`st-switch${prefs.browser ? ' on' : ''}`}
              role="switch" aria-checked={prefs.browser} aria-label={t('set.notiBrowser')}
              disabled={!isSupported() || perm === 'denied'}
              onClick={toggleBrowser}>
              <span className="st-switch-knob" />
            </button>
          </div>
          <button className="st-btn st-test-btn" onClick={onTestNotification} disabled={!isSupported()}>
            {t('set.testNotify')}
          </button>
          {perm === 'denied' && <p className="st-hint">{t('set.browserBlockedHint')}</p>}
        </section>

        {/* Notification preferences */}
        <section className="st-card">
          <h2 className="st-card-title">{t('set.notifications')}</h2>
          {NOTI_PREFS.map(([key, label]) => (
            <div key={key} className="st-row st-row-static">
              <span>{t(label)}</span>
              <button
                className={`st-switch${prefs[key] ? ' on' : ''}`}
                role="switch" aria-checked={prefs[key]} aria-label={t(label)}
                onClick={() => togglePref(key)}>
                <span className="st-switch-knob" />
              </button>
            </div>
          ))}
        </section>

        {/* App info */}
        <section className="st-card">
          <h2 className="st-card-title">{t('set.appInfo')}</h2>
          <div className="st-row st-row-static">
            <span>{t('set.appVersion')}</span>
            <span className="st-muted">{APP_VERSION}</span>
          </div>
          <div className="st-row" role="button" tabIndex={0} onClick={() => navigate(`/club/${team.id}/about`)}>
            <span>{t('set.about')}</span>
            <span className="st-chevron" aria-hidden="true">›</span>
          </div>
          <div className="st-row" role="button" tabIndex={0} onClick={() => navigate(`/club/${team.id}/privacy`)}>
            <span>{t('set.privacy')}</span>
            <span className="st-chevron" aria-hidden="true">›</span>
          </div>
          <div className="st-row" role="button" tabIndex={0} onClick={() => navigate(`/club/${team.id}/terms`)}>
            <span>{t('set.terms')}</span>
            <span className="st-chevron" aria-hidden="true">›</span>
          </div>
        </section>

        {/* Logout */}
        <button className="st-logout" onClick={handleLogout}>{t('set.logout')}</button>

        {/* Withdraw */}
        <button className="st-withdraw" onClick={() => { setWithdrawText(''); setShowWithdraw(true) }}>
          {t('set.withdraw')}
        </button>
      </main>

      {/* 회원탈퇴 확인 모달 */}
      {showWithdraw && (
        <div className="st-modal-overlay" role="dialog" aria-modal="true" aria-label={t('set.withdrawTitle')}
          onClick={e => { if (e.target === e.currentTarget) setShowWithdraw(false) }}>
          <div className="st-modal">
            <h3 className="st-modal-title">{t('set.withdrawTitle')}</h3>
            <p className="st-modal-desc">{t('set.withdrawDesc')}</p>
            <p className="st-modal-phrase">{t('set.withdrawPrompt', { phrase: withdrawPhrase })}</p>
            <input
              type="text"
              className="st-modal-input"
              placeholder={withdrawPhrase}
              value={withdrawText}
              onChange={e => setWithdrawText(e.target.value)}
              autoFocus
            />
            <div className="st-modal-actions">
              <button className="st-modal-cancel" onClick={() => setShowWithdraw(false)}>{t('common.cancel')}</button>
              <button
                className="st-modal-confirm"
                disabled={withdrawText.trim() !== withdrawPhrase || withdrawing}
                onClick={handleWithdraw}>
                {withdrawing ? t('set.withdrawing') : t('set.withdrawConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="st-toast" role="status">{toast}</div>}
    </div>
  )
}
