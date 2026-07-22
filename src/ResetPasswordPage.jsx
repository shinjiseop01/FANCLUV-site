// FANCLUV — 비밀번호 재설정 완료 화면 (/reset-password).
//
// 비밀번호 찾기(/find-password) → 재설정 메일 → 링크 클릭 시 이 경로로 돌아온다.
// Supabase 가 링크의 recovery 토큰을 세션으로 교환(detectSessionInUrl)하면,
// 여기서 새 비밀번호를 입력받아 updateUser({ password }) 로 저장한다.
// (현재 비밀번호는 묻지 않는다 — 복구 세션이 인증을 대신한다.)
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { completePasswordReset } from './lib/auth.js'
import { useLang } from './contexts/LanguageContext.jsx'
import { useAuth } from './contexts/AuthContext.jsx'
import Icon from './components/Icon.jsx'
import './SignupPage.css'
import './RecoveryPages.css'

export default function ResetPasswordPage() {
  const { t } = useLang()
  const navigate = useNavigate()
  const { isPasswordRecovery } = useAuth()
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  // recovery 세션이 없으면 로그인 페이지로 리다이렉트
  // (링크 만료 또는 직접 접근)
  useEffect(() => {
    if (!isPasswordRecovery && !loading && !done) {
      // recovery 세션 없음 = 링크 만료 또는 이미 사용함
      setError(t('resetPw.errGeneric'))
    }
  }, [isPasswordRecovery, loading, done, t])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!next) { setError(t('resetPw.errNew')); return }
    if (next.length < 8) { setError(t('resetPw.errLen')); return }
    if (next !== confirm) { setError(t('resetPw.errMatch')); return }
    setLoading(true)
    const res = await completePasswordReset(next)
    setLoading(false)
    if (res.ok) {
      setDone(true)
      // 3초 후 로그인 페이지로 이동 (recovery 세션은 자동 종료됨)
      setTimeout(() => navigate('/', { replace: true }), 3000)
    } else {
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

        {done ? (
          <div className="rec-result" role="status">
            <span className="rec-result-icon" aria-hidden="true"><Icon name="successCircle" size={26} /></span>
            <p className="rec-result-label">{t('resetPw.doneTitle')}</p>
            <p className="rec-result-note">{t('resetPw.doneDesc')}</p>
            <div className="rec-result-actions">
              <button type="button" className="su-btn rec-btn-link" onClick={() => navigate('/', { replace: true })}>
                {t('findId.goLogin')}
              </button>
            </div>
          </div>
        ) : (
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

            <button type="submit" className="su-btn" disabled={loading}>
              {loading ? (
                <span className="su-btn-loading"><span className="su-spinner" />{t('resetPw.loading')}</span>
              ) : (
                <span>{t('resetPw.submit')}</span>
              )}
            </button>
          </form>
        )}

        <div className="rec-links">
          <Link to="/" className="signup-login-link">{t('find.backToLogin')}</Link>
          <span className="rec-sep">·</span>
          <Link to="/find-password" className="signup-login-link">{t('login.findPw')}</Link>
        </div>
      </div>

      <Link to="/" className="signup-home-link">{t('common.backToHome')}</Link>
    </div>
  )
}
