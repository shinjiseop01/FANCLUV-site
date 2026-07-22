// FANCLUV Admin — 실시간 통계 대시보드(§10, §22). Summary / Trends / Teams / Activity + 운영.
import { useState, useEffect, useCallback } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { getAdminDashboard, getTimeseries, rebuildTeam, verifyConsistency, getStatsSettings, setStatsSettings } from '../lib/stats/realtimeStatsRepo.js'
import { RealtimeMetricCard, TrendChart, ActivityFeed, StatsPeriodSelector, LastUpdatedIndicator, StatsSkeleton, StatsError } from '../components/stats/StatsKit.jsx'
import { formatRating } from '../lib/stats/statsMetrics.js'
import '../components/stats/StatsKit.css'
import './AdminRealtimeDashboard.css'

const PERIOD_DAYS = { '24h': 1, '7d': 7, '30d': 30, season: 90 }

export default function AdminRealtimeDashboard() {
  const { t } = useLang()
  const [dash, setDash] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [period, setPeriod] = useState('7d')
  const [trend, setTrend] = useState([])
  const [settings, setSettings] = useState(null)
  const [busy, setBusy] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)
  const [note, setNote] = useState('')

  const load = useCallback(async (force = false) => {
    setLoading(true); setError(null)
    const d = await getAdminDashboard(PERIOD_DAYS[period], { force })
    if (d?.ok === false) { setError(d.code || 'error'); setLoading(false); return }
    setDash(d); setUpdatedAt(Date.now()); setLoading(false)
    // 팀별 개별 RPC 반복 금지 → 대표 팀 1개의 timeseries 만 예시로 로드
    const top = d.teams?.[0]?.team_id
    if (top) { const ts = await getTimeseries(top, 'opinions', period === '24h' ? 'hour' : 'day'); setTrend(ts?.points || []) }
    getStatsSettings().then(s => { if (s?.ok !== false) setSettings(s) })
  }, [period])

  useEffect(() => { load() }, [load])

  async function doRebuild(teamId) {
    setBusy(teamId); setNote('')
    await rebuildTeam(teamId)
    const v = await verifyConsistency(teamId)
    setBusy('')
    setNote(v?.consistent ? t('stats.admin.rebuildOk') : t('stats.admin.driftFound'))
    load(true)
  }
  async function saveSetting(patch) {
    const r = await setStatsSettings(patch)
    if (r?.ok !== false) setSettings(s => ({ ...s, ...r }))
  }

  const s = dash?.summary || {}
  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <div className="ard-head">
          <div><h1 className="adm-h1">{t('admin.menu.realtimeStats')}</h1><p className="adm-sub">{t('stats.admin.sub')}</p></div>
          <LastUpdatedIndicator connection={settings?.enabled === false ? 'polling' : 'live'} updatedAt={updatedAt} stale={false} />
        </div>
      </header>

      {error ? <div className="adm-card"><StatsError code={error} onRetry={() => load(true)} /></div> : loading && !dash ? (
        <div className="adm-card"><StatsSkeleton count={8} /></div>
      ) : (
        <>
          {/* Summary */}
          <section className="adm-card">
            <h2 className="adm-h2">{t('stats.admin.summary')}</h2>
            <div className="st-cards">
              <RealtimeMetricCard label={t('stats.admin.newOpinions')} value={s.new_opinions_today} tone="accent" />
              <RealtimeMetricCard label={t('stats.admin.newMembers')} value={s.new_members_today} />
              <RealtimeMetricCard label={t('stats.admin.likes')} value={s.likes_today} />
              <RealtimeMetricCard label={t('stats.admin.comments')} value={s.comments_today} />
              <RealtimeMetricCard label={t('stats.admin.survey')} value={s.survey_responses_today} />
              <RealtimeMetricCard label={t('stats.admin.pulse')} value={s.pulse_votes_today} />
              <RealtimeMetricCard label={t('stats.admin.quickPoll')} value={s.quick_poll_votes_today} />
              <RealtimeMetricCard label={t('stats.admin.active24h')} value={s.active_users_24h} />
            </div>
          </section>

          {/* Trends */}
          <section className="adm-card">
            <div className="ard-row"><h2 className="adm-h2">{t('stats.admin.trends')}</h2>
              <StatsPeriodSelector value={period} onChange={setPeriod} /></div>
            <TrendChart points={trend} type="bar" summaryText={t('stats.admin.trendSummary')} />
          </section>

          {/* Teams */}
          <section className="adm-card">
            <h2 className="adm-h2">{t('stats.admin.teams')}</h2>
            <div className="ard-table-wrap">
              <table className="ard-table">
                <thead><tr>
                  <th>{t('stats.admin.team')}</th><th>{t('stats.opinions')}</th><th>{t('stats.likes')}</th>
                  <th>{t('stats.comments')}</th><th>{t('stats.avgRating')}</th><th></th>
                </tr></thead>
                <tbody>
                  {(dash?.teams || []).map(tm => (
                    <tr key={tm.team_id}>
                      <td>{tm.team_id}</td><td>{tm.opinions ?? tm.opinions_total ?? 0}</td><td>{tm.likes ?? tm.likes_total ?? 0}</td>
                      <td>{tm.comments ?? tm.comments_total ?? 0}</td><td>{formatRating(tm.average_rating)}</td>
                      <td><button type="button" className="ard-mini" disabled={busy === tm.team_id} onClick={() => doRebuild(tm.team_id)}>{t('stats.admin.rebuild')}</button></td>
                    </tr>
                  ))}
                  {!(dash?.teams || []).length && <tr><td colSpan={6} className="ard-empty">{t('stats.empty')}</td></tr>}
                </tbody>
              </table>
            </div>
            {note && <p className="ard-note">{note}</p>}
          </section>

          {/* Activity */}
          <section className="adm-card">
            <h2 className="adm-h2">{t('stats.admin.activity')}</h2>
            <ActivityFeed items={dash?.recent_activity || []} />
          </section>

          {/* Settings */}
          {settings && (
            <section className="adm-card">
              <h2 className="adm-h2">{t('stats.admin.settings')}</h2>
              <div className="ard-settings">
                <label className="ard-toggle">
                  <input type="checkbox" checked={settings.enabled !== false} onChange={e => saveSetting({ enabled: e.target.checked })} />
                  <span>{t('stats.admin.enabled')}</span>
                </label>
                <label className="ard-field"><span>{t('stats.admin.polling')}</span>
                  <input type="number" min={10} max={3600} value={settings.polling_interval_secs || 30}
                    onChange={e => saveSetting({ polling: Math.max(10, +e.target.value || 30) })} /></label>
                <label className="ard-field"><span>{t('stats.admin.minAgg')}</span>
                  <input type="number" min={1} max={100} value={settings.min_aggregation || 5}
                    onChange={e => saveSetting({ minAgg: Math.max(1, +e.target.value || 5) })} /></label>
                <span className="ard-lastrebuild">{t('stats.admin.lastRebuild')}: {settings.last_rebuild_at ? new Date(settings.last_rebuild_at).toLocaleString() : '—'}</span>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
