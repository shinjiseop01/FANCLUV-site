// FANCLUV — 실시간 통계 재사용 컴포넌트 키트(§17).
// 기존 AdminCharts(LineChart/BarChart/DonutChart)를 재사용 — 새 차트 라이브러리 추가 없음(§18).
import { LineChart, BarChart, DonutChart } from '../../admin/AdminCharts.jsx'
import { useLang } from '../../contexts/LanguageContext.jsx'
import { formatCount, formatRating, metricDisplay } from '../../lib/stats/statsMetrics.js'
import './StatsKit.css'

// 단일 지표 카드 — 0 과 데이터 미수집(—)을 구분.
export function RealtimeMetricCard({ label, value, tone, kind = 'count', sub }) {
  const { lang } = useLang()
  const d = metricDisplay(value)
  const text = !d.hasData ? '—' : kind === 'rating' ? formatRating(d.value, lang) : formatCount(d.value, lang)
  return (
    <div className={`st-card${tone ? ' st-card-' + tone : ''}`}>
      <span className="st-card-v">{text}</span>
      <span className="st-card-l">{label}</span>
      {sub != null && <span className="st-card-sub">{sub}</span>}
    </div>
  )
}

// 분포 막대(카테고리/감성) — 색상 외 라벨·수치 병기(색상만으로 구분 금지).
export function DistributionBar({ items = [] }) {
  const total = items.reduce((s, x) => s + (Number(x.value) || 0), 0)
  if (!items.length || total === 0) return null
  return (
    <div className="st-dist" role="list">
      {items.map((it, i) => {
        const pct = Math.round((Number(it.value) || 0) / total * 100)
        return (
          <div key={i} className="st-dist-row" role="listitem">
            <span className="st-dist-label">{it.label}</span>
            <span className="st-dist-track"><span className="st-dist-fill" style={{ width: `${pct}%`, background: it.color || 'var(--team, #2563EB)' }} /></span>
            <span className="st-dist-val">{pct}% · {formatCount(it.value)}</span>
          </div>
        )
      })}
    </div>
  )
}

// 추이 차트 — 데이터 0/1개에서도 안전. 스크린리더용 요약 텍스트 병기(§18).
// ISO → 짧은 축 라벨(월/일 또는 시). 전체 ISO 문자열이 축에서 겹치지 않게 한다.
function shortLabel(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const h = String(d.getHours()).padStart(2, '0')
  return h === '00' ? `${d.getMonth() + 1}/${d.getDate()}` : `${h}:00`
}
export function TrendChart({ points = [], type = 'line', color, summaryText }) {
  const { t } = useLang()
  const data = (points || []).map(p => ({ label: shortLabel(p.t), value: Number(p.v) || 0 }))
  if (!data.length) return <StatsEmpty />
  const Chart = type === 'bar' ? BarChart : LineChart
  return (
    <div className="st-trend">
      <Chart data={data} color={color} />
      <p className="st-sr">{summaryText || t('stats.chartSummary')}</p>
    </div>
  )
}

export { DonutChart }

// 최근 활동 피드 — 비식별(사용자 표시 없음).
export function ActivityFeed({ items = [] }) {
  const { t } = useLang()
  if (!items.length) return <StatsEmpty label={t('stats.noActivity')} />
  return (
    <ul className="st-feed">
      {items.map((it, i) => (
        <li key={i} className="st-feed-item">
          <span className={`st-feed-dot st-feed-${it.type}`} aria-hidden="true" />
          <span className="st-feed-type">{t(`stats.act.${it.type}`) || it.type}</span>
          <span className="st-feed-title">{it.title || t(`stats.act.${it.type}`)}</span>
          <time className="st-feed-time" dateTime={it.created_at}>{relTime(it.created_at, t)}</time>
        </li>
      ))}
    </ul>
  )
}
function relTime(iso, t) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return t('stats.justNow'); if (m < 60) return `${m}m`; const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`
}

// 기간 선택 — 키보드 접근 가능한 버튼 그룹.
export function StatsPeriodSelector({ value, onChange, options }) {
  const { t } = useLang()
  const opts = options || [['24h', 'stats.p24h'], ['7d', 'stats.p7d'], ['30d', 'stats.p30d'], ['season', 'stats.season']]
  return (
    <div className="st-period" role="group" aria-label={t('stats.periodLabel')}>
      {opts.map(([v, k]) => (
        <button key={v} type="button" className={`st-period-btn${value === v ? ' on' : ''}`}
          aria-pressed={value === v} onClick={() => onChange(v)}>{t(k)}</button>
      ))}
    </div>
  )
}

// 마지막 업데이트/연결 상태 — 색상 외 텍스트로 상태 표시. aria-live 남발 금지(polite, 텍스트만).
export function LastUpdatedIndicator({ connection, updatedAt, stale }) {
  const { t } = useLang()
  const label = stale ? t('stats.stale')
    : connection === 'live' ? t('stats.live')
    : connection === 'reconnecting' ? t('stats.reconnecting')
    : connection === 'connecting' ? t('stats.connecting') : t('stats.polling')
  return (
    <span className={`st-updated st-conn-${stale ? 'stale' : connection}`}>
      <span className="st-dot" aria-hidden="true" />
      <span>{label}</span>
      {updatedAt && <span className="st-updated-t"> · {t('stats.updated')} {new Date(updatedAt).toLocaleTimeString()}</span>}
    </span>
  )
}

// 상태 컴포넌트.
export function StatsSkeleton({ count = 4 }) {
  return <div className="st-cards">{Array.from({ length: count }).map((_, i) => <div key={i} className="st-card st-skel" aria-hidden="true" />)}</div>
}
export function StatsEmpty({ label }) {
  const { t } = useLang()
  return <div className="st-state st-empty">{label || t('stats.empty')}</div>
}
export function StatsError({ code, onRetry }) {
  const { t } = useLang()
  const msg = code === 'forbidden' ? t('stats.denied') : t('stats.error')
  return (
    <div className="st-state st-error" role="alert">
      <span>{msg}</span>
      {code !== 'forbidden' && onRetry && <button type="button" className="st-retry" onClick={onRetry}>{t('stats.retry')}</button>}
    </div>
  )
}
