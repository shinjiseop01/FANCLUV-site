// FANCLUV — "데모 데이터" 배지.
// 실제 외부 API(리그/뉴스) 연동 전에는 데모(Mock/폴백) 데이터가 노출되므로,
// 사용자·구단이 실데이터로 오인하지 않도록 명확히 표시한다.
import { useLang } from '../contexts/LanguageContext.jsx'

export default function DemoBadge({ className = '' }) {
  const { t } = useLang()
  return (
    <span className={`demo-badge ${className}`} title={t('common.demoDataHint')}>
      {t('common.demoData')}
    </span>
  )
}
