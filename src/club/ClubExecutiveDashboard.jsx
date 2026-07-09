import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext.jsx'
import { useTheme } from '../contexts/ThemeContext.jsx'
import { logout, getClubId, isAdmin } from '../lib/auth.js'
import { TEAMS, getTeam, TeamEmblem, teamName } from '../teams.jsx'
import Icon from '../components/Icon.jsx'
import DemoBadge from '../components/DemoBadge.jsx'
import { isMockMode } from '../lib/supabase.js'
import { SkeletonList } from '../components/Skeleton.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { LineChart } from '../admin/AdminCharts.jsx'
import { getClubDashboard, getKpiTrend, getClubReports, getBenchmark } from '../lib/club/clubDashboardRepo.js'
import { generateReportPdfFromDoc } from '../lib/ai/report/index.js'
import './ClubExecutive.css'

const TREND_PERIODS = [
  { key: 'week', labelKey: 'exec.pWeek' },
  { key: 'month', labelKey: 'exec.pMonth' },
  { key: '3m', labelKey: 'exec.p3m' },
  { key: 'season', labelKey: 'exec.pSeason' },
]
const RATING_CLS = { excellent: 'tr-r-excellent', effective: 'tr-r-effective', no_change: 'tr-r-nochange', monitor: 'tr-r-monitor' }

export default function ClubExecutiveDashboard() {
  const { t, lang, setLang } = useLang()
  const { resolved, setTheme } = useTheme()
  const navigate = useNavigate()

  // 구단 계정은 자기 구단 고정. 관리자는 구단 선택(모든 구단 확인 가능 — §11).
  const ownClub = getClubId()
  const admin = isAdmin()
  const [clubId, setClubId] = useState(ownClub || (admin ? TEAMS[0].id : null))

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [trend, setTrend] = useState([])
  const [period, setPeriod] = useState('3m')
  const [reports, setReports] = useState([])
  const [benchmark, setBenchmark] = useState(null)
  const [dlBusy, setDlBusy] = useState(null)

  const load = useCallback(async () => {
    if (!clubId) return
    setLoading(true)
    const [d, r, b] = await Promise.all([getClubDashboard(clubId), getClubReports(clubId), getBenchmark(clubId)])
    setData(d); setReports(r); setBenchmark(b); setLoading(false)
  }, [clubId])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (clubId) getKpiTrend(clubId, period).then(setTrend) }, [clubId, period])

  async function downloadReport(rep) {
    setDlBusy(rep.id)
    try { await generateReportPdfFromDoc(rep, t) } catch { /* ignore */ }
    setDlBusy(null)
  }

  const team = getTeam(clubId)
  const kpi = data?.kpi
  const effects = data?.effects || []
  const clubIntel = effects.length ? Math.round(effects.reduce((s, e) => s + (e.intelligenceScore || 0), 0) / effects.length) : (kpi?.satisfaction ?? null)

  const chg = (v, invert) => {
    if (v == null || v === 0) return { txt: '', cls: 'flat' }
    const good = invert ? v < 0 : v > 0
    return { txt: `${v > 0 ? '+' : ''}${v}`, cls: good ? 'up' : 'down' }
  }
  const KPI_CARDS = kpi ? [
    { label: 'Fan Satisfaction', value: kpi.satisfaction, ck: 'satisfaction' },
    { label: 'NPS', value: kpi.nps, ck: 'nps' },
    { label: 'Complaint Index', value: kpi.complaintIndex, ck: 'complaintIndex', invert: true },
    { label: 'Engagement', value: kpi.engagement, ck: 'engagement' },
    { label: 'Participation', value: `${kpi.participationRate}%`, ck: 'participationRate' },
  ] : []

  return (
    <div className="ch-root exec-root">
      {/* Executive 헤더 (관리자 콘솔/팬 헤더와 별개) */}
      <header className="exec-header">
        <div className="exec-brand">FANCLUV <span>Executive</span></div>
        <div className="exec-head-right">
          {team && <span className="exec-club"><TeamEmblem color={team.color} size={22} /> {teamName(team, lang)}</span>}
          {admin && (
            <select className="exec-club-select" value={clubId} onChange={e => setClubId(e.target.value)} aria-label={t('exec.selectClub')}>
              {TEAMS.map(tm => <option key={tm.id} value={tm.id}>{teamName(tm, lang)}</option>)}
            </select>
          )}
          <button className="exec-icon-btn" onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')} aria-label="language">{lang === 'ko' ? 'EN' : '한'}</button>
          <button className="exec-icon-btn" onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')} aria-label="theme">
            <Icon name={resolved === 'dark' ? 'smile' : 'meh'} size={16} />
          </button>
          <button className="exec-logout" onClick={() => { logout(); navigate('/') }}>{t('common.logout')}</button>
        </div>
      </header>

      <main className="exec-main">
        <div className="exec-title-row">
          <h1 className="exec-title">{t('exec.title')} {isMockMode && <DemoBadge />}</h1>
          <p className="exec-sub">{teamName(team, lang)} · {t('exec.subtitle')}</p>
        </div>

        {loading ? <SkeletonList count={4} lines={3} /> : !data?.ok ? (
          <EmptyState iconName="alert" title={t('exec.noAccess')} message={t('exec.noAccessMsg')} />
        ) : (
          <>
            {/* Executive Brief — 가장 먼저 (요구사항 2) */}
            <section className="exec-brief">
              <div className="exec-brief-head"><Icon name="sparkle" size={18} /> {t('exec.brief')}</div>
              {data.brief.map((line, i) => <p key={i} className="exec-brief-line">{line}</p>)}
            </section>

            {/* KPI 카드 (요구사항 3) */}
            <section className="exec-kpi-grid">
              {KPI_CARDS.map((c, i) => {
                const d = chg(kpi.change?.[c.ck], c.invert)
                return (
                  <div key={i} className="exec-kpi-card">
                    <div className="exec-kpi-val">{c.value}{d.txt && <span className={`exec-kpi-chg ${d.cls}`}>{d.txt}</span>}</div>
                    <div className="exec-kpi-label">{c.label}</div>
                  </div>
                )
              })}
              <div className="exec-kpi-card exec-intel">
                <div className="exec-kpi-val">{clubIntel ?? '—'}<span className="exec-intel-max">/100</span></div>
                <div className="exec-kpi-label">{t('exec.intelligence')}</div>
              </div>
            </section>

            <div className="exec-cols">
              {/* 이번 주 AI Summary + 이번 달 핵심 이슈 (요구사항 3) */}
              <section className="exec-panel">
                <h2 className="exec-panel-title"><Icon name="sparkle" size={16} /> {t('exec.aiSummary')}</h2>
                {data.insight ? (
                  <>
                    <p className="exec-summary">{data.insight.summary || t('exec.noInsight')}</p>
                    {data.insight.keywords.length > 0 && (
                      <div className="exec-keywords">
                        {data.insight.keywords.map((k, i) => <span key={i} className="exec-kw">#{k}</span>)}
                      </div>
                    )}
                    <h3 className="exec-sub2">{t('exec.monthlyIssues')}</h3>
                    <ul className="exec-issues">
                      {(data.insight.categoryIssues.length ? data.insight.categoryIssues.map(c => c.issue || c.category) : data.insight.recommendations.map(r => r.title)).slice(0, 4).map((x, i) => (
                        <li key={i}><Icon name="flag" size={12} /> {x}</li>
                      ))}
                    </ul>
                  </>
                ) : <EmptyState iconName="sparkle" title={t('exec.noInsight')} message={t('exec.noInsightMsg')} compact />}
              </section>

              {/* KPI Trend (요구사항 6) */}
              <section className="exec-panel">
                <div className="exec-panel-head">
                  <h2 className="exec-panel-title"><Icon name="chart" size={16} /> {t('exec.kpiTrend')}</h2>
                  <div className="tr-period">
                    {TREND_PERIODS.map(p => (
                      <button key={p.key} className={`tr-period-btn${period === p.key ? ' on' : ''}`} onClick={() => setPeriod(p.key)}>{t(p.labelKey)}</button>
                    ))}
                  </div>
                </div>
                {trend.length > 0 ? (
                  <>
                    <LineChart data={trend.map(r => ({ label: r.week?.replace(/^\d+-/, '') || '', value: r.satisfaction }))} />
                    <p className="exec-trend-note">{t('exec.trendNote')}</p>
                  </>
                ) : <EmptyState iconName="chart" title={t('exec.noTrend')} message={t('exec.noTrendMsg')} compact />}
              </section>
            </div>

            {/* 최근 Club Action + KPI 변화 (요구사항 7) */}
            <section className="exec-panel">
              <h2 className="exec-panel-title"><Icon name="check" size={16} /> {t('exec.recentActions')}</h2>
              {effects.length > 0 ? (
                <div className="exec-actions">
                  {effects.map(e => (
                    <div key={e.action.id} className="exec-action">
                      <div className="exec-action-head">
                        <span className="exec-action-title">{e.action.title}</span>
                        <span className={`tr-rating ${RATING_CLS[e.rating]}`}>{t(`admin.tracker.rating.${e.rating}`)}</span>
                      </div>
                      <div className="exec-action-deltas">
                        <span className={`exec-ad ${e.deltas.satisfaction > 0 ? 'up' : e.deltas.satisfaction < 0 ? 'down' : 'flat'}`}>Fan Satisfaction {e.deltas.satisfaction > 0 ? '+' : ''}{e.deltas.satisfaction}</span>
                        <span className={`exec-ad ${e.deltas.complaintIndex < 0 ? 'up' : e.deltas.complaintIndex > 0 ? 'down' : 'flat'}`}>Complaint {e.deltas.complaintIndex > 0 ? '+' : ''}{e.deltas.complaintIndex}</span>
                        <span className={`exec-ad ${e.deltas.engagement > 0 ? 'up' : e.deltas.engagement < 0 ? 'down' : 'flat'}`}>Engagement {e.deltas.engagement > 0 ? '+' : ''}{e.deltas.engagement}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState iconName="check" title={t('exec.noActions')} message={t('exec.noActionsMsg')} compact />}
            </section>

            <div className="exec-cols">
              {/* Report Center (요구사항 8) */}
              <section className="exec-panel">
                <h2 className="exec-panel-title"><Icon name="news" size={16} /> {t('exec.reports')}</h2>
                {reports.length > 0 ? (
                  <ul className="exec-reports">
                    {reports.map(r => (
                      <li key={r.id} className="exec-report">
                        <div>
                          <span className="exec-report-title">{r.title}</span>
                          <span className="exec-report-date">{String(r.deliveredAt || r.createdAt).slice(0, 10)}</span>
                        </div>
                        <button className="exec-dl" onClick={() => downloadReport(r)} disabled={dlBusy === r.id}>
                          <Icon name="external" size={13} /> {dlBusy === r.id ? t('exec.downloading') : 'PDF'}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <EmptyState iconName="news" title={t('exec.noReports')} message={t('exec.noReportsMsg')} compact />}
              </section>

              {/* Benchmark (요구사항 9) */}
              <section className="exec-panel">
                <h2 className="exec-panel-title"><Icon name="trophy" size={16} /> {t('exec.benchmark')}</h2>
                {benchmark ? (
                  <div className="exec-bench">
                    {benchmark.metrics.map(m => {
                      const d = chg(m.delta, m.invert)
                      return (
                        <div key={m.key} className="exec-bench-row">
                          <span className="exec-bench-name">{t(`exec.m.${m.key}`)}</span>
                          <span className="exec-bench-own">{m.own}</span>
                          <span className="exec-bench-vs">vs</span>
                          <span className="exec-bench-league">{m.league}</span>
                          <span className={`exec-bench-delta ${d.cls}`}>({d.txt || '±0'})</span>
                        </div>
                      )
                    })}
                    <p className="exec-bench-note">{t('exec.benchNote')}</p>
                  </div>
                ) : <EmptyState iconName="trophy" title="—" message="" compact />}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
