// FANCLUV — 팀 홈 팬 공개 통계 요약(§9). 참여 유도 범위만. 내부 운영수치·식별정보 미노출.
import { useRealtimeStats } from '../../hooks/useRealtimeStats.js'
import { useLang } from '../../contexts/LanguageContext.jsx'
import { RealtimeMetricCard, LastUpdatedIndicator, StatsSkeleton, StatsError } from './StatsKit.jsx'
import './StatsKit.css'

export default function TeamStatsSummary({ teamId }) {
  const { t } = useLang()
  const { data, loading, error, connection, updatedAt, stale, refresh } = useRealtimeStats(teamId, { role: 'fan' })

  if (loading && !data) return <section className="st-summary" aria-label={t('stats.fanTitle')}><StatsSkeleton count={4} /></section>
  if (error) return <section className="st-summary"><StatsError code={error} onRetry={refresh} /></section>
  if (!data || data.ok === false) return null

  return (
    <section className="st-summary" aria-label={t('stats.fanTitle')}>
      <div className="st-summary-head">
        <h3 className="st-summary-title">{t('stats.fanTitle')}</h3>
        <LastUpdatedIndicator connection={connection} updatedAt={updatedAt} stale={stale} />
      </div>
      <div className="st-cards">
        <RealtimeMetricCard label={t('stats.opinionsToday')} value={data.opinions_today} tone="accent" />
        <RealtimeMetricCard label={t('stats.avgRating')} value={data.average_rating} kind="rating" />
        <RealtimeMetricCard label={t('stats.activeUsers')} value={data.active_users_24h} />
        <RealtimeMetricCard label={t('stats.likesToday')} value={data.likes_today} />
      </div>
    </section>
  )
}
