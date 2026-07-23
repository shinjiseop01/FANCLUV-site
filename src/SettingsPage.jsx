import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import { useToast } from './contexts/ToastContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import LazyImage from './components/LazyImage.jsx'
import { useTheme } from './contexts/ThemeContext.jsx'
import {
  logout, getCurrentUser, deleteAccount, identityInfo, isIdentityVerificationEnabled,
  changeAgeGroup, changeGender, changeNickname, nicknameChangeInfo, updateAvatar,
} from './lib/auth.js'
import { getTeamChangeStatus, fanChangeTeam } from './lib/teamChangeRepo.js'
import { teamChangeErrorKey, teamChangeUiState, nextWindowText } from './lib/teamChangePolicy.js'
import { IDENTITY_AGENCY_LABELS } from './lib/identity/identityAdapter.js'
import { getTeam, teamName, TeamEmblem, menuPath, TEAMS } from './teams.jsx'
import { getCurrentDevice } from './lib/deviceInfo.js'
import { getPrefs, setPref, loadServerPrefs } from './lib/notifyPrefs.js'
import { getPermission, requestPermission, sendTestNotification, isSupported } from './lib/browserPush.js'
import { useNicknameCheck } from './lib/useNicknameCheck.js'
import { saveAvatar, clearAvatar, validateImageFile } from './lib/avatarStorage.js'
import NicknameStatus from './components/NicknameStatus.jsx'
import Icon from './components/Icon.jsx'
import './ClubHomePage.css'
import './SettingsPage.css'

// 알림 설정 — 성격별 3개 그룹으로 묶어 표시(UI 단순화).
// 내부적으로는 기존 개별 pref(comment/empathy/news/survey/notice)를 그대로 유지하고
// (브라우저 알림 로직 browserPush.isEventEnabled 가 개별 키를 사용), UI 에서만 그룹으로 토글한다.
// → 그룹 OFF 시 그룹 내 개별 알림이 모두 OFF 로 자동 매핑된다.
const NOTI_GROUPS = [
  { key: 'activity', labelKey: 'set.notiGroupActivity', descKey: 'set.notiGroupActivityDesc', members: ['comment', 'empathy'] },
  { key: 'content', labelKey: 'set.notiGroupContent', descKey: 'set.notiGroupContentDesc', members: ['news', 'survey'] },
  { key: 'notice', labelKey: 'set.notiGroupNotice', descKey: 'set.notiGroupNoticeDesc', members: ['notice'] },
]

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']
const APP_VERSION = '1.0.0 (MVP)'
// 나이대/성별 옵션 — 회원가입/온보딩과 동일하게 유지.
const AGE_GROUPS = [['10', 'signup.age10'], ['20', 'signup.age20'], ['30', 'signup.age30'], ['40', 'signup.age40'], ['50+', 'signup.age50']]
const GENDERS = [['male', 'signup.genderMale'], ['female', 'signup.genderFemale'], ['na', 'signup.genderNA']]

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
  const email = user?.email || '-'
  const device = getCurrentDevice()
  const idInfo = identityInfo(user) // 본인인증 여부/시각/기관 (개인정보 없음)
  const fileRef = useRef(null)

  // ── 내 프로필 (읽기 전용 표시값 + 인라인 수정) ──
  const [editing, setEditing] = useState(false)
  const [nickState, setNickState] = useState(user?.nickname || '')       // 저장된 닉네임(표시)
  const [genderState, setGenderState] = useState(user?.gender || '')     // 저장된 성별(표시)
  const [ageGroup, setAgeGroupState] = useState(user?.ageGroup || '')    // 저장된 나이대(표시)
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || null)
  // 수정 폼 값
  const [nickEdit, setNickEdit] = useState(user?.nickname || '')
  const [genderEdit, setGenderEdit] = useState(user?.gender || '')
  const [ageEdit, setAgeEdit] = useState(user?.ageGroup || '')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState(null)
  // 응원팀 시즌 변경(정책) — 상태/모달
  const [teamStatus, setTeamStatus] = useState(null)
  const [teamModal, setTeamModal] = useState(false)   // false | 'pick' | 'confirm'
  const [teamPick, setTeamPick] = useState(null)
  const [teamBusy, setTeamBusy] = useState(false)
  useEffect(() => { getTeamChangeStatus().then(setTeamStatus) }, [])

  const nickInfo = nicknameChangeInfo() // { canChange, nextChangeAt }
  const nickCheck = useNicknameCheck(nickEdit, { exceptId: user?.id, exceptEmail: user?.email })

  // 알림 설정(localStorage 영속) + 브라우저 알림 권한 상태
  const [prefs, setPrefs] = useState(getPrefs())
  const [perm, setPerm] = useState(getPermission())
  const toast = useToast()
  // 서버(profiles.notification_prefs) 설정을 불러와 로컬 캐시/화면에 동기화.
  useEffect(() => { loadServerPrefs().then(p => setPrefs({ ...p })) }, [])
  // 회원탈퇴
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [withdrawText, setWithdrawText] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)

  const genderLabel = genderState === 'male' ? t('signup.genderMale')
    : genderState === 'female' ? t('signup.genderFemale')
      : genderState === 'na' ? t('signup.genderNA')
        : t('set.notSet')
  const ageLabel = ageGroup ? (ageGroup === '50+' ? t('signup.age50') : t(`signup.age${ageGroup}`)) : t('set.notSet')
  const fmtDate = iso => (iso ? iso.slice(0, 10).replace(/-/g, '.') : '-')

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>{t('common.notFoundTeam')}</p>
        <button onClick={() => navigate('/team-select')}>{t('common.reselectTeam')}</button>
      </div>
    )
  }

  const themeStyle = { '--team': team.color, '--team-deep': team.colorDeep }
  function flash(msg, type = 'info') { toast[type === 'error' ? 'error' : 'info'](msg) }
  function handleLogout() { logout(); navigate('/', { replace: true }) }

  // ── 프로필 수정 열기/닫기 ──
  function openEdit() {
    setNickEdit(nickState); setGenderEdit(genderState); setAgeEdit(ageGroup)
    setProfileMsg(null); setEditing(true)
  }
  function cancelEdit() { setProfileMsg(null); setEditing(false) }

  const nickChanged = nickEdit.trim() !== (nickState || '')
  const nickBlocked = nickChanged && (!nickInfo.canChange || nickCheck.state !== 'available')
  const anyChanged = nickChanged
    || (genderEdit || '') !== (genderState || '')
    || ageEdit !== ageGroup

  async function onSaveProfile() {
    setProfileMsg(null); setProfileSaving(true)
    // 1) 닉네임 (변경 시에만 — 90일 쿨다운/검증은 changeNickname 이 처리)
    if (nickChanged) {
      const r = await changeNickname(nickEdit.trim())
      if (!r.ok) { setProfileSaving(false); setProfileMsg({ ok: false, text: r.nextChangeAt ? t('profile.nicknameLocked') : r.error }); return }
      setNickState(nickEdit.trim())
    }
    // 2) 성별
    if ((genderEdit || '') !== (genderState || '')) {
      const r = await changeGender(genderEdit || null)
      if (!r.ok) { setProfileSaving(false); setProfileMsg({ ok: false, text: r.error || t('set.ageFail') }); return }
      setGenderState(genderEdit || '')
    }
    // 3) 나이대
    if (ageEdit !== ageGroup) {
      const r = await changeAgeGroup(ageEdit)
      if (!r.ok) { setProfileSaving(false); setProfileMsg({ ok: false, text: r.error || t('set.ageFail') }); return }
      setAgeGroupState(ageEdit)
    }
    setProfileSaving(false)
    // 저장 성공 → 항상 수정 모드 종료(읽기 모드로).
    setEditing(false)
    flash(t('set.profileSaved'))
  }

  // ── 응원팀 시즌 변경(정책 강제는 서버 RPC) ──
  const teamUi = teamChangeUiState(teamStatus)
  const nextWindow = nextWindowText(teamStatus, fmtDate)
  async function confirmTeamChange() {
    if (!teamPick || teamBusy) return
    setTeamBusy(true)
    const r = await fanChangeTeam(teamPick)
    setTeamBusy(false)
    if (!r.ok) { setTeamModal(false); flash(t(teamChangeErrorKey(r.code)), 'error'); return }
    setTeamModal(false)
    flash(t('team.changed'))                              // 즉시 성공 안내
    navigate(`/club/${teamPick}/settings`, { replace: true })  // 새 팀 context 로 반영
  }

  // ── 프로필 사진 (인라인 변경/제거) ──
  function onPickAvatar(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const v = validateImageFile(file)
    if (!v.ok) { setProfileMsg({ ok: false, text: v.code === 'size' ? t('profile.imageErrSize') : t('profile.imageErrType') }); return }
    saveAndSetAvatar(file)
  }
  async function saveAndSetAvatar(blob) {
    setProfileSaving(true)
    const res = await saveAvatar(blob)
    if (res.ok) { await updateAvatar(res.url); setAvatarUrl(res.url); setProfileMsg(null) }
    else setProfileMsg({ ok: false, text: res.error || t('profile.imageErrType') })
    setProfileSaving(false)
  }
  async function onRemoveAvatar() {
    setProfileSaving(true)
    await clearAvatar(); await updateAvatar(null); setAvatarUrl(null)
    setProfileSaving(false)
  }

  // 알림 그룹 토글 — 그룹 내 개별 알림 pref 를 모두 같은 값으로 설정(내부 개별 로직 유지·자동 매핑).
  // 그룹 표시 상태 = 구성원 중 하나라도 ON 이면 ON.
  const groupOn = group => group.members.some(m => prefs[m])
  function toggleGroup(group) {
    const next = !groupOn(group)
    let updated
    for (const m of group.members) updated = setPref(m, next)
    if (updated) setPrefs({ ...updated })
  }
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
            <span className="ch-user">{nickState}{t('common.honorific')}</span>
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

        {/* ① 내 프로필 */}
        <section className="st-card">
          <h2 className="st-card-title">{t('set.myProfile')}</h2>
          <div className="st-profile">
            {avatarUrl
              ? <LazyImage className="st-avatar" src={avatarUrl} alt=""
                  placeholder={<span className="st-avatar" aria-hidden="true">{(nickState || 'F')[0]}</span>} />
              : <span className="st-avatar" aria-hidden="true">{(nickState || 'F')[0]}</span>}
            <div className="st-profile-info">
              <span className="st-profile-name">{nickState}</span>
              <span className="st-profile-email">{email}</span>
            </div>
          </div>

          {!editing ? (
            <>
              <div className="st-row st-row-static"><span>{t('set.team')}</span>
                <span className="st-team"><TeamEmblem color={team.color} size={22} className="st-team-emblem" />{teamName(team, lang)}</span></div>
              {/* 응원팀 시즌 변경 */}
              <div className="st-team-change">
                {teamUi.canChange ? (
                  <button className="st-btn-full" onClick={() => { setTeamPick(null); setTeamModal('pick') }}>{t('team.changeBtn')}</button>
                ) : (
                  <p className="st-team-reason">
                    {t(teamUi.reasonKey)}
                    {nextWindow
                      ? <><br /><span className="st-muted">{t('team.nextWindow', { range: nextWindow })}</span></>
                      : <><br /><span className="st-muted">{t('team.nextWindowTba')}</span></>}
                  </p>
                )}
              </div>
              <div className="st-row st-row-static"><span>{t('set.infoGender')}</span><span className="st-muted">{genderLabel}</span></div>
              <div className="st-row st-row-static"><span>{t('set.infoAge')}</span><span className="st-muted">{ageLabel}</span></div>
              <div className="st-row st-row-static"><span>{t('set.infoJoined')}</span><span className="st-muted">{fmtDate(user?.joinedAt)}</span></div>
              <button className="st-btn-full" onClick={openEdit}>{t('set.editProfile')}</button>
            </>
          ) : (
            <div className="st-edit">
              {/* 프로필 사진 */}
              <div className="st-edit-avatar">
                {avatarUrl
                  ? <LazyImage className="st-avatar" src={avatarUrl} alt=""
                      placeholder={<span className="st-avatar" aria-hidden="true">{(nickEdit || 'F')[0]}</span>} />
                  : <span className="st-avatar" aria-hidden="true">{(nickEdit || 'F')[0]}</span>}
                <div className="st-edit-avatar-actions">
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPickAvatar} />
                  <button type="button" className="st-btn" onClick={() => fileRef.current?.click()} disabled={profileSaving}>
                    {avatarUrl ? t('profile.replaceImage') : t('profile.changeImage')}
                  </button>
                  {avatarUrl && <button type="button" className="st-text-btn" onClick={onRemoveAvatar} disabled={profileSaving}>{t('profile.removeImage')}</button>}
                </div>
              </div>

              {/* 닉네임 */}
              <div className="st-edit-field">
                <label className="st-edit-label">{t('profile.nickname')}</label>
                <input type="text" className="st-edit-input" value={nickEdit} maxLength={12}
                  disabled={!nickInfo.canChange}
                  onChange={e => { setNickEdit(e.target.value); setProfileMsg(null) }} />
                {!nickInfo.canChange
                  ? <p className="st-edit-hint">{t('profile.nicknameLocked')}</p>
                  : (nickChanged ? <NicknameStatus status={nickCheck} /> : null)}
              </div>

              {/* 성별 */}
              <div className="st-edit-field">
                <label className="st-edit-label">{t('set.infoGender')}</label>
                <div className="st-age-chips" role="group" aria-label={t('set.infoGender')}>
                  {GENDERS.map(([val, key]) => (
                    <button type="button" key={val}
                      className={`st-age-chip${genderEdit === val ? ' on' : ''}`}
                      aria-pressed={genderEdit === val}
                      onClick={() => { setGenderEdit(g => (g === val ? '' : val)); setProfileMsg(null) }}>
                      {t(key)}
                    </button>
                  ))}
                </div>
              </div>

              {/* 나이대 */}
              <div className="st-edit-field">
                <label className="st-edit-label">{t('set.infoAge')}</label>
                <div className="st-age-chips" role="group" aria-label={t('set.infoAge')}>
                  {AGE_GROUPS.map(([val, key]) => (
                    <button type="button" key={val}
                      className={`st-age-chip${ageEdit === val ? ' on' : ''}`}
                      aria-pressed={ageEdit === val}
                      onClick={() => { setAgeEdit(val); setProfileMsg(null) }}>
                      {t(key)}
                    </button>
                  ))}
                </div>
              </div>

              {profileMsg && <p className={`st-age-msg ${profileMsg.ok ? 'ok' : 'err'}`} role="status" aria-live="polite">{profileMsg.text}</p>}

              <div className="st-edit-actions">
                <button type="button" className="st-edit-cancel" onClick={cancelEdit}>{t('common.cancel')}</button>
                <button type="button" className="st-edit-save" onClick={onSaveProfile} disabled={profileSaving || nickBlocked || !anyChanged}>
                  {profileSaving ? t('set.ageSaving') : t('set.saveBtn')}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ② 앱 설정 (언어 · 테마 · 브라우저 알림 · 알림 설정) */}
        <section className="st-card">
          <h2 className="st-card-title">{t('set.appSettings')}</h2>

          <h3 className="st-subsec">{t('set.language')}</h3>
          <div className="st-lang-toggle" role="group" aria-label={t('set.language')}>
            <button className={`st-lang${lang === 'ko' ? ' on' : ''}`} onClick={() => setLang('ko')}>{t('set.langKo')}</button>
            <button className={`st-lang${lang === 'en' ? ' on' : ''}`} onClick={() => setLang('en')}>{t('set.langEn')}</button>
          </div>

          <h3 className="st-subsec">{t('set.theme')}</h3>
          <div className="st-lang-toggle" role="group" aria-label={t('set.theme')}>
            {THEME_OPTIONS.map(([key, label]) => (
              <button key={key} className={`st-lang st-theme${theme === key ? ' on' : ''}`}
                aria-pressed={theme === key} onClick={() => setTheme(key)}>
                <svg className="st-theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{THEME_ICONS[key]}</svg>
                <span>{t(label)}</span>
              </button>
            ))}
          </div>

          <hr className="st-div" />

          <h3 className="st-subsec">{t('set.browserTitle')}</h3>
          <div className="st-row st-row-static">
            <span>{t('set.browserPermission')}</span>
            <span className={`st-vbadge ${perm === 'granted' ? 'ok' : perm === 'denied' ? 'no' : 'soon'}`}>{permLabel}</span>
          </div>
          <div className="st-row st-row-static">
            <span>{t('set.notiBrowser')}</span>
            <button className={`st-switch${prefs.browser ? ' on' : ''}`}
              role="switch" aria-checked={prefs.browser} aria-label={t('set.notiBrowser')}
              disabled={!isSupported() || perm === 'denied'} onClick={toggleBrowser}>
              <span className="st-switch-knob" />
            </button>
          </div>
          <button className="st-btn st-test-btn" onClick={onTestNotification} disabled={!isSupported()}>{t('set.testNotify')}</button>
          {perm === 'denied' && <p className="st-hint">{t('set.browserBlockedHint')}</p>}

          <hr className="st-div" />

          <h3 className="st-subsec">{t('set.notifications')}</h3>
          {NOTI_GROUPS.map(group => {
            const on = groupOn(group)
            return (
              <div key={group.key} className="st-row st-row-static">
                <span className="st-noti-group">
                  <span className="st-noti-group-name">{t(group.labelKey)}</span>
                  <span className="st-noti-group-desc">{t(group.descKey)}</span>
                </span>
                <button className={`st-switch${on ? ' on' : ''}`}
                  role="switch" aria-checked={on} aria-label={t(group.labelKey)} onClick={() => toggleGroup(group)}>
                  <span className="st-switch-knob" />
                </button>
              </div>
            )
          })}
        </section>

        {/* ③ 계정 및 보안 */}
        <section className="st-card">
          <h2 className="st-card-title">{t('set.accountSecurity')}</h2>

          <div className="st-device">
            <span className="st-device-ic" aria-hidden="true"><Icon name="users" size={20} /></span>
            <div className="st-device-body">
              <span className="st-device-name">{device.device} · {device.browser}</span>
              <span className="st-device-meta">{device.os} · {device.country}</span>
            </div>
            <span className="st-device-badge">{t('set.currentLogin')}</span>
          </div>

          <div className="st-row st-row-static">
            <span>{t('set.verifyEmail')}</span>
            <span className={`st-vbadge ${user?.isEmailVerified ? 'ok' : 'no'}`}>
              {user?.isEmailVerified ? t('set.verifyDone') : t('set.verifyNot')}
            </span>
          </div>
          {!user?.isEmailVerified && (
            <div className="st-row" role="button" tabIndex={0}
              onClick={() => navigate('/verify-email', { state: { reason: 'login' } })}>
              <span>{t('set.verifyGo')}</span>
              <span className="st-chevron" aria-hidden="true">›</span>
            </div>
          )}
          {/* 본인인증(PASS/NICE/KCB) — 실 업체 설정 시에만 노출. 베타(미설정)는 이메일 인증만. */}
          {isIdentityVerificationEnabled() && (
            <>
              <div className="st-row st-row-static">
                <span>{t('set.identityRow')}</span>
                <span className={`st-vbadge ${idInfo.verified ? 'ok' : 'no'}`}>
                  {idInfo.verified ? t('set.identityDone') : t('set.identityNot')}
                </span>
              </div>
              {idInfo.verified && idInfo.agency && (
                <div className="st-row st-row-static">
                  <span>{t('set.identityAgency')}</span>
                  <span className="st-muted">{IDENTITY_AGENCY_LABELS[idInfo.agency] || idInfo.agency}</span>
                </div>
              )}
              {!idInfo.verified && (
                <div className="st-row" role="button" tabIndex={0} onClick={() => navigate('/verify-identity')}>
                  <span>{t('set.identityGo')}</span>
                  <span className="st-chevron" aria-hidden="true">›</span>
                </div>
              )}
            </>
          )}

          <div className="st-row" role="button" tabIndex={0} onClick={() => navigate(`/club/${team.id}/password`)}>
            <span>{t('set.changePw')}</span>
            <span className="st-chevron" aria-hidden="true">›</span>
          </div>
        </section>

        {/* ④ 서비스 정보 */}
        <section className="st-card">
          <h2 className="st-card-title">{t('set.serviceInfo')}</h2>
          <div className="st-row st-row-static"><span>{t('set.appVersion')}</span><span className="st-muted">{APP_VERSION}</span></div>
          <div className="st-row" role="button" tabIndex={0} onClick={() => navigate(`/club/${team.id}/about`)}>
            <span>{t('set.about')}</span><span className="st-chevron" aria-hidden="true">›</span>
          </div>
          <div className="st-row" role="button" tabIndex={0} onClick={() => navigate(`/club/${team.id}/privacy`)}>
            <span>{t('set.privacy')}</span><span className="st-chevron" aria-hidden="true">›</span>
          </div>
          <div className="st-row" role="button" tabIndex={0} onClick={() => navigate(`/club/${team.id}/terms`)}>
            <span>{t('set.terms')}</span><span className="st-chevron" aria-hidden="true">›</span>
          </div>
          <div className="st-row" role="button" tabIndex={0} onClick={() => navigate('/support')}
            onKeyDown={e => { if (e.key === 'Enter') navigate('/support') }}>
            <span>{t('set.support')}</span><span className="st-chevron" aria-hidden="true">›</span>
          </div>
        </section>

        {/* 로그아웃 / 회원탈퇴 — 카드 밖, 페이지 최하단 (회원탈퇴는 위험 작업이라 분리 스타일) */}
        <button className="st-logout" onClick={handleLogout}>{t('set.logout')}</button>
        <button className="st-withdraw" onClick={() => { setWithdrawText(''); setShowWithdraw(true) }}>{t('set.withdraw')}</button>
      </main>

      {/* 회원탈퇴 확인 모달 */}
      {showWithdraw && (
        <div className="st-modal-overlay" role="dialog" aria-modal="true" aria-label={t('set.withdrawTitle')}
          onClick={e => { if (e.target === e.currentTarget) setShowWithdraw(false) }}>
          <div className="st-modal">
            <h3 className="st-modal-title">{t('set.withdrawTitle')}</h3>
            <p className="st-modal-desc">{t('set.withdrawDesc')}</p>
            <p className="st-modal-phrase">{t('set.withdrawPrompt', { phrase: withdrawPhrase })}</p>
            <input type="text" className="st-modal-input" placeholder={withdrawPhrase}
              value={withdrawText} onChange={e => setWithdrawText(e.target.value)} autoFocus />
            <div className="st-modal-actions">
              <button className="st-modal-cancel" onClick={() => setShowWithdraw(false)}>{t('common.cancel')}</button>
              <button className="st-modal-confirm" disabled={withdrawText.trim() !== withdrawPhrase || withdrawing} onClick={handleWithdraw}>
                {withdrawing ? t('set.withdrawing') : t('set.withdrawConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 응원팀 변경 — 팀 선택 */}
      {teamModal === 'pick' && (
        <div className="st-modal-overlay" role="dialog" aria-modal="true" aria-label={t('team.changeBtn')}
          onClick={e => { if (e.target === e.currentTarget) setTeamModal(false) }}>
          <div className="st-modal st-modal-team">
            <h3 className="st-modal-title">{t('team.changeBtn')}</h3>
            <div className="st-team-grid" role="radiogroup" aria-label={t('team.changeBtn')}>
              {TEAMS.filter(tm => tm.id !== team.id).map(tm => (
                <button type="button" key={tm.id} role="radio" aria-checked={teamPick === tm.id}
                  className={`st-team-opt${teamPick === tm.id ? ' on' : ''}`} onClick={() => setTeamPick(tm.id)}>
                  <TeamEmblem color={tm.color} size={20} />{teamName(tm, lang)}
                </button>
              ))}
            </div>
            <div className="st-modal-actions">
              <button className="st-modal-cancel" onClick={() => setTeamModal(false)}>{t('common.cancel')}</button>
              <button className="st-modal-confirm" disabled={!teamPick} onClick={() => setTeamModal('confirm')}>{t('common.next')}</button>
            </div>
          </div>
        </div>
      )}

      {/* 응원팀 변경 — 확인 */}
      {teamModal === 'confirm' && teamPick && (
        <div className="st-modal-overlay" role="dialog" aria-modal="true" aria-label={t('team.confirmTitle')}
          onClick={e => { if (e.target === e.currentTarget) setTeamModal(false) }}>
          <div className="st-modal">
            <h3 className="st-modal-title">{t('team.confirmTitle')}</h3>
            <p className="st-modal-desc">{t('team.confirmDesc', { from: teamName(team, lang), to: teamName(getTeam(teamPick), lang) })}</p>
            <p className="st-modal-phrase">{t('team.confirmWarn')}</p>
            <div className="st-modal-actions">
              <button className="st-modal-cancel" onClick={() => setTeamModal('pick')} disabled={teamBusy}>{t('common.cancel')}</button>
              <button className="st-modal-confirm" onClick={confirmTeamChange} disabled={teamBusy}>
                {teamBusy ? t('common.processing') : t('team.confirmCta')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
