// FANCLUV — 본인인증(PASS/NICE/KCB) 단계.
//
// 회원가입(이메일 인증 완료) 또는 소셜 온보딩 직후 진입한다. 본인인증을 완료해야
// 회원가입이 최종 완료되며, 완료 시 CI/DI 는 서버(또는 Mock 저장소)에만 저장된다.
// 이미 본인인증을 마친 사용자는 이 화면에 들어와도 곧바로 다음 화면으로 이동한다.
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getCurrentUser, requiresIdentityVerification, completeIdentityVerification,
  ADMIN_ROLES, CLUB_ROLES,
} from './lib/auth.js'
import { getIdentityProvider, identityProviderId, IDENTITY_AGENCY_LABELS, isIdentityMock } from './lib/identity/identityProvider.js'
import { useLang } from './contexts/LanguageContext.jsx'
import Icon from './components/Icon.jsx'
import './SignupPage.css'
import './VerifyIdentityPage.css'

export default function VerifyIdentityPage() {
  const navigate = useNavigate()
  const { t } = useLang()
  const me = getCurrentUser()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const agencyLabel = IDENTITY_AGENCY_LABELS[identityProviderId()] || 'PASS'
  const mock = isIdentityMock()

  // 인증 완료 후 이동할 다음 화면.
  function nextPath(user) {
    if (CLUB_ROLES.includes(user?.role)) return '/executive'
    if (ADMIN_ROLES.includes(user?.role)) return '/admin'
    if (user?.selectedTeam) return `/club/${user.selectedTeam}`
    return '/team-select'
  }

  // 이미 인증(또는 면제) 상태면 진입 즉시 다음 화면으로.
  useEffect(() => {
    if (!me || !requiresIdentityVerification(me)) {
      navigate(nextPath(me), { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleVerify() {
    setError('')
    setLoading(true)
    const provider = getIdentityProvider()
    const result = await provider.verify({ seed: me?.email || me?.id })
    if (!result.ok) {
      setLoading(false)
      // 사용자가 스스로 취소한 경우는 오류로 강조하지 않는다.
      if (result.code !== 'cancelled') setError(result.error || t('identity.failGeneric'))
      return
    }
    const saved = await completeIdentityVerification(result)
    setLoading(false)
    if (!saved.ok) {
      setError(saved.error || t('identity.failGeneric'))
      return
    }
    navigate(nextPath(getCurrentUser()), { replace: true })
  }

  return (
    <div className="signup-root">
      <div className="signup-card">
        <div className="signup-brand">FANCLUV</div>

        <div className="signup-header">
          <h1 className="signup-title">{t('identity.title')}</h1>
          <p className="signup-subtitle">{t('identity.subtitle')}</p>
        </div>

        <div className="vi-shield" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 3l7 3v5c0 4.4-3 8.2-7 9-4-.8-7-4.6-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <ul className="vi-points">
          <li>{t('identity.point1')}</li>
          <li>{t('identity.point2')}</li>
          <li>{t('identity.point3')}</li>
        </ul>

        <p className="vi-agency">
          {t('identity.agencyLabel')}: <strong>{agencyLabel}</strong>
        </p>
        {mock && <p className="vi-mock-note">{t('identity.mockNote')}</p>}

        {error && <div className="su-error" role="alert"><Icon name="warningTriangle" size={14} className="fc-inline-ico" />{error}</div>}

        <button type="button" className="su-btn" onClick={handleVerify} disabled={loading}>
          {loading ? (
            <span className="su-btn-loading"><span className="su-spinner" />{t('identity.verifying')}</span>
          ) : (
            <span>{t('identity.startBtn', { agency: agencyLabel })}</span>
          )}
        </button>

        <button type="button" className="vi-later" onClick={() => navigate(nextPath(me), { replace: true })} disabled={loading}>
          {t('identity.later')}
        </button>
      </div>
    </div>
  )
}
