// FANCLUV — 본인인증 필요 안내 배너.
// 설문 참여 / 팬 의견 작성 / 댓글 작성 등 핵심 기능에서 본인인증 미완료 시 노출한다.
// (뉴스 조회 등 일반 열람은 게이팅하지 않는다.)
import { useNavigate } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext.jsx'

export default function IdentityNotice() {
  const navigate = useNavigate()
  const { t } = useLang()
  return (
    <div className="id-notice" role="alert">
      <span className="id-notice-ic" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </span>
      <div className="id-notice-body">
        <strong>{t('identity.gateTitle')}</strong>
        <p>{t('identity.gateDesc')}</p>
      </div>
      <button type="button" className="id-notice-btn" onClick={() => navigate('/verify-identity')}>
        {t('identity.gateCta')}
      </button>
    </div>
  )
}
