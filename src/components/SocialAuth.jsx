// Shared social login / signup buttons (Google · Kakao · NAVER).
// Reused on both LoginPage and SignupPage. Actual OAuth flow lives in
// lib/oauth.js (mock for now); account handling in lib/auth.socialLogin().
import { useState } from 'react'
import { OAUTH_PROVIDERS } from '../lib/oauth.js'
import { socialLogin } from '../lib/auth.js'
import { useLang } from '../contexts/LanguageContext.jsx'
import './SocialAuth.css'

// Official brand marks (inline SVG) keyed by provider id.
const LOGOS = {
  google: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  ),
  kakao: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#191600" d="M12 3.5C6.75 3.5 2.5 6.79 2.5 10.86c0 2.63 1.77 4.94 4.42 6.24-.19.69-.71 2.58-.81 2.98-.13.5.18.49.38.36.16-.11 2.5-1.7 3.52-2.39.49.07.99.11 1.49.11 5.25 0 9.5-3.29 9.5-7.31S17.25 3.5 12 3.5z"/>
    </svg>
  ),
  naver: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#FFFFFF" d="M16.273 12.845 7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z"/>
    </svg>
  ),
}

export default function SocialAuth({ onSuccess, onError, onStart }) {
  const { t } = useLang()
  const [busy, setBusy] = useState(null) // provider id currently authenticating

  async function handleClick(providerId) {
    if (busy) return // 중복 클릭 방지(진행 중이면 무시)
    onError?.('')
    onStart?.()
    setBusy(providerId)
    const res = await socialLogin(providerId)
    // OAuth 리다이렉트(예: Supabase Google)는 브라우저가 이동하므로 여기서 처리하지 않는다.
    if (res.redirecting) return
    setBusy(null)
    if (res.ok) { onSuccess?.(res); return }
    // 실패: 콘솔에는 provider + 코드/메시지만 기록(토큰·시크릿·인가코드 미기록).
    // eslint-disable-next-line no-console
    console.error(`[oauth] ${providerId} login failed:`, res.code || res.error || 'unknown')
    // 사용자에게는 provider별 친화적 문구(구체 사유가 있으면 함께).
    const base = t(`auth.err.${providerId}`)
    onError?.(res.error ? `${base} (${res.error})` : base)
  }

  return (
    <div className="social-auth">
      <div className="social-divider"><span>{t('auth.or')}</span></div>

      <div className="social-buttons">
        {OAUTH_PROVIDERS.map(p => (
          <button
            key={p.id}
            type="button"
            className={`social-btn social-${p.id}`}
            onClick={() => handleClick(p.id)}
            disabled={!!busy}
            aria-label={t('auth.continueWith', { provider: p.label })}
          >
            <span className="social-icon">
              {busy === p.id ? <span className="social-spinner" /> : LOGOS[p.id]}
            </span>
            <span className="social-label">{t('auth.continueWith', { provider: p.label })}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
