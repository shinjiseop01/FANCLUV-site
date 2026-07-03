import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import { logout, getCurrentUser } from './lib/auth.js'
import { getTeam, TeamEmblem, menuPath } from './teams.jsx'
import { SkeletonList } from './components/Skeleton.jsx'
import { relativeTime } from './lib/relativeTime.js'
import { getHomeContent } from './lib/homeRepo.js'
import './ClubHomePage.css'


const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

const ONGOING_SURVEYS = [
  { title: '2026 홈 유니폼 디자인 선호도', deadline: 'D-3', count: 1284 },
  { title: '응원가 리뉴얼 의견 수렴', deadline: 'D-7', count: 842 },
  { title: '경기 시작 시간 선호 조사', deadline: 'D-12', count: 1567 },
]

// deterministic per-club stats so each page differs but stays stable
function clubStats(id) {
  const seed = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return {
    fans: 2800 + (seed % 47) * 137,
    opinions: 1100 + (seed % 38) * 73,
    comments: 7400 + (seed % 53) * 191,
    satisfaction: 72 + (seed % 21),
  }
}

export default function ClubHomePage() {
  const NICKNAME = getCurrentUser()?.nickname || '팬'
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { lang, t } = useLang()

  // 홈 인기 콘텐츠(인기 의견/카테고리/키워드)를 Supabase 로 계산, 아니면 Mock — homeRepo.
  const [home, setHome] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    if (!team) return
    let active = true
    setLoading(true)
    getHomeContent(team.id).then(c => {
      if (!active) return
      setHome(c)
      setLoading(false)
    })
    return () => { active = false }
  }, [team])

  useEffect(() => load(), [load])

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>존재하지 않는 구단입니다.</p>
        <button onClick={() => navigate('/team-select')}>구단 다시 선택하기</button>
      </div>
    )
  }

  const stats = clubStats(team.id)
  const themeStyle = { '--team': team.color, '--team-deep': team.colorDeep }

  return (
    <div className="ch-root" style={themeStyle}>

      {/* ── Header ── */}
      <header className="ch-header">
        <div className="ch-topbar">
          <div className="ch-logo" role="button" tabIndex={0} onClick={() => navigate(`/club/${teamId}`)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/club/${teamId}`) } }}>FANCLUV</div>

          <div className="ch-club">
            <TeamEmblem color={team.color} size={30} className="ch-club-emblem" />
            <span className="ch-club-name">{team.name}</span>
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
          {MENU.map((item, i) => (
            <a key={item} href="#" className={`ch-nav-item${i === 0 ? ' on' : ''}`}
              aria-current={i === 0 ? 'page' : undefined}
              onClick={e => { e.preventDefault(); navigate(menuPath(item, team.id)) }}>{t(NAV_KEYS[item])}</a>
          ))}
        </nav>
      </header>

      {/* ── Main ── */}
      <main className="ch-main">
        {loading ? <div className="ch-skel"><SkeletonList count={4} lines={3} /></div> : <>

        <section className="ch-welcome">
          <h1>{t('home.welcome', { name: NICKNAME })}</h1>
          <p>{t('home.welcomeSub', { team: team.name })}</p>
        </section>

        {/* Stat cards */}
        <section className="ch-stats">
          <StatCard label={t('home.statFans')} value={stats.fans.toLocaleString()} icon="users" />
          <StatCard label={t('home.statOpinions')} value={stats.opinions.toLocaleString()} icon="message" />
          <StatCard label={t('home.statComments')} value={stats.comments.toLocaleString()} icon="comment" />
          <StatCard label={t('home.statSatisfaction')} value={`${stats.satisfaction}%`} icon="heart" />
        </section>

        {/* Content grid */}
        <div className="ch-grid">

          {/* Left 2/3 */}
          <div className="ch-col-main">

            <Panel title={t('home.latestSurvey')} action={t('home.viewAll')}
              onAction={() => navigate(`/club/${team.id}/survey`)}>
              <div className="ch-survey-feature">
                <span className="ch-tag">진행 중 · D-5</span>
                <h3>2026 시즌 홈 경기장 시설 만족도 조사</h3>
                <p>올 시즌 홈 경기 관람 환경에 대한 솔직한 의견을 들려주세요. 결과는 구단에 전달됩니다.</p>
                <div className="ch-survey-meta">
                  <div className="ch-progress"><span style={{ width: '64%' }} /></div>
                  <span className="ch-survey-count">1,842명 참여</span>
                </div>
                <button className="ch-btn-primary" onClick={() => navigate(`/club/${team.id}/survey`)}>{t('home.joinSurvey')}</button>
              </div>
            </Panel>

            <Panel title={t('home.popularOpinions')} action={t('home.viewMore')}
              onAction={() => navigate(`/club/${team.id}/opinions`)}>
              <ul className="ch-opinions">
                {(home?.popularOpinions || []).map(o => (
                  <li
                    key={o.id}
                    className="ch-opinion is-link"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/club/${team.id}/opinions/${o.id}`)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/club/${team.id}/opinions/${o.id}`) } }}
                  >
                    <div className="ch-opinion-head">
                      <span className="ch-avatar" aria-hidden="true">{o.author[0]}</span>
                      <span className="ch-opinion-author">{o.author}</span>
                      <span className="ch-opinion-time">{relativeTime(o.hours, lang)}</span>
                      <span className="ch-cat-pill">{o.category}</span>
                    </div>
                    <p className="ch-opinion-text">{o.text}</p>
                    <div className="ch-opinion-foot">
                      <span>♥ {o.likes}</span>
                      <span>💬 {o.comments}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          {/* Right 1/3 */}
          <aside className="ch-col-side">

            <Panel title={t('home.ongoingSurvey')}>
              <ul className="ch-side-list">
                {ONGOING_SURVEYS.map((s, i) => (
                  <li key={i} className="ch-side-survey">
                    <div>
                      <p className="ch-side-survey-title">{s.title}</p>
                      <p className="ch-side-survey-count">{s.count.toLocaleString()}명 참여</p>
                    </div>
                    <span className="ch-deadline">{s.deadline}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title={t('home.popularCategories')}>
              <div className="ch-cats">
                {(home?.popularCategories || []).map(c => (
                  <button
                    key={c.name}
                    type="button"
                    className="ch-cat-chip"
                    onClick={() => navigate(`/club/${team.id}/opinions?category=${encodeURIComponent(c.name)}`)}
                  >
                    <span className="ch-dot" /> {c.name}
                    <em>{c.count}</em>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title={t('home.trendingTopics')}>
              <ul className="ch-topics">
                {(home?.trendingKeywords || []).map((topic, i) => (
                  <li key={topic.tag}>
                    <button
                      type="button"
                      className="ch-topic-link"
                      onClick={() => navigate(`/club/${team.id}/opinions?keyword=${encodeURIComponent(topic.tag)}`)}
                    >
                      <span className="ch-topic-rank">{i + 1}</span>
                      <span className="ch-topic-tag">#{topic.tag}</span>
                      <span className="ch-topic-count">{topic.mentions.toLocaleString()}회 언급</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          </aside>
        </div>
        </>}
      </main>

      {/* Floating write button */}
      <button className="ch-fab" aria-label={t('home.writeOpinion')} onClick={() => navigate(`/club/${team.id}/write`)}>
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
        <span>{t('home.writeOpinion')}</span>
      </button>
    </div>
  )
}

function StatCard({ label, value, icon }) {
  const icons = {
    users: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>,
    message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>,
    comment: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>,
  }
  return (
    <div className="ch-stat">
      <span className="ch-stat-icon"><svg viewBox="0 0 24 24" fill="none">{icons[icon]}</svg></span>
      <div className="ch-stat-text">
        <span className="ch-stat-value">{value}</span>
        <span className="ch-stat-label">{label}</span>
      </div>
    </div>
  )
}

function Panel({ title, action, onAction, children }) {
  return (
    <section className="ch-panel">
      <div className="ch-panel-head">
        <h2>{title}</h2>
        {action && (
          <a href="#" className="ch-panel-action"
            onClick={e => { e.preventDefault(); if (onAction) onAction() }}>{action}</a>
        )}
      </div>
      {children}
    </section>
  )
}
