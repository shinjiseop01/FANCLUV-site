import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signup, issueEmailCode, confirmEmailCode, needsOnboarding, requiresIdentityVerification, isIdentityVerificationEnabled } from './lib/auth.js'
import { isValidEmail, signupProgress, resendButtonState, RESEND_COOLDOWN_SEC } from './lib/authForm.js'
import { logger } from './lib/logger.js'
import { useLang } from './contexts/LanguageContext.jsx'
import Icon from './components/Icon.jsx'
import { useNicknameCheck } from './lib/useNicknameCheck.js'
import NicknameStatus from './components/NicknameStatus.jsx'
import SocialAuth from './components/SocialAuth.jsx'
import './SignupPage.css'

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

  // 이메일 인증번호 — 코드값은 서버에만 존재. 화면/state 에 코드를 보관하지 않는다.
  const [codeSent, setCodeSent] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [emailVerified, setEmailVerified] = useState(false)
  const [sending, setSending] = useState(false)       // 인증번호 발송 중
  const [codeMsg, setCodeMsg] = useState(null)         // { kind:'loading'|'ok'|'error', text }
  const [codeError, setCodeError] = useState('')       // 인증번호 검증 실패(② 단계 빨간 안내)
  const [verifying, setVerifying] = useState(false)    // 인증번호 확인 중
  const [resendCooldown, setResendCooldown] = useState(0) // 재전송 쿨다운(초) — 연속 클릭 방지
  const [emailTouched, setEmailTouched] = useState(false) // blur 후에만 형식 오류 표시
  // Supabase 모드에서 (예외적으로) 확인 메일이 여전히 필요할 때만 표시하는 폴백 안내.
  const [confirmSent, setConfirmSent] = useState(false)

  const emailValid = isValidEmail(email)
  const emailFormatError = emailTouched && email.trim().length > 0 && !emailValid

  // 재전송 쿨다운 타이머(1초마다 감소). cleanup 으로 언마운트/재실행 시 정리.
  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setTimeout(() => setResendCooldown(c => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(id)
  }, [resendCooldown])

  function onEmailChange(v) {
    setEmail(v)
    setError('')
    // 이메일이 바뀌면 인증 상태·쿨다운·오류 전부 초기화
    setCodeSent(false)
    setCodeInput('')
    setEmailVerified(false)
    setCodeMsg(null)
    setCodeError('')
    setResendCooldown(0)
    setConfirmSent(false)
  }

  async function handleSendCode() {
    // 연속 클릭 방지(발송 중 / 쿨다운 중이면 무시) + 이미 인증 완료면 무시.
    if (sending || resendCooldown > 0 || emailVerified) return
    setError(''); setCodeMsg(null); setCodeError('')
    const q = email.trim()
    // 형식 오류도 조용히 return 하지 않고 버튼 아래 즉시 안내(item 3).
    if (!isValidEmail(q)) { setEmailTouched(true); setCodeMsg({ kind: 'error', text: t('signup.errEmailFormat') }); return }
    setSending(true)
    setCodeMsg({ kind: 'loading', text: t('signup.sendingCode') })
    logger.info('[signup] send-email-code 요청', { context: { email: q } })
    try {
      // 서버가 이메일 발송 성공까지 마쳐야 ok. 코드값은 반환되지 않는다(화면 노출 금지).
      const res = await issueEmailCode(q)
      if (!res.ok) {
        // 내부 사유는 auth.js 가 서버 로그에만 남기고, 여기선 안전 문구만 표시.
        setCodeMsg({ kind: 'error', text: res.error || t('signup.errSendCode') })
        return
      }
      setCodeSent(true)              // 발송 성공 → 인증번호 입력 단계 활성화
      setEmailVerified(false)
      setCodeInput('')
      // 서버가 기존 코드를 새 코드로 덮어써(email 단일 upsert) 이전 번호는 무효.
      // 60초 재전송 쿨다운 시작(Rate Limit).
      setResendCooldown(RESEND_COOLDOWN_SEC)
      setCodeMsg({ kind: 'ok', text: t('signup.codeSentMail') }) // 안전 문구(코드값 없음)
    } catch (e) {
      // 예외가 uncaught 로 새어 무반응 되는 것을 방지 — 안전 문구만 표시(원인은 서버 로그).
      logger.error('[signup] 인증번호 발송 예외', { error: e })
      setCodeMsg({ kind: 'error', text: t('signup.errSendCode') })
    } finally {
      setSending(false)
    }
  }

  async function handleConfirmCode() {
    setError(''); setCodeError('')
    if (!codeInput.trim()) { setCodeError(t('signup.errCode')); return }
    setVerifying(true)
    try {
      // 검증은 항상 서버(Edge)에서 해시 비교. 클라이언트 로컬 비교/우회 없음.
      const res = await confirmEmailCode(email.trim(), codeInput.trim())
      if (!res.ok) { setCodeError(res.error || t('signup.errCode')); return }
      setEmailVerified(true)
      setResendCooldown(0) // 인증 완료 → 재전송 쿨다운 해제
    } finally {
      setVerifying(false)
    }
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
    if (!isValidEmail(email)) { setEmailTouched(true); setError(t('signup.errEmailFormat')); return }
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
    // 정상 흐름: 커스텀 인증번호로 이미 이메일을 인증했으므로 signup() 이 서버측
    // 이메일 확정(0065) 후 세션까지 확보해 needsConfirm=false 로 돌아온다 →
    // "메일을 확인하세요"를 다시 보여주지 않고 바로 다음 화면으로.
    if (result.needsConfirm) {
      // 폴백: 확정이 실패한 예외 상황에서만 확인 메일 안내(정상 흐름에서는 도달 안 함).
      setConfirmSent(true)
      return
    }
    // 이메일 인증 완료 → 실 본인인증 업체가 설정된 경우에만 본인인증 단계로,
    // 아니면(베타 이메일 인증) 바로 팀 선택으로.
    navigate(isIdentityVerificationEnabled() ? '/verify-identity' : '/team-select')
  }

  // 회원가입 진행 단계(① 이메일 → ② 인증 → ③ 프로필 → ④ 완료) — 상단 스텝 인디케이터.
  const profileComplete =
    nickCheck.state === 'available' && !!ageGroup && password.length >= 4 && password === passwordConfirm
  const progress = signupProgress({ emailValid, codeSent, emailVerified, profileComplete })
  const stepLabels = { email: t('signup.stepEmail'), code: t('signup.stepCode'), profile: t('signup.stepProfile'), done: t('signup.stepDone') }
  const resendState = resendButtonState({ sending, cooldown: resendCooldown, codeSent })
  const resendLabel = {
    sending: t('signup.sendingCode'),
    cooldown: t('signup.resendIn', { s: resendCooldown }),
    resend: t('signup.resendCode'),
    send: t('signup.sendCode'),
  }[resendState.key]

  return (
    <div className="signup-root">
      <div className="signup-card">

        <div className="signup-brand">FANCLUV</div>

        <div className="signup-header">
          <h1 className="signup-title">{t('signup.title')}</h1>
          <p className="signup-subtitle">{t('signup.subtitle')}</p>
        </div>

        {/* 진행 단계 인디케이터: ① 이메일 → ② 인증 → ③ 프로필 → ④ 완료 */}
        <ol className="su-steps" aria-label={t('signup.stepsAria')}>
          {progress.steps.map(s => (
            <li key={s.key} className={`su-step ${s.status}`} aria-current={s.status === 'active' ? 'step' : undefined}>
              <span className="su-step-dot">
                {s.status === 'done'
                  ? <Icon name="check" size={13} />
                  : s.index}
              </span>
              <span className="su-step-label">{stepLabels[s.key]}</span>
            </li>
          ))}
        </ol>

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
                className={`su-input${emailFormatError ? ' invalid' : ''}`}
                placeholder={t('signup.emailPh')}
                value={email}
                onChange={e => onEmailChange(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                autoComplete="email"
                disabled={emailVerified}
                aria-invalid={emailFormatError}
              />
              <button type="button" className="su-side-btn" onClick={handleSendCode}
                disabled={emailVerified || resendState.disabled || !emailValid}>
                {resendLabel}
              </button>
            </div>

            {/* 이메일 형식 오류 인라인 안내(회원가입 버튼도 비활성화됨) */}
            {emailFormatError && (
              <p className="su-code-msg error" role="alert">{t('signup.errEmailFormat')}</p>
            )}

            {/* 발송 상태(로딩/성공/실패)를 버튼 바로 아래 항상 표시 — 무반응 방지 */}
            {codeMsg && (
              <p className={`su-code-msg ${codeMsg.kind}`} role={codeMsg.kind === 'error' ? 'alert' : 'status'}>
                {codeMsg.kind === 'loading' && <span className="su-spinner" aria-hidden="true" />}
                {codeMsg.text}
              </p>
            )}

            {codeSent && !emailVerified && (
              <>
                <div className="su-inline">
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`su-input${codeError ? ' invalid' : ''}`}
                    placeholder={t('signup.codePh')}
                    value={codeInput}
                    onChange={e => { setCodeInput(e.target.value); setError(''); setCodeError('') }}
                    maxLength={6}
                    aria-invalid={!!codeError}
                  />
                  <button type="button" className="su-side-btn confirm" onClick={handleConfirmCode} disabled={verifying}>
                    {verifying ? <span className="su-spinner" aria-hidden="true" /> : t('signup.confirmCode')}
                  </button>
                </div>
                {/* 인증 실패 → 빨간 안내 + 재시도 유도(코드 재입력 또는 재전송) */}
                {codeError && (
                  <p className="su-code-msg error" role="alert">
                    {codeError}{' '}
                    <button type="button" className="su-link-btn" onClick={handleSendCode} disabled={resendState.disabled}>
                      {resendState.key === 'cooldown' ? t('signup.resendIn', { s: resendCooldown }) : t('signup.resendCode')}
                    </button>
                  </p>
                )}
              </>
            )}

            {emailVerified && (
              <p className="su-verified"><Icon name="check" size={14} className="fc-inline-ico" />{t('signup.emailVerified')}</p>
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
            <div className="su-error" role="alert"><Icon name="warningTriangle" size={14} className="fc-inline-ico" />{error}</div>
          )}

          {confirmSent && (
            <div className="su-verified" role="status"><Icon name="check" size={14} className="fc-inline-ico" />{t('signup.confirmEmailSent')}</div>
          )}

          <button type="submit" className="su-btn" disabled={loading || nickCheck.state !== 'available' || !emailValid}>
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
