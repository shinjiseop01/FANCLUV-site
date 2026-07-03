import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext.jsx'
import { getCurrentUser } from '../lib/auth.js'
import {
  getDashboardStats, getTeamBreakdown,
  getRecentMembers, getRecentOpinions, getRecentComments, getRecentReports,
  getDailySignups, getDailyOpinions, getTeamOpinionShare, getSentimentDistribution,
} from './adminData.js'
import { LineChart, BarChart, DonutChart, StackedBar } from './AdminCharts.jsx'
import { TEAMS } from '../teams.jsx'
import { runAnalysis } from '../lib/ai/analyzeFanInsights.js'
import { createNotice } from '../lib/notificationsRepo.js'

// KPI 카드 정의 (값 key + 라벨 + 아이콘 + 표시형식)
const KPI_CARDS = [
  { key: 'totalMembers',        labelKey: 'admin.dash.totalMembers',   icon: '👥' },
  { key: 'activeMembers',       labelKey: 'admin.dash.activeMembers',  icon: '✅' },
  { key: 'totalOpinions',       labelKey: 'admin.dash.totalOpinions',  icon: '💬' },
  { key: 'opinionsToday',       labelKey: 'admin.dash.opinionsToday',  icon: '✍️' },
  { key: 'activeSurveys',       labelKey: 'admin.dash.activeSurveys',  icon: '📊' },
  { key: 'surveyParticipation', labelKey: 'admin.dash.participation',  icon: '🗳️', suffix: '%' },
  { key: 'totalComments',       labelKey: 'admin.dash.comments',       icon: '🗨️' },
  { key: 'totalLikes',          labelKey: 'admin.dash.likes',          icon: '❤️' },
]

const REPORT_STATUS = { pending: 'admin.rp.pending', resolved: 'admin.rp.resolved' }

function trim(text, n = 34) {
  return text.length > n ? text.slice(0, n) + '…' : text
}

export default function AdminDashboard() {
  const { t } = useLang()
  const navigate = useNavigate()
  const admin = getCurrentUser()

  // KPI 는 Supabase 집계(async) 또는 Mock. 로드 전에는 0 으로 표시.
  const [stats, setStats] = useState({})
  useEffect(() => {
    let active = true
    getDashboardStats().then(s => { if (active) setStats(s) })
    return () => { active = false }
  }, [])

  const teams = getTeamBreakdown()
  const recentMembers = getRecentMembers()
  const recentOpinions = getRecentOpinions()
  const recentComments = getRecentComments()
  const recentReports = getRecentReports()
  const sentiment = getSentimentDistribution()

  const teamName = id => teams.find(tm => tm.id === id)?.name || id
  const teamOf = id => teams.find(tm => tm.id === id)

  // AI 팬 인사이트 분석 실행
  const [aiClub, setAiClub] = useState('all')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMsg, setAiMsg] = useState('')
  async function runAi() {
    setAiBusy(true); setAiMsg('')
    const res = await runAnalysis(aiClub)
    setAiBusy(false)
    if (res.ok) { setAiMsg(t('admin.ai.done')); return }
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
          <span className="adm-mock-chip" title={t('admin.dash.mockHint')}>{t('admin.dash.mockNote')}</span>
        </div>
      </header>

      {/* 1) KPI 카드 */}
      <div className="adm-stat-grid">
        {KPI_CARDS.map(c => (
          <div key={c.key} className="adm-stat">
            <span className="adm-stat-icon" aria-hidden="true">{c.icon}</span>
            <span className="adm-stat-value">
              {Number(stats[c.key] || 0).toLocaleString()}{c.suffix || ''}
            </span>
            <span className="adm-stat-label">{t(c.labelKey)}</span>
          </div>
        ))}
      </div>

      {/* 5) 관리자 빠른 작업 */}
      <section className="adm-dash-section">
        <div className="adm-quick-grid">
          <button className="adm-quick-btn" onClick={() => navigate('/admin/surveys')}>📊 {t('admin.dash.qCreateSurvey')}</button>
          <button className="adm-quick-btn" onClick={() => navigate('/admin/news')}>📰 {t('admin.dash.qCreateNews')}</button>
          <button className="adm-quick-btn" onClick={() => navigate('/admin/members')}>👥 {t('admin.dash.qMembers')}</button>
          <button className="adm-quick-btn" onClick={() => navigate('/admin/reports')}>🚩 {t('admin.dash.qReports')}</button>
        </div>
      </section>

      {/* AI 팬 인사이트 분석 실행 */}
      <section className="adm-panel adm-dash-section">
        <div className="adm-panel-head"><h2 className="adm-panel-title">✦ {t('admin.ai.title')}</h2></div>
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
        <div className="adm-panel-head"><h2 className="adm-panel-title">📢 {t('admin.notice.title')}</h2></div>
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

      {/* 4) 차트 */}
      <div className="adm-grid-2">
        <section className="adm-panel">
          <div className="adm-panel-head"><h2 className="adm-panel-title">{t('admin.dash.chartSignups')}</h2></div>
          <LineChart data={getDailySignups()} />
        </section>
        <section className="adm-panel">
          <div className="adm-panel-head"><h2 className="adm-panel-title">{t('admin.dash.chartOpinions')}</h2></div>
          <BarChart data={getDailyOpinions()} />
        </section>
        <section className="adm-panel">
          <div className="adm-panel-head"><h2 className="adm-panel-title">{t('admin.dash.chartTeamShare')}</h2></div>
          <DonutChart data={getTeamOpinionShare()} />
        </section>
        <section className="adm-panel">
          <div className="adm-panel-head"><h2 className="adm-panel-title">{t('admin.dash.chartSentiment')}</h2></div>
          <StackedBar data={sentiment} labelFor={k => t(`admin.dash.sentiment.${k}`)} />
        </section>
      </div>

      {/* 2) 구단별 현황 */}
      <section className="adm-panel adm-dash-section">
        <div className="adm-panel-head"><h2 className="adm-panel-title">{t('admin.dash.teamStatus')}</h2></div>
        <div className="adm-table-wrap flat">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('admin.dash.thTeam')}</th>
                <th>{t('admin.dash.thMembers')}</th>
                <th>{t('admin.dash.thOpinions')}</th>
                <th>{t('admin.dash.thSatisfaction')}</th>
                <th>{t('admin.dash.thParticipation')}</th>
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
                  <td>
                    <span className="adm-minibar"><span style={{ width: `${tm.satisfaction}%`, background: tm.colorDeep }} /></span>
                    <span className="adm-minibar-val">{tm.satisfaction}%</span>
                  </td>
                  <td>
                    <span className="adm-minibar"><span style={{ width: `${tm.participation}%` }} /></span>
                    <span className="adm-minibar-val">{tm.participation}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3) 최근 활동 */}
      <div className="adm-grid-2">
        {/* 최근 가입 회원 */}
        <section className="adm-panel">
          <div className="adm-panel-head">
            <h2 className="adm-panel-title">{t('admin.dash.recentMembers')}</h2>
            <button className="adm-panel-link" onClick={() => navigate('/admin/members')}>{t('admin.dash.viewAll')}</button>
          </div>
          <ul className="adm-recent">
            {recentMembers.map(m => (
              <li key={m.id} className="adm-recent-item">
                <span className="adm-recent-avatar">{m.nickname[0]}</span>
                <div className="adm-recent-body">
                  <span className="adm-recent-title">{m.nickname}</span>
                  <span className="adm-recent-meta">{teamName(m.team)}</span>
                </div>
                <span className="adm-recent-date">{m.joinedAt}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 최근 작성 의견 */}
        <section className="adm-panel">
          <div className="adm-panel-head">
            <h2 className="adm-panel-title">{t('admin.dash.recentOpinions')}</h2>
            <button className="adm-panel-link" onClick={() => navigate('/admin/opinions')}>{t('admin.dash.viewAll')}</button>
          </div>
          <ul className="adm-recent">
            {recentOpinions.map(o => (
              <li key={o.id} className="adm-recent-item">
                <span className="adm-team-dot" style={{ background: teamOf(o.team)?.color }} />
                <div className="adm-recent-body">
                  <span className="adm-recent-title">{trim(o.content)}</span>
                  <span className="adm-recent-meta">{o.author} · {teamName(o.team)}</span>
                </div>
                <span className="adm-recent-date">{o.date}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 최근 댓글 */}
        <section className="adm-panel">
          <div className="adm-panel-head">
            <h2 className="adm-panel-title">{t('admin.dash.recentComments')}</h2>
            <button className="adm-panel-link" onClick={() => navigate('/admin/opinions')}>{t('admin.dash.viewAll')}</button>
          </div>
          <ul className="adm-recent">
            {recentComments.map(c => (
              <li key={c.id} className={`adm-recent-item${c.status === 'hidden' ? ' muted' : ''}`}>
                <span className="adm-recent-avatar">{c.author[0]}</span>
                <div className="adm-recent-body">
                  <span className="adm-recent-title">{trim(c.content)}</span>
                  <span className="adm-recent-meta">{c.author}</span>
                </div>
                <span className="adm-recent-date">{c.date}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 최근 신고 */}
        <section className="adm-panel">
          <div className="adm-panel-head">
            <h2 className="adm-panel-title">{t('admin.dash.recentReports')}</h2>
            <button className="adm-panel-link" onClick={() => navigate('/admin/reports')}>{t('admin.dash.viewAll')}</button>
          </div>
          <ul className="adm-recent">
            {recentReports.map(r => (
              <li key={r.id} className="adm-recent-item">
                <span className="adm-badge reason">{t(`report.reason.${r.reason}`)}</span>
                <div className="adm-recent-body">
                  <span className="adm-recent-title">{trim(r.target)}</span>
                  <span className="adm-recent-meta">{r.reporter}</span>
                </div>
                <span className={`adm-badge ${r.status === 'pending' ? 'pending' : 'active'}`}>{t(REPORT_STATUS[r.status])}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
