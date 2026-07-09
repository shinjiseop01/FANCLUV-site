import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signup, issueEmailCode, confirmEmailCode, needsOnboarding, requiresIdentityVerification, isIdentityVerificationEnabled } from './lib/auth.js'
import { isSupabaseConfigured } from './lib/supabase.js'
import { useLang } from './contexts/LanguageContext.jsx'
import { useNicknameCheck } from './lib/useNicknameCheck.js'
import NicknameStatus from './components/NicknameStatus.jsx'
import SocialAuth from './components/SocialAuth.jsx'
import './SignupPage.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const GENDERS = [['male', 'signup.genderMale'], ['female', 'signup.genderFemale'], ['na', 'signup.genderNA']]
const AGE_GROUPS = [['10', 'signup.age10'], ['20', 'signup.age20'], ['30', 'signup.age30'], ['40', 'signup.age40'], ['50+', 'signup.age50']]

export default function SignupPage() {
  const navigate = useNavigate()
  const { t } = useLang()
  const [nickname, setNickname] = useState('')
  const nickCheck = useNicknameCheck(nickname)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [gender, setGender] = useState('')      // optional
  const [ageGroup, setAgeGroup] = useState('')  // required
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // 이메일 인증번호 (Mock 전용 — Supabase 모드에서는 확인 메일 링크를 사용)
  const [codeSent, setCodeSent] = useState(false)
  const [sentCode, setSentCode] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [emailVerified, setEmailVerified] = useState(false)
  // Supabase 모드에서 가입 후 "확인 메일 발송됨" 안내
  const [confirmSent, setConfirmSent] = useState(false)

  function onEmailChange(v) {
    setEmail(v)
    setError('')
    // 이메일이 바뀌면 인증 상태 초기화
    setCodeSent(false)
    setSentCode('')
    setCodeInput('')
    setEmailVerified(false)
  }

  async function handleSendCode() {
    setError('')
    if (!EMAIL_RE.test(email.trim())) { setError(t('signup.errEmailFormat')); return }
    const res = await issueEmailCode(email.trim())
    if (!res.ok) { setError(res.error); return }
    setSentCode(res.code || '')   // code 있으면(Mock/dev) 화면 힌트, 없으면 이메일 발송
    setCodeSent(true)
    setEmailVerified(false)
    setCodeInput('')
  }

  async function handleConfirmCode() {
    setError('')
    if (!codeInput.trim()) { setError(t('signup.errCode')); return }
    if (isSupabaseConfigured) {
      const res = await confirmEmailCode(email.trim(), codeInput.trim())
      if (!res.ok) { setError(res.error || t('signup.errCode')); return }
    } else if (codeInput.trim() !== sentCode) {
      setError(t('signup.errCode')); return
    }
    setEmailVerified(true)
  }

  // 소셜 회원가입/로그인 성공 → 온보딩 필요 시 온보딩, 팀 있으면 구단 홈, 아니면 팀 선택.
  function handleSocialSuccess(res) {
    if (needsOnboarding(res.user)) navigate('/onboarding')
    else if (requiresIdentityVerification(res.user)) navigate('/verify-identity')
    else if (res.user.selectedTeam) navigate(`/club/${res.user.selectedTeam}`)
    else navigate('/team-select')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!nickname.trim()) { setError(t('signup.errNickname')); return }
    if (!email.trim()) { setError(t('signup.errEmail')); return }
    if (!EMAIL_RE.test(email)) { setError(t('signup.errEmailFormat')); return }
    // 이메일 인증번호 확인은 양 모드 모두 필수(실제 존재하는 이메일만 가입).
    if (!emailVerified) { setError(t('signup.errEmailVerify')); return }
    if (!ageGroup) { setError(t('signup.errAge')); return }
    if (!password) { setError(t('signup.errPw')); return }
    if (password.length < 4) { setError(t('signup.errPwLen')); return }
    if (password !== passwordConfirm) { setError(t('signup.errPwMatch')); return }

    setLoading(true)
    const result = await signup({
      nickname: nickname.trim(), email: email.trim(), password,
      gender: gender || null, ageGroup,
    })
    setLoading(false)
    if (!result.ok) { setError(result.error); return }
    // Supabase 에서 (프로젝트 설정상) 확인 메일이 추가로 필요하면 안내 후 대기.
    if (result.needsConfirm) { setConfirmSent(true); return }
    // 이메일 인증 완료 → 실 본인인증 업체가 설정된 경우에만 본인인증 단계로,
    // 아니면(베타 이메일 인증) 바로 팀 선택으로.
    navigate(isIdentityVerificationEnabled() ? '/verify-identity' : '/team-select')
  }

  return (
    <div className="signup-root">
      <div className="signup-card">

        <div className="signup-brand">FANCLUV</div>

        <div className="signup-header">
          <h1 className="signup-title">{t('signup.title')}</h1>
          <p className="signup-subtitle">{t('signup.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="su-field">
            <label className="su-label">{t('signup.nickname')}</label>
            <input
              type="text"
              className="su-input"
              placeholder={t('signup.nicknamePh')}
              value={nickname}
              onChange={e => { setNickname(e.target.value); setError('') }}
              autoComplete="nickname"
              maxLength={12}
            />
            <NicknameStatus status={nickCheck} />
          </div>

          {/* Email + 인증번호 (실제 존재하는 이메일 확인 — 양 모드 공통) */}
          <div className="su-field">
            <label className="su-label">{t('signup.email')}</label>
            <div className="su-inline">
              <input
                type="email"
                className="su-input"
                placeholder={t('signup.emailPh')}
                value={email}
                onChange={e => onEmailChange(e.target.value)}
                autoComplete="email"
                disabled={emailVerified}
              />
              <button type="button" className="su-side-btn" onClick={handleSendCode} disabled={emailVerified}>
                {codeSent ? t('signup.resendCode') : t('signup.sendCode')}
              </button>
            </div>

            {codeSent && !emailVerified && (
              <>
                <p className="su-code-hint">{sentCode ? t('signup.codeHint', { code: sentCode }) : t('signup.codeSentMail')}</p>
                <div className="su-inline">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="su-input"
                    placeholder={t('signup.codePh')}
                    value={codeInput}
                    onChange={e => { setCodeInput(e.target.value); setError('') }}
                    maxLength={6}
                  />
                  <button type="button" className="su-side-btn confirm" onClick={handleConfirmCode}>
                    {t('signup.confirmCode')}
                  </button>
                </div>
              </>
            )}

            {emailVerified && (
              <p className="su-verified">✓ {t('signup.emailVerified')}</p>
            )}
          </div>

          {/* Gender (optional) */}
          <div className="su-field">
            <label className="su-label">{t('signup.gender')} <span className="su-optional">{t('signup.optional')}</span></label>
            <div className="su-chips" role="group" aria-label={t('signup.gender')}>
              {GENDERS.map(([val, key]) => (
                <button type="button" key={val}
                  className={`su-chip${gender === val ? ' on' : ''}`}
                  onClick={() => setGender(g => (g === val ? '' : val))}>
                  {t(key)}
                </button>
              ))}
            </div>
          </div>

          {/* Age group (required) */}
          <div className="su-field">
            <label className="su-label">{t('signup.ageGroup')} <span className="su-required">{t('signup.requiredMark')}</span></label>
            <div className="su-chips" role="group" aria-label={t('signup.ageGroup')}>
              {AGE_GROUPS.map(([val, key]) => (
                <button type="button" key={val}
                  className={`su-chip${ageGroup === val ? ' on' : ''}`}
                  onClick={() => { setAgeGroup(val); setError('') }}>
                  {t(key)}
                </button>
              ))}
            </div>
          </div>

          <div className="su-field">
            <label className="su-label">{t('signup.password')}</label>
            <input
              type="password"
              className="su-input"
              placeholder={t('signup.passwordPh')}
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              autoComplete="new-password"
            />
          </div>

          <div className="su-field">
            <label className="su-label">{t('signup.passwordConfirm')}</label>
            <input
              type="password"
              className="su-input"
              placeholder={t('signup.passwordConfirmPh')}
              value={passwordConfirm}
              onChange={e => { setPasswordConfirm(e.target.value); setError('') }}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="su-error" role="alert">⚠ {error}</div>
          )}

          {confirmSent && (
            <div className="su-verified" role="status">✓ {t('signup.confirmEmailSent')}</div>
          )}

          <button type="submit" className="su-btn" disabled={loading || nickCheck.state !== 'available'}>
            {loading ? (
              <span className="su-btn-loading"><span className="su-spinner" />{t('signup.loading')}</span>
            ) : (
              <>
                <span>{t('signup.submit')}</span>
                <svg className="su-btn-arrow" viewBox="0 0 20 20" fill="none">
                  <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </>
            )}
          </button>
        </form>

        <SocialAuth onSuccess={handleSocialSuccess} onError={setError} />

        <p className="signup-login-row">
          {t('signup.haveAccount')} <Link to="/" className="signup-login-link">{t('signup.loginLink')}</Link>
        </p>
      </div>

      <Link to="/" className="signup-home-link">{t('common.backToHome')}</Link>
    </div>
  )
}
