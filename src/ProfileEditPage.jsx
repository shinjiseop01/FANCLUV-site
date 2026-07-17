import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import Icon from './components/Icon.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import { logout, getCurrentUser, updateAvatar, changeNickname, nicknameChangeInfo, issueEmailCode, attachEmail } from './lib/auth.js'
import { getTeam, teamName, TeamEmblem, menuPath } from './teams.jsx'
import { useNicknameCheck } from './lib/useNicknameCheck.js'
import { saveAvatar, clearAvatar, validateImageFile, ACCEPTED_EXT } from './lib/avatarStorage.js'
import NicknameStatus from './components/NicknameStatus.jsx'
import AvatarCropper from './components/AvatarCropper.jsx'
import Avatar from './components/Avatar.jsx'
import './ClubHomePage.css'
import './SettingsPage.css'
import './AccountPages.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

// 이메일 미제공 소셜 계정(비즈 앱 전 Kakao 등)은 profiles.email 이 NULL 일 수 있다.
// 이 화면의 "이메일 등록" 카드는 이메일이 없는 계정에만 노출되어, 인증번호 검증 후
// profiles.email 을 등록한다(auth.attachEmail → RPC claim_profile_email). 로그인 직후
// 강제하지 않고, 이메일이 필요한 시점에 사용자가 직접 등록하도록 한다.
export default function ProfileEditPage() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { lang, t } = useLang()
  const fileRef = useRef(null)

  const user = getCurrentUser()
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || null)
  const [cropSrc, setCropSrc] = useState(null)   // 크롭할 원본 dataURL (열려 있으면 모달 표시)
  const [saving, setSaving] = useState(false)
  const [nickname, setNickname] = useState(user?.nickname || '')
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const info = nicknameChangeInfo()
  const nickCheck = useNicknameCheck(nickname, { exceptId: user?.id, exceptEmail: user?.email })
  const unchanged = nickname.trim() === (user?.nickname || '')

  // ── 이메일 등록(이메일 미제공 소셜 계정 전용) ──
  const [currentEmail, setCurrentEmail] = useState(user?.email || '')
  const [emailInput, setEmailInput] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailMsg, setEmailMsg] = useState(null) // { kind:'loading'|'ok'|'error', text }

  async function sendEmailCode() {
    const q = emailInput.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q)) { setEmailMsg({ kind: 'error', text: t('profile.email.errFormat') }); return }
    setEmailBusy(true); setEmailMsg({ kind: 'loading', text: t('profile.email.sending') })
    const res = await issueEmailCode(q)
    setEmailBusy(false)
    if (!res.ok) { setEmailMsg({ kind: 'error', text: res.error || t('profile.email.sendFail') }); return }
    setCodeSent(true) // 발송 성공 → 입력 단계. 코드값은 서버에만 존재(화면 노출 금지).
    setEmailMsg({ kind: 'ok', text: t('profile.email.sent') })
  }

  async function confirmEmail() {
    setEmailBusy(true); setEmailMsg({ kind: 'loading', text: t('profile.email.verifying') })
    const res = await attachEmail(emailInput, emailCode)
    setEmailBusy(false)
    if (!res.ok) {
      const txt = res.code === 'duplicate' ? t('profile.email.duplicate') : (res.error || t('profile.email.verifyFail'))
      setEmailMsg({ kind: 'error', text: txt }); return
    }
    setCurrentEmail(emailInput.trim().toLowerCase())
    setCodeSent(false); setEmailCode(''); setEmailInput('')
    setEmailMsg({ kind: 'ok', text: t('profile.email.linked') })
  }

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
    e.target.value = '' // 같은 파일 재선택 허용
    if (!file) return
    setOkMsg('')
    const v = validateImageFile(file)
    if (!v.ok) {
      setError(v.code === 'size' ? t('profile.imageErrSize') : t('profile.imageErrType'))
      return
    }
    setError('')
    const reader = new FileReader()
    reader.onload = () => setCropSrc(reader.result) // 크롭 모달 열기
    reader.readAsDataURL(file)
  }

  // 크롭 완료(blob) → Storage(또는 Mock) 저장 → 프로필 반영
  async function onCropped(blob) {
    setSaving(true)
    const res = await saveAvatar(blob)
    if (res.ok) {
      await updateAvatar(res.url)
      setAvatarUrl(res.url)
      setOkMsg(t('profile.imageUpdated'))
      setError('')
    } else {
      setError(res.error || t('profile.imageErrType'))
    }
    setSaving(false)
    setCropSrc(null)
  }

  async function removeImage() {
    setSaving(true)
    await clearAvatar()
    await updateAvatar(null)
    setAvatarUrl(null)
    setOkMsg(t('profile.imageRemoved'))
    setSaving(false)
  }

  async function saveNickname() {
    setError(''); setOkMsg('')
    const res = await changeNickname(nickname)
    if (res.ok) {
      setOkMsg(t('profile.nicknameUpdated'))
    } else {
      // 제한 기간이면 다음 변경일(날짜) 없이 안내 메시지만 표시
      setError(res.nextChangeAt ? t('profile.nicknameLocked') : res.error)
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
        <h1 className="ac-title">{t('profile.title')}</h1>

        {/* Profile image */}
        <section className="st-card">
          <h2 className="st-card-title">{t('profile.image')}</h2>
          <div className="ac-avatar-row">
            <Avatar name={nickname} src={avatarUrl} size={84} />
            <div className="ac-avatar-actions">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPickFile} />
              <button className="st-btn" onClick={() => fileRef.current?.click()} disabled={saving}>
                {avatarUrl ? t('profile.replaceImage') : t('profile.changeImage')}
              </button>
              {avatarUrl && <button className="ac-text-btn" onClick={removeImage} disabled={saving}>{t('profile.removeImage')}</button>}
            </div>
          </div>
          <p className="ac-hint">{t('profile.imageHint', { ext: ACCEPTED_EXT })}</p>
        </section>

        {/* Nickname */}
        <section className="st-card">
          <h2 className="st-card-title">{t('profile.nickname')}</h2>
          <input
            type="text"
            className="ac-input"
            value={nickname}
            onChange={e => { setNickname(e.target.value); setError(''); setOkMsg('') }}
            maxLength={12}
            disabled={!info.canChange}
          />
          {info.canChange ? (
            unchanged
              ? <p className="ac-hint">{t('nickname.hint')}</p>
              : <NicknameStatus status={nickCheck} />
          ) : (
            <p className="ac-hint">{t('profile.nicknameLocked')}</p>
          )}
          <button className="ac-save-btn" onClick={saveNickname} disabled={!info.canChange || unchanged || nickCheck.state !== 'available'}>
            {t('profile.saveNickname')}
          </button>
        </section>

        {/* Email — 이메일 등록(미제공 소셜 계정) 또는 현재 이메일 표시 */}
        <section className="st-card">
          <h2 className="st-card-title">{t('profile.email.title')}</h2>
          {currentEmail ? (
            <p className="ac-hint" style={{ fontSize: 15, color: 'var(--ink)' }}>{currentEmail}</p>
          ) : (
            <>
              <p className="ac-hint">{t('profile.email.desc')}</p>
              <div className="pe-email-row">
                <input
                  type="email"
                  className="ac-input"
                  placeholder={t('profile.email.placeholder')}
                  value={emailInput}
                  disabled={codeSent || emailBusy}
                  onChange={e => { setEmailInput(e.target.value); setEmailMsg(null) }}
                />
                <button className="ac-save-btn pe-email-btn" onClick={sendEmailCode} disabled={emailBusy || codeSent || !emailInput.trim()}>
                  {t('profile.email.sendCode')}
                </button>
              </div>
              {codeSent && (
                <div className="pe-email-row">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="ac-input"
                    placeholder={t('profile.email.codePlaceholder')}
                    value={emailCode}
                    disabled={emailBusy}
                    onChange={e => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                  <button className="ac-save-btn pe-email-btn" onClick={confirmEmail} disabled={emailBusy || emailCode.length < 4}>
                    {t('profile.email.confirm')}
                  </button>
                </div>
              )}
              {emailMsg && (
                <p className={`ac-hint pe-email-msg ${emailMsg.kind}`} role={emailMsg.kind === 'error' ? 'alert' : 'status'}>
                  {emailMsg.text}
                </p>
              )}
            </>
          )}
        </section>

        {error && <div className="ac-msg error" role="alert"><Icon name="warningTriangle" size={14} className="fc-inline-ico" />{error}</div>}
        {okMsg && <div className="ac-msg ok" role="status"><Icon name="check" size={14} className="fc-inline-ico" />{okMsg}</div>}
      </main>

      {cropSrc && (
        <AvatarCropper src={cropSrc} onCancel={() => setCropSrc(null)} onCropped={onCropped} />
      )}
    </div>
  )
}
