import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext.jsx'
import { getCurrentUser } from '../lib/auth.js'
import { getAdminDashboard, refreshAdminDashboard } from '../lib/admin/adminStats.js'
import { LineChart, BarChart } from './AdminCharts.jsx'
import { TEAMS, getTeam } from '../teams.jsx'
import { runAnalysis } from '../lib/ai/analyzeFanInsights.js'
import { createNotice } from '../lib/noticesRepo.js'
import EmptyState from '../components/EmptyState.jsx'
import Icon from '../components/Icon.jsx'

// KPI 카드 정의 (값 key + 라벨 + 아이콘). 값은 adminStats 의 kpi 에서 온다.
const KPI_CARDS = [
  { key: 'totalMembers',       labelKey: 'admin.dash.totalMembers',   icon: 'users' },
  { key: 'activeMembers',      labelKey: 'admin.dash.activeMembers',  icon: 'userCheck' },
  { key: 'totalOpinions',      labelKey: 'admin.dash.totalOpinions',  icon: 'comment' },
  { key: 'totalComments',      labelKey: 'admin.dash.totalComments',  icon: 'comment' },
  { key: 'totalSurveys',       labelKey: 'admin.dash.totalSurveys',   icon: 'chart' },
  { key: 'totalResponses',     labelKey: 'admin.dash.totalResponses', icon: 'vote' },
  { key: 'totalReports',       labelKey: 'admin.dash.totalReports',   icon: 'flag' },
  { key: 'aiRuns',             labelKey: 'admin.dash.aiRuns',         icon: 'sparkle' },
  { key: 'signupsToday',       labelKey: 'admin.dash.signupsToday',   icon: 'userCheck' },
  { key: 'newMembersThisWeek', labelKey: 'admin.dash.newMembersWeek', icon: 'users' },
]

// 최근 활동 타입별 아이콘 + 라벨 키
const ACTIVITY = {
  signup:   { icon: 'users',   labelKey: 'admin.act.signup' },
  opinion:  { icon: 'edit',    labelKey: 'admin.act.opinion' },
  comment:  { icon: 'comment', labelKey: 'admin.act.comment' },
  survey:   { icon: 'chart',   labelKey: 'admin.act.survey' },
  response: { icon: 'vote',    labelKey: 'admin.act.response' },
  report:   { icon: 'flag',    labelKey: 'admin.act.report' },
  ai:       { icon: 'sparkle', labelKey: 'admin.act.ai' },
}

// 차트 패널 정의 (series key + 제목 + 컴포넌트)
const CHARTS = [
  { key: 'signups',   labelKey: 'admin.dash.chartSignups',   type: 'line' },
  { key: 'opinions',  labelKey: 'admin.dash.chartOpinions',  type: 'bar' },
  { key: 'responses', labelKey: 'admin.dash.chartResponses', type: 'line' },
  { key: 'reports',   labelKey: 'admin.dash.chartReports',   type: 'bar' },
  { key: 'aiRuns',    labelKey: 'admin.dash.chartAiRuns',    type: 'bar' },
]

function trim(text, n = 34) {
  const s = String(text || '')
  return s.length > n ? s.slice(0, n) + '…' : s
}
const hasData = series => Array.isArray(series) && series.some(p => Number(p.value) > 0)

export default function AdminDashboard() {
  const { t } = useLang()
  const navigate = useNavigate()
  const admin = getCurrentUser()

  // 대시보드 집계 (KPI·구단별·최근활동·차트). null = 로딩 중. 30초 캐시 + 새로고침.
  const [data, setData] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  useEffect(() => {
    let active = true
    getAdminDashboard().then(d => { if (active) setData(d) })
    return () => { active = false }
  }, [])

  async function onRefresh() {
    setRefreshing(true)
    const d = await refreshAdminDashboard()
    setData(d)
    setRefreshing(false)
  }

  const kpi = data?.kpi || {}
  const teams = data?.teams || []
  const recent = data?.recent || []
  const charts = data?.charts || {}
  const teamName = id => teams.find(tm => tm.id === id)?.name || getTeam(id)?.name || id

  // 최근 활동 항목의 보조 정보(작성자 · 구단 / 신고 사유) 문자열
  function activityMeta(a) {
    const parts = []
    if (a.type === 'report' && a.actor) parts.push(t(`report.reason.${a.actor}`))
    else if (a.actor) parts.push(a.actor)
    if (a.team) parts.push(teamName(a.team))
    return parts.join(' · ')
  }

  // AI 팬 인사이트 분석 실행
  const [aiClub, setAiClub] = useState('all')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMsg, setAiMsg] = useState('')
  async function runAi() {
    setAiBusy(true); setAiMsg('')
    const res = await runAnalysis(aiClub)
    setAiBusy(false)
    if (res.ok) {
      setAiMsg(t('admin.ai.done'))
      refreshAdminDashboard().then(setData)   // AI 실행 횟수 KPI 즉시 갱신
      return
    }
    if (res.code === 'insufficient') { setAiMsg(t('admin.ai.insufficient', { count: res.count ?? 0, min: res.min || 30 })); return }
    const map = {
      openai_not_configured: 'admin.ai.errNoKey',
      forbidden: 'admin.ai.errForbidden',
      unauthorized: 'admin.ai.errForbidden',
      network: 'admin.ai.errNetwork',
    }
    setAiMsg(t(map[res.code] || 'admin.ai.failed'))
  }

  // 관리자 공지 발송 → 대상 팬에게 'notice' 알림 생성
  const [noticeTitle, setNoticeTitle] = useState('')
  const [noticeBody, setNoticeBody] = useState('')
  const [noticeTeam, setNoticeTeam] = useState('all')
  const [noticeBusy, setNoticeBusy] = useState(false)
  const [noticeMsg, setNoticeMsg] = useState('')
  async function sendNotice() {
    setNoticeBusy(true); setNoticeMsg('')
    const res = await createNotice({ title: noticeTitle, body: noticeBody, teamId: noticeTeam === 'all' ? null : noticeTeam })
    setNoticeBusy(false)
    if (res.ok) {
      setNoticeTitle(''); setNoticeBody(''); setNoticeTeam('all')
      setNoticeMsg(t('admin.notice.sent'))
    } else {
      setNoticeMsg(res.error || t('admin.notice.fail'))
    }
  }
  const noticeReady = noticeTitle.trim() && noticeBody.trim()

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <div className="adm-head-row">
          <div>
            <h1 className="adm-h1">{t('admin.console')}</h1>
            <p className="adm-sub">{t('admin.dash.welcome', { name: admin?.nickname || 'Admin' })}</p>
          </div>
          <div className="adm-head-actions">
            {data?.source === 'mock' && (
              <span className="adm-mock-chip" title={t('admin.dash.mockHint')}>{t('admin.dash.mockNote')}</span>
            )}
            {data?.source === 'supabase' && (
              <span className="adm-live-chip" title={t('admin.dash.liveHint')}>{t('admin.dash.liveNote')}</span>
            )}
            <button className="adm-refresh-btn" onClick={onRefresh} disabled={refreshing || !data}>
              <Icon name="refresh" size={15} className={refreshing ? 'adm-spin' : ''} />
              {refreshing ? t('admin.dash.refreshing') : t('admin.dash.refresh')}
            </button>
          </div>
        </div>
      </header>

      {/* 1) KPI 카드 */}
      <div className="adm-stat-grid">
        {KPI_CARDS.map(c => (
          <div key={c.key} className="adm-stat">
            <span className="adm-stat-icon" aria-hidden="true"><Icon name={c.icon} size={20} /></span>
            <span className="adm-stat-value">{Number(kpi[c.key] || 0).toLocaleString()}</span>
            <span className="adm-stat-label">{t(c.labelKey)}</span>
          </div>
        ))}
      </div>

      {/* 관리자 빠른 작업 */}
      <section className="adm-dash-section">
        <div className="adm-quick-grid">
          <button className="adm-quick-btn" onClick={() => navigate('/admin/surveys')}><Icon name="chart" size={17} /> {t('admin.dash.qCreateSurvey')}</button>
          <button className="adm-quick-btn" onClick={() => navigate('/admin/news')}><Icon name="news" size={17} /> {t('admin.dash.qCreateNews')}</button>
          <button className="adm-quick-btn" onClick={() => navigate('/admin/members')}><Icon name="users" size={17} /> {t('admin.dash.qMembers')}</button>
          <button className="adm-quick-btn" onClick={() => navigate('/admin/reports')}><Icon name="flag" size={17} /> {t('admin.dash.qReports')}</button>
        </div>
      </section>

      {/* AI 팬 인사이트 분석 실행 */}
      <section className="adm-panel adm-dash-section">
        <div className="adm-panel-head"><h2 className="adm-panel-title"><Icon name="sparkle" size={17} /> {t('admin.ai.title')}</h2></div>
        <div className="adm-ai-run">
          <select className="adm-input" value={aiClub} onChange={e => setAiClub(e.target.value)} aria-label={t('admin.ai.title')}>
            <option value="all">{t('admin.ai.allClubs')}</option>
            {TEAMS.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
          </select>
          <button className="adm-btn-primary" onClick={runAi} disabled={aiBusy}>
            {aiBusy ? t('admin.ai.running') : t('admin.ai.run')}
          </button>
        </div>
        {aiMsg && <p className="adm-ai-msg" role="status">{aiMsg}</p>}
      </section>

      {/* 관리자 공지 발송 */}
      <section className="adm-panel adm-dash-section">
        <div className="adm-panel-head"><h2 className="adm-panel-title"><Icon name="megaphone" size={17} /> {t('admin.notice.title')}</h2></div>
        <p className="adm-sub adm-notice-sub">{t('admin.notice.desc')}</p>
        <div className="adm-notice-form">
          <div className="adm-notice-row">
            <input
              className="adm-input"
              value={noticeTitle}
              onChange={e => setNoticeTitle(e.target.value)}
              placeholder={t('admin.notice.titlePh')}
              maxLength={80}
              aria-label={t('admin.notice.titlePh')}
            />
            <select className="adm-input adm-notice-team" value={noticeTeam} onChange={e => setNoticeTeam(e.target.value)} aria-label={t('admin.notice.target')}>
              <option value="all">{t('admin.notice.allTeams')}</option>
              {TEAMS.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
            </select>
          </div>
          <textarea
            className="adm-input"
            rows={3}
            value={noticeBody}
            onChange={e => setNoticeBody(e.target.value)}
            placeholder={t('admin.notice.bodyPh')}
            maxLength={500}
            aria-label={t('admin.notice.bodyPh')}
          />
          <div className="adm-notice-foot">
            {noticeMsg && <span className="adm-ai-msg" role="status">{noticeMsg}</span>}
            <button className="adm-btn-primary" onClick={sendNotice} disabled={noticeBusy || !noticeReady}>
              {noticeBusy ? t('admin.notice.sending') : t('admin.notice.send')}
            </button>
          </div>
        </div>
      </section>

      {/* 4) 차트 — 실데이터 일별 추이. 데이터 부족 시 Empty State */}
      <div className="adm-grid-2">
        {CHARTS.map(c => (
          <section key={c.key} className="adm-panel">
            <div className="adm-panel-head"><h2 className="adm-panel-title">{t(c.labelKey)}</h2></div>
            {hasData(charts[c.key])
              ? (c.type === 'line'
                  ? <LineChart data={charts[c.key]} />
                  : <BarChart data={charts[c.key]} />)
              : <EmptyState compact iconName="chart" title={t('admin.dash.chartEmptyTitle')} message={t('admin.dash.chartEmptyMsg')} />}
          </section>
        ))}
      </div>

      {/* 2) 구단별 통계 */}
      <section className="adm-panel adm-dash-section">
        <div className="adm-panel-head"><h2 className="adm-panel-title">{t('admin.dash.teamStatus')}</h2></div>
        <div className="adm-table-wrap flat">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('admin.dash.thTeam')}</th>
                <th>{t('admin.dash.thMembers')}</th>
                <th>{t('admin.dash.thOpinions')}</th>
                <th>{t('admin.dash.thComments')}</th>
                <th>{t('admin.dash.thResponses')}</th>
                <th>{t('admin.dash.thAiRuns')}</th>
              </tr>
            </thead>
            <tbody>
              {teams.map(tm => (
                <tr key={tm.id}>
                  <td>
                    <span className="adm-team-cell">
                      <span className="adm-team-dot" style={{ background: tm.color }} />
                      <span className="adm-cell-strong">{tm.name}</span>
                    </span>
                  </td>
                  <td>{tm.members.toLocaleString()}</td>
                  <td>{tm.opinions.toLocaleString()}</td>
                  <td>{tm.comments.toLocaleString()}</td>
                  <td>{tm.responses.toLocaleString()}</td>
                  <td>{tm.aiRuns.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3) 최근 활동 — 통합 피드(시간순) */}
      <section className="adm-panel adm-dash-section">
        <div className="adm-panel-head"><h2 className="adm-panel-title">{t('admin.dash.recentActivity')}</h2></div>
        {recent.length === 0 ? (
          <EmptyState compact iconName="clipboard" title={t('admin.dash.recentEmptyTitle')} message={t('admin.dash.recentEmptyMsg')} />
        ) : (
          <ul className="adm-recent">
            {recent.map((a, i) => {
              const meta = ACTIVITY[a.type] || ACTIVITY.signup
              const sub = activityMeta(a)
              return (
                <li key={i} className="adm-recent-item">
                  <span className="adm-recent-ic" aria-hidden="true"><Icon name={meta.icon} size={16} /></span>
                  <div className="adm-recent-body">
                    <span className="adm-recent-title">
                      <span className="adm-act-tag">{t(meta.labelKey)}</span> {trim(a.title)}
                    </span>
                    {sub && <span className="adm-recent-meta">{sub}</span>}
                  </div>
                  <span className="adm-recent-date">{String(a.at || '').slice(0, 10)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
