// FANCLUV — 비밀번호 재설정 완료 화면 (/reset-password).
//
// 비밀번호 찾기(/find-password) → 재설정 메일 → 링크 클릭 시 이 경로로 돌아온다.
// Supabase(implicit flow)가 링크 hash(#access_token=...&type=recovery)를 세션으로
// 교환(detectSessionInUrl)하면, 여기서 새 비밀번호를 입력받아 updateUser로 저장한다.
// (현재 비밀번호는 묻지 않는다 — 복구 세션이 인증을 대신한다.)
//
// ── 상태 모델 ────────────────────────────────────────────────────────────────
//   checking   : auth bootstrap 진행 중 — 아직 recovery 판정 전(로딩 표시)
//   ready      : recovery 세션 유효 — 새 비밀번호 입력 폼
//   invalid    : bootstrap 완료 + recovery 아님 — 만료/무효 안내 + 재요청
//   submitting : updateUser 진행 중
//   success    : 변경 완료
//   error      : 입력값 오류(폼 내 인라인, 재입력 가능)
//
// ⚠️ 초기 렌더에서 곧바로 만료 오류를 띄우지 않는다(implicit flow에서 recovery
//    판정은 비동기). recoveryStatus가 'checking'인 동안은 로딩만 보여준다.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { completePasswordReset } from './lib/auth.js'
import { clearRecoveryIntent } from './lib/authRecoveryState.js'
import { useLang } from './contexts/LanguageContext.jsx'
import { useAuth } from './contexts/AuthContext.jsx'
import { useToast } from './contexts/ToastContext.jsx'
import Alert from './components/Alert.jsx'
import Icon from './components/Icon.jsx'
import './SignupPage.css'
import './RecoveryPages.css'

export default function ResetPasswordPage() {
  const { t } = useLang()
  const navigate = useNavigate()
  const toast = useToast()
  const { recoveryStatus } = useAuth()
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  // 화면 상태 파생. done/submitting이 우선하고, 그 외에는 recoveryStatus로 판정.
  const pageStatus = done
    ? 'success'
    : recoveryStatus === 'checking'
      ? 'checking'
      : recoveryStatus === 'active'
        ? 'ready'
        : 'invalid'

  // "로그인/홈으로 돌아가기": recovery intent를 먼저 비우고 이동한다. 그래야 LoginPage가
  // (hasRecoveryIntent 기반 판정으로) 다시 /reset-password로 바운스하지 않는다.
  function leaveToLogin(state) {
    clearRecoveryIntent()
    navigate('/', { replace: true, state })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!next) { setError(t('resetPw.errNew')); return }
    if (next.length < 8) { setError(t('resetPw.errLen')); return }
    if (next !== confirm) { setError(t('resetPw.errMatch')); return }
    setSubmitting(true)
    // completePasswordReset: updateUser → signOut → recovery intent 정리(auth.js)
    const res = await completePasswordReset(next)
    setSubmitting(false)
    if (res.ok) {
      setDone(true)
      // 성공 Toast 표시
      toast.success(t('resetPw.changedToast'))
      // 약 1.5초 후 로그인 페이지(/)로 자동 이동 (recovery 세션은 이미 종료됨).
      // replace: true → 뒤로가기 시 reset-password 성공 화면으로 복귀하지 않음.
      // state.passwordResetSuccess → 로그인 페이지에서 "새 비밀번호로 로그인" 안내 표시.
      setTimeout(() => leaveToLogin({ passwordResetSuccess: true }), 1500)
    } else {
      // 복구 가능한 실패 → intent를 지우지 않고 재입력 허용
      setError(res.error || t('resetPw.errGeneric'))
    }
  }

  return (
    <div className="signup-root">
      <div className="signup-card">
        <div className="signup-brand">FANCLUV</div>

        <div className="signup-header">
          <h1 className="signup-title">{t('resetPw.title')}</h1>
          <p className="signup-subtitle">{t('resetPw.subtitle')}</p>
        </div>

        {pageStatus === 'checking' && (
          <div className="rec-result" role="status" aria-busy="true">
            <span className="su-btn-loading"><span className="su-spinner" /></span>
            <p className="rec-result-note">{t('resetPw.checking')}</p>
          </div>
        )}

        {pageStatus === 'invalid' && (
          <div className="rec-result">
            {/* 항목1: 만료/무효 안내를 공용 Alert(통일 색상·아이콘 정렬·padding·radius·모바일 줄바꿈)로 */}
            <Alert kind="error" boxed style={{ marginBottom: 16 }}>{t('resetPw.invalidDesc')}</Alert>
            <div className="rec-result-actions">
              <button type="button" className="su-btn rec-btn-link" onClick={() => navigate('/find-password', { replace: true })}>
                {t('resetPw.requestNew')}
              </button>
              <button type="button" className="su-btn rec-btn-link" onClick={() => leaveToLogin()}>
                {t('findId.goLogin')}
              </button>
            </div>
          </div>
        )}

        {pageStatus === 'success' && (
          <div className="rec-result" role="status">
            <span className="rec-result-icon" aria-hidden="true"><Icon name="successCircle" size={26} /></span>
            <p className="rec-result-label">{t('resetPw.doneTitle')}</p>
            <p className="rec-result-note">{t('resetPw.doneDesc')}</p>
            <div className="rec-result-actions">
              <button type="button" className="su-btn rec-btn-link" onClick={() => leaveToLogin({ passwordResetSuccess: true })}>
                {t('findId.goLogin')}
              </button>
            </div>
          </div>
        )}

        {pageStatus === 'ready' && (
          <form onSubmit={handleSubmit} noValidate>
            <div className="su-field">
              <label className="su-label">{t('resetPw.new')}</label>
              <input
                type="password"
                className="su-input"
                placeholder={t('resetPw.newPh')}
                value={next}
                onChange={e => { setNext(e.target.value); setError('') }}
                autoComplete="new-password"
              />
            </div>
            <div className="su-field">
              <label className="su-label">{t('resetPw.confirm')}</label>
              <input
                type="password"
                className="su-input"
                placeholder={t('resetPw.confirmPh')}
                value={confirm}
                onChange={e => { setConfirm(e.target.value); setError('') }}
                autoComplete="new-password"
              />
            </div>

            {error && <div className="su-error" role="alert"><Icon name="warningTriangle" size={14} className="fc-inline-ico" />{error}</div>}

            <button type="submit" className="su-btn" disabled={submitting}>
              {submitting ? (
                <span className="su-btn-loading"><span className="su-spinner" />{t('resetPw.loading')}</span>
              ) : (
                <span>{t('resetPw.submit')}</span>
              )}
            </button>
          </form>
        )}

        <div className="rec-links">
          {/* 항목3: '/'로 나갈 때는 recovery intent를 비워 바운스를 막는다(button + leaveToLogin) */}
          <button type="button" className="signup-login-link rec-linkbtn" onClick={() => leaveToLogin()}>{t('find.backToLogin')}</button>
          <span className="rec-sep">·</span>
          <Link to="/find-password" className="signup-login-link">{t('login.findPw')}</Link>
        </div>
      </div>

      <button type="button" className="signup-home-link rec-linkbtn" onClick={() => leaveToLogin()}>{t('common.backToHome')}</button>
    </div>
  )
}
