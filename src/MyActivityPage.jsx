import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import { logout, getCurrentUser } from './lib/auth.js'
import { getTeam, teamName, TeamEmblem, menuPath } from './teams.jsx'
import { getMyActivity } from './lib/myActivityRepo.js'
import Avatar from './components/Avatar.jsx'
import EmptyState from './components/EmptyState.jsx'
import { SkeletonList } from './components/Skeleton.jsx'
import RankIcon from './components/RankIcon.jsx'
import Icon from './components/Icon.jsx'
import AnimatedNumber from './components/AnimatedNumber.jsx'
import { relativeTime } from './lib/relativeTime.js'
import { getActivityBadge } from './lib/activityBadge.js'
import { subscribeChanges } from './lib/realtime.js'
import './ClubHomePage.css'
import './MyActivityPage.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

// 활동 이벤트 유형별 색상 + 라벨(모든 유형: 작성/수정/삭제/댓글/공감/취소/설문/신고)
const EV_META = {
  opinion_create: { color: '#2563EB', labelKey: 'act.ev.opinionCreate' },
  opinion_update: { color: '#2563EB', labelKey: 'act.ev.opinionUpdate' },
  opinion_delete: { color: '#64748B', labelKey: 'act.ev.opinionDelete' },
  comment_create: { color: '#7C3AED', labelKey: 'act.ev.commentCreate' },
  comment_update: { color: '#7C3AED', labelKey: 'act.ev.commentUpdate' },
  comment_delete: { color: '#64748B', labelKey: 'act.ev.commentDelete' },
  like_add: { color: '#E05252', labelKey: 'act.ev.likeAdd' },
  like_remove: { color: '#64748B', labelKey: 'act.ev.likeRemove' },
  survey_join: { color: '#0E9F6E', labelKey: 'act.ev.surveyJoin' },
  report_submit: { color: '#D97706', labelKey: 'act.ev.reportSubmit' },
}
const hoursSince = iso => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000))
const fmtJoined = iso => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function MyActivityPage() {
  const NICKNAME = getCurrentUser()?.nickname || '팬'
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { lang, t } = useLang()

  const [data, setData] = useState({ opinions: [], surveys: [], timeline: [], stats: { opinions: 0, comments: 0, surveys: 0, empathy: 0 } })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!team) { setLoading(false); return }
    let active = true
    setLoading(true)
    const load = () => getMyActivity(team.id).then(d => { if (active) setData(d) })
    load().finally(() => { if (active) setLoading(false) })
    // Realtime: 내 활동에 영향 주는 테이블 변경 시 새로고침 없이 즉시 갱신.
    const unsub = subscribeChanges(['activity_events', 'opinions', 'comments', 'likes', 'survey_responses'], load)
    return () => { active = false; unsub() }
  }, [teamId, team])

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>존재하지 않는 구단입니다.</p>
        <button onClick={() => navigate('/team-select')}>구단 다시 선택하기</button>
      </div>
    )
  }

  const { opinions, surveys, timeline, stats } = data
  // 활동점수 = 실 DB 통계 기반(의견10·댓글3·설문5·받은공감1) — 로컬 로그 미사용.
  const score = stats.opinions * 10 + stats.comments * 3 + stats.surveys * 5 + stats.empathy
  const { badge, next, progress } = getActivityBadge(score)
  const badgeName = b => (lang === 'en' ? b.en : b.ko)
  const joined = fmtJoined(getCurrentUser()?.joinedAt)

  const themeStyle = { '--team': team.color, '--team-deep': team.colorDeep }

  return (
    <div className="ch-root" style={themeStyle}>

      {/* ── Header (shared style) ── */}
      <header className="ch-header">
        <div className="ch-topbar">
          <div className="ch-logo" role="button" tabIndex={0} onClick={() => navigate(`/club/${teamId}`)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/club/${teamId}`) } }}>FANCLUV</div>
          <div className="ch-club">
            <TeamEmblem color={team.color} size={30} className="ch-club-emblem" />
            <span className="ch-club-name">{teamName(team, lang)}</span>
          </div>
          <div className="ch-actions">
            <span className="ch-user">{NICKNAME}{t('common.honorific')}</span>
            <NotificationBell />
            <button className="ch-icon-btn" title={t('common.settings')} aria-label={t('common.settings')} onClick={() => navigate(`/club/${team.id}/settings`)}>
              <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.4"/></svg>
            </button>
            <button className="ch-logout" onClick={() => { logout(); navigate('/') }}>{t('common.logout')}</button>
          </div>
        </div>
        <nav className="ch-nav" aria-label="메인 메뉴">
          {MENU.map(item => {
            const active = item === '내 활동'
            return (
              <a key={item} href="#" className={`ch-nav-item${active ? ' on' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={e => { e.preventDefault(); navigate(menuPath(item, team.id)) }}>{t(NAV_KEYS[item])}</a>
            )
          })}
        </nav>
      </header>

      {/* ── Main ── */}
      <main className="ma-main">
        <section className="ma-pagehead">
          <h1>{t('act.title')}</h1>
          <p>{t('act.subtitle')}</p>
        </section>

        {loading ? (
          <SkeletonList count={4} lines={3} />
        ) : (
        <div className="ma-grid">
          {/* Left 70% */}
          <div className="ma-col-main">

            {/* Profile card */}
            <div className="ma-profile">
              <Avatar name={NICKNAME} src={getCurrentUser()?.avatarUrl} size={68} />
              <div className="ma-profile-info">
                <h2 className="ma-nickname">{NICKNAME}</h2>
                <div className="ma-profile-team">
                  <TeamEmblem color={team.color} size={22} className="ma-team-emblem" />
                  <span>{teamName(team, lang)}</span>
                </div>
                {joined && <p className="ma-joined">{t('act.joined')} · {joined}</p>}
              </div>
            </div>

            {/* Stats */}
            <div className="ma-stats">
              <StatCard label={t('act.statOpinions')} value={stats.opinions} icon="message" />
              <StatCard label={t('act.statComments')} value={stats.comments} icon="comment" />
              <StatCard label={t('act.statSurveys')} value={stats.surveys} icon="poll" />
              <StatCard label={t('act.statEmpathy')} value={stats.empathy} icon="heart" />
            </div>

            {/* My opinions */}
            <section className="ma-panel">
              <h2 className="ma-panel-title">{t('act.myOpinions')}</h2>
              {opinions.length === 0 ? (
                <EmptyState
                  compact
                  iconName="edit"
                  title={t('empty.activityTitle')}
                  message={t('empty.activityMsg')}
                  ctaLabel={t('empty.activityCta')}
                  onCta={() => navigate(`/club/${team.id}/write`)}
                />
              ) : (
              <ul className="ma-op-list">
                {opinions.map(o => (
                  <li key={o.id}>
                    <button className="ma-op" onClick={() => navigate(`/club/${team.id}/opinions/${o.id}`)}>
                      <div className="ma-op-top">
                        <span className="ma-cat-pill">{o.category}</span>
                        <span className="ma-op-date">{o.date}</span>
                      </div>
                      <span className="ma-op-title">{o.title}</span>
                      <div className="ma-op-foot">
                        <span className="ic-txt"><Icon name="heart" size={13} /> {t('op.agree')} {o.likes}</span>
                        <span className="ic-txt"><Icon name="comment" size={13} /> {t('op.comment')} {o.comments}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              )}
            </section>

            {/* Participated surveys */}
            <section className="ma-panel">
              <h2 className="ma-panel-title">{t('act.mySurveys')}</h2>
              {surveys.length === 0 ? (
                <EmptyState compact iconName="poll" title={t('act.emptySurveys')} message="" />
              ) : (
              <ul className="ma-survey-list">
                {surveys.map((s, i) => (
                  <li key={s.id || i} className="ma-survey">
                    <div className="ma-survey-info">
                      <p className="ma-survey-title">{s.title}</p>
                      {s.date && <p className="ma-survey-date">{t('act.joined')} · {s.date}</p>}
                    </div>
                    <span className="ma-done-badge">
                      <svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      {t('act.surveyDone')}
                    </span>
                  </li>
                ))}
              </ul>
              )}
            </section>
          </div>

          {/* Right 30% */}
          <aside className="ma-col-side">

            {/* Activity level */}
            <section className="ma-panel ma-level">
              <h2 className="ma-panel-title">{t('act.level')}</h2>
              <div className="ma-level-badge">
                <span className="ma-level-emoji" aria-hidden="true"><RankIcon name={badge.icon} size={22} /></span>
                <span className="ma-level-name">{badgeName(badge)}</span>
              </div>
              <div className="ma-level-bar"><span style={{ width: `${progress}%` }} /></div>
              <p className="ma-level-hint">
                {next
                  ? (lang === 'en'
                    ? <>{progress}% to <strong className="ic-txt"><RankIcon name={next.icon} size={14} /> {badgeName(next)}</strong></>
                    : <>다음 레벨 <strong className="ic-txt"><RankIcon name={next.icon} size={14} /> {badgeName(next)}</strong>까지 {progress}%</>)
                  : (lang === 'en' ? 'You\'ve reached the top level!' : '최고 레벨에 도달했습니다!')}
              </p>
            </section>

            {/* Recent activity */}
            <section className="ma-panel">
              <h2 className="ma-panel-title">{t('act.recent')}</h2>
              {timeline.length === 0 ? (
                <p className="ma-tl-empty">{t('act.emptyTimeline')}</p>
              ) : (
              <ul className="ma-timeline">
                {timeline.map((ev, i) => {
                  const meta = EV_META[ev.type] || EV_META.opinion_create
                  return (
                    <li key={i} className="ma-tl-item">
                      <span className="ma-tl-dot" style={{ background: meta.color }} />
                      <div className="ma-tl-body">
                        <span className="ma-tl-label" style={{ color: meta.color }}>{t(meta.labelKey)}</span>
                        {ev.title && <p className="ma-tl-text">&lsquo;{ev.title}&rsquo;</p>}
                        <span className="ma-tl-time">{relativeTime(hoursSince(ev.createdAt), lang)}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
              )}
            </section>

            {/* Team info */}
            <section className="ma-panel ma-team-card">
              <h2 className="ma-panel-title">{t('act.teamInfo')}</h2>
              <div className="ma-team-row">
                <TeamEmblem color={team.color} size={44} />
                <div>
                  <p className="ma-team-name">{teamName(team, lang)}</p>
                  <p className="ma-team-sub">K리그1 · 2026 시즌</p>
                </div>
              </div>
              <button className="ma-team-btn" onClick={() => navigate(`/club/${team.id}`)}>{t('act.goClub')}</button>
            </section>
          </aside>
        </div>
        )}
      </main>
    </div>
  )
}

function StatCard({ label, value, icon }) {
  const icons = {
    message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>,
    comment: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>,
    poll: <path d="M7 16V9M12 16V5M17 16v-4M4 20h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>,
    heart: <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>,
  }
  return (
    <div className="ma-stat">
      <span className="ma-stat-icon"><svg viewBox="0 0 24 24" fill="none">{icons[icon]}</svg></span>
      <span className="ma-stat-value"><AnimatedNumber value={value} /></span>
      <span className="ma-stat-label">{label}</span>
    </div>
  )
}
