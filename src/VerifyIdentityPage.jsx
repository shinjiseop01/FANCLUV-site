// FANCLUV — 본인인증(PASS/NICE/KCB) 단계.
//
// 회원가입(이메일 인증 완료) 또는 소셜 온보딩 직후 진입한다. 본인인증을 완료해야
// 회원가입이 최종 완료되며, CI/DI 원문은 절대 클라이언트/화면에 남기지 않는다.
//
// 흐름: VerifyIdentityPage → IdentityService.start()/verifyInteractive()
//        → Provider Adapter(Mock/PASS/NICE/KCB) → 0057 RPC(상태전이·DI 1인1계정 연결).
// 이미 인증(또는 면제)된 사용자는 진입 즉시 다음 화면으로 이동한다.
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getCurrentUser, requiresIdentityVerification, loadCurrentSupabaseUser,
  ADMIN_ROLES, CLUB_ROLES,
} from './lib/auth.js'
import { IdentityService } from './lib/identity/identityService.js'
import { currentAdapterId, IDENTITY_AGENCY_LABELS } from './lib/identity/identityAdapter.js'
import { statusMeta, resolveIdentityStatus, canRetry } from './lib/identity/identityStatus.js'
import { identityErrorKey, isSoftError } from './lib/identity/identityErrors.js'
import { useLang } from './contexts/LanguageContext.jsx'
import Icon from './components/Icon.jsx'
import './SignupPage.css'
import './VerifyIdentityPage.css'

const FORWARD_DELAY = 1200 // 완료 화면을 잠깐 보여준 뒤 이동.

export default function VerifyIdentityPage() {
  const navigate = useNavigate()
  const { t } = useLang()
  const me = getCurrentUser()

  const adapterId = currentAdapterId()
  const agencyLabel = IDENTITY_AGENCY_LABELS[adapterId] || 'PASS'
  const isMock = adapterId === 'mock'

  // phase: idle | running | success | error / status: 사용자 표시 상태
  const [phase, setPhase] = useState('idle')
  const [status, setStatus] = useState('unverified')
  const [errorCode, setErrorCode] = useState('')
  const [linked, setLinked] = useState(false)
  const svcRef = useRef(null)
  const runningRef = useRef(false)   // 더블클릭/중복 호출 방지(state 지연 무관).
  const timerRef = useRef(null)
  const aliveRef = useRef(true)

  if (!svcRef.current) svcRef.current = new IdentityService(adapterId)

  // 인증 완료 후 이동할 다음 화면.
  const nextPath = useCallback((user) => {
    if (CLUB_ROLES.includes(user?.role)) return '/executive'
    if (ADMIN_ROLES.includes(user?.role)) return '/admin'
    if (user?.selectedTeam) return `/club/${user.selectedTeam}`
    return '/team-select'
  }, [])

  // 진입 가드 + 직전 세션 상태(진행중/실패/차단) 표시.
  useEffect(() => {
    aliveRef.current = true
    if (!me || !requiresIdentityVerification(me)) {
      navigate(nextPath(me), { replace: true })
      return () => { aliveRef.current = false }
    }
    // 서버에 남은 최신 세션 상태를 반영(차단/진행중이면 버튼 UX 가 달라진다).
    svcRef.current.currentStatus().then((s) => {
      if (aliveRef.current && s) setStatus(resolveIdentityStatus({ verified: false, latestSessionStatus: s }))
    }).catch(() => {})
    return () => { aliveRef.current = false; if (timerRef.current) clearTimeout(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleVerify() {
    if (runningRef.current) return       // 더블클릭 방지.
    runningRef.current = true
    setErrorCode(''); setLinked(false); setPhase('running'); setStatus('pending')

    let res
    try {
      res = await svcRef.current.verifyInteractive({ seed: me?.email || me?.id, providerUserId: me?.id })
    } catch {
      res = { ok: false, code: 'complete_error' }
    }
    if (!aliveRef.current) { runningRef.current = false; return }

    if (!res?.ok) {
      runningRef.current = false
      const code = res?.code || 'complete_error'
      // 사용자가 스스로 취소한 경우는 오류로 강조하지 않는다.
      setPhase(isSoftError(code) ? 'idle' : 'error')
      setStatus(resolveIdentityStatus({ verified: false, latestSessionStatus: code === 'expired' ? 'expired' : code === 'blocked' ? 'blocked' : 'failed' }))
      setErrorCode(code)
      return
    }

    // 성공: verified(신규) 또는 linked(동일 DI → 기존 계정 연결).
    setLinked(res.code === 'linked')
    setStatus('verified'); setPhase('success')
    await loadCurrentSupabaseUser().catch(() => {})
    runningRef.current = false
    timerRef.current = setTimeout(() => {
      if (aliveRef.current) navigate(nextPath(getCurrentUser()), { replace: true })
    }, FORWARD_DELAY)
  }

  const meta = statusMeta(status)
  const showError = phase === 'error' && errorCode && !isSoftError(errorCode)
  const retry = canRetry(status) && phase !== 'running'
  const blocked = status === 'blocked'

  return (
    <div className="signup-root">
      <div className="signup-card">
        <div className="signup-brand">FANCLUV</div>

        <div className="signup-header">
          <h1 className="signup-title">{t('identity.title')}</h1>
          <p className="signup-subtitle">{t('identity.subtitle')}</p>
        </div>

        {/* 상태 배지: 아이콘/색상/설명/다음행동 */}
        <div className={`vi-status vi-status-${meta.tone}`} role="status" aria-live="polite">
          <span className="vi-status-ico" aria-hidden="true">
            <Icon name={phase === 'running' ? 'loading' : meta.icon} size={22} />
          </span>
          <div className="vi-status-body">
            <span className="vi-status-label">{t(meta.labelKey)}</span>
            <span className="vi-status-desc">
              {phase === 'success' && linked ? t('identity.linkedMsg') : t(meta.descKey)}
            </span>
          </div>
        </div>

        {phase === 'idle' && (
          <ul className="vi-points">
            <li>{t('identity.point1')}</li>
            <li>{t('identity.point2')}</li>
            <li>{t('identity.point3')}</li>
          </ul>
        )}

        <p className="vi-agency">
          {t('identity.agencyLabel')}: <strong>{agencyLabel}</strong>
        </p>
        {isMock && phase === 'idle' && <p className="vi-mock-note">{t('identity.mockNote')}</p>}

        {showError && (
          <div className="su-error" role="alert">
            <Icon name="warningTriangle" size={14} className="fc-inline-ico" />
            {t(identityErrorKey(errorCode))}
          </div>
        )}

        {/* 진행/성공/실패에 따른 주 액션 */}
        {phase === 'success' ? (
          <button type="button" className="su-btn" onClick={() => navigate(nextPath(getCurrentUser()), { replace: true })}>
            {t('identity.continue')}
          </button>
        ) : blocked ? (
          <button type="button" className="su-btn" disabled aria-disabled="true">
            {t('identity.st.blocked')}
          </button>
        ) : (
          <button type="button" className="su-btn" onClick={handleVerify} disabled={phase === 'running' || !retry}>
            {phase === 'running' ? (
              <span className="su-btn-loading"><span className="su-spinner" />{t('identity.verifying')}</span>
            ) : (
              <span>{t(canRetry(status) && status !== 'unverified' ? 'identity.retryBtn' : 'identity.startBtn', { agency: agencyLabel })}</span>
            )}
          </button>
        )}

        {phase !== 'success' && (
          <button type="button" className="vi-later" onClick={() => navigate(nextPath(me), { replace: true })} disabled={phase === 'running'}>
            {t('identity.later')}
          </button>
        )}
      </div>
    </div>
  )
}
