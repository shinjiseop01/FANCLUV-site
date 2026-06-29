import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { logout } from './lib/auth.js'
import { getTeam, TeamEmblem, menuPath } from './teams.jsx'
import { getCreatedOpinions } from './opinionStore.js'
import './ClubHomePage.css'
import './MyActivityPage.css'

const NICKNAME = '민준'
const JOINED = '2025.03.14'
const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

// Mock opinions authored by the user (reuse base opinion ids so detail opens).
const MOCK_MY_OPINIONS = [
  { id: 1, category: '경기장', title: '홈 경기장 좌석 시야 개선이 필요합니다', date: '2026.06.20', likes: 96, comments: 12 },
  { id: 4, category: 'MD', title: '신규 유니폼 디자인 만족도가 높아요', date: '2026.06.11', likes: 134, comments: 9 },
  { id: 6, category: '구단 운영', title: '팬 소통 간담회를 정례화해 주세요', date: '2026.05.28', likes: 88, comments: 17 },
]

const MOCK_SURVEYS = [
  { title: '2026 시즌 홈 경기장 시설 만족도 조사', date: '2026.06.18' },
  { title: '유니폼 디자인 선호도 조사', date: '2026.05.30' },
  { title: '응원가 리뉴얼 의견 수렴', date: '2026.05.12' },
]

const MOCK_TIMELINE = [
  { type: '공감', text: "'티켓 예매 페이지 안정성 개선 요청'에 공감했습니다.", time: '2시간 전' },
  { type: '댓글', text: "'원정 응원 분위기가 정말 최고였습니다'에 댓글을 남겼습니다.", time: '어제' },
  { type: '설문', text: "'2026 시즌 홈 경기장 시설 만족도 조사'에 참여했습니다.", time: '3일 전' },
  { type: '의견', text: "'팬 소통 간담회를 정례화해 주세요'를 작성했습니다.", time: '6일 전' },
]

const TYPE_META = {
  의견: { label: '의견 작성', color: '#2563EB' },
  댓글: { label: '댓글 작성', color: '#7C3AED' },
  설문: { label: '설문 참여', color: '#0E9F6E' },
  공감: { label: '공감 누르기', color: '#E05252' },
}

const LEVELS = [
  { key: 'rookie', emoji: '🌱', name: 'Rookie Fan', min: 0 },
  { key: 'active', emoji: '⚽', name: 'Active Fan', min: 30 },
  { key: 'super', emoji: '🏆', name: 'Super Fan', min: 80 },
]

export default function MyActivityPage() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const [lang, setLang] = useState('ko')

  const myOpinions = useMemo(() => {
    if (!team) return []
    const created = getCreatedOpinions(team.id).map(o => ({
      id: o.id, category: o.category, title: o.title,
      date: '방금 전', likes: o.likes, comments: o.comments,
    }))
    return [...created, ...MOCK_MY_OPINIONS]
  }, [team])

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>존재하지 않는 구단입니다.</p>
        <button onClick={() => navigate('/team-select')}>구단 다시 선택하기</button>
      </div>
    )
  }

  const opinionCount = myOpinions.length
  const commentCount = 23
  const surveyCount = MOCK_SURVEYS.length
  const empathyCount = myOpinions.reduce((s, o) => s + (o.likes || 0), 0)

  // activity score → level
  const score = opinionCount * 6 + commentCount + surveyCount * 5
  let levelIdx = 0
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (score >= LEVELS[i].min) { levelIdx = i; break }
  }
  const level = LEVELS[levelIdx]
  const next = LEVELS[levelIdx + 1]
  const progress = next
    ? Math.min(100, Math.round(((score - level.min) / (next.min - level.min)) * 100))
    : 100

  const themeStyle = { '--team': team.color, '--team-deep': team.colorDeep }

  return (
    <div className="ch-root" style={themeStyle}>

      {/* ── Header (shared style) ── */}
      <header className="ch-header">
        <div className="ch-topbar">
          <div className="ch-logo" onClick={() => navigate('/team-select')}>FANCLUV</div>
          <div className="ch-club">
            <TeamEmblem color={team.color} size={30} className="ch-club-emblem" />
            <span className="ch-club-name">{team.name}</span>
          </div>
          <div className="ch-actions">
            <div className="ch-lang" role="group" aria-label="언어 선택">
              <button className={lang === 'ko' ? 'on' : ''} onClick={() => setLang('ko')}>한국어</button>
              <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
            </div>
            <span className="ch-user">{NICKNAME}님</span>
            <button className="ch-icon-btn" title="설정" aria-label="설정">
              <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.4"/></svg>
            </button>
            <button className="ch-logout" onClick={() => { logout(); navigate('/') }}>로그아웃</button>
          </div>
        </div>
        <nav className="ch-nav" aria-label="메인 메뉴">
          {MENU.map(item => {
            const active = item === '내 활동'
            return (
              <a key={item} href="#" className={`ch-nav-item${active ? ' on' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={e => { e.preventDefault(); navigate(menuPath(item, team.id)) }}>
                {item}
              </a>
            )
          })}
        </nav>
      </header>

      {/* ── Main ── */}
      <main className="ma-main">
        <section className="ma-pagehead">
          <h1>내 활동</h1>
          <p>나의 활동 내역과 참여 현황을 확인해 보세요.</p>
        </section>

        <div className="ma-grid">
          {/* Left 70% */}
          <div className="ma-col-main">

            {/* Profile card */}
            <div className="ma-profile">
              <span className="ma-avatar" aria-hidden="true">{NICKNAME[0]}</span>
              <div className="ma-profile-info">
                <h2 className="ma-nickname">{NICKNAME}</h2>
                <div className="ma-profile-team">
                  <TeamEmblem color={team.color} size={22} className="ma-team-emblem" />
                  <span>{team.name}</span>
                </div>
                <p className="ma-joined">가입일 · {JOINED}</p>
              </div>
            </div>

            {/* Stats */}
            <div className="ma-stats">
              <StatCard label="작성한 의견" value={opinionCount} icon="message" />
              <StatCard label="작성한 댓글" value={commentCount} icon="comment" />
              <StatCard label="참여한 설문" value={surveyCount} icon="poll" />
              <StatCard label="받은 공감" value={empathyCount.toLocaleString()} icon="heart" />
            </div>

            {/* My opinions */}
            <section className="ma-panel">
              <h2 className="ma-panel-title">내가 작성한 의견</h2>
              <ul className="ma-op-list">
                {myOpinions.map(o => (
                  <li key={o.id}>
                    <button className="ma-op" onClick={() => navigate(`/club/${team.id}/opinions/${o.id}`)}>
                      <div className="ma-op-top">
                        <span className="ma-cat-pill">{o.category}</span>
                        <span className="ma-op-date">{o.date}</span>
                      </div>
                      <span className="ma-op-title">{o.title}</span>
                      <div className="ma-op-foot">
                        <span>♥ 공감 {o.likes}</span>
                        <span>💬 댓글 {o.comments}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {/* Participated surveys */}
            <section className="ma-panel">
              <h2 className="ma-panel-title">참여한 설문</h2>
              <ul className="ma-survey-list">
                {MOCK_SURVEYS.map((s, i) => (
                  <li key={i} className="ma-survey">
                    <div className="ma-survey-info">
                      <p className="ma-survey-title">{s.title}</p>
                      <p className="ma-survey-date">참여일 · {s.date}</p>
                    </div>
                    <span className="ma-done-badge">
                      <svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      참여 완료
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Right 30% */}
          <aside className="ma-col-side">

            {/* Activity level */}
            <section className="ma-panel ma-level">
              <h2 className="ma-panel-title">FANCLUV 활동 레벨</h2>
              <div className="ma-level-badge">
                <span className="ma-level-emoji" aria-hidden="true">{level.emoji}</span>
                <span className="ma-level-name">{level.name}</span>
              </div>
              <div className="ma-level-bar"><span style={{ width: `${progress}%` }} /></div>
              <p className="ma-level-hint">
                {next ? <>다음 레벨 <strong>{next.emoji} {next.name}</strong>까지 {progress}%</> : '최고 레벨에 도달했습니다!'}
              </p>
            </section>

            {/* Recent activity */}
            <section className="ma-panel">
              <h2 className="ma-panel-title">최근 활동</h2>
              <ul className="ma-timeline">
                {MOCK_TIMELINE.map((t, i) => {
                  const meta = TYPE_META[t.type]
                  return (
                    <li key={i} className="ma-tl-item">
                      <span className="ma-tl-dot" style={{ background: meta.color }} />
                      <div className="ma-tl-body">
                        <span className="ma-tl-label" style={{ color: meta.color }}>{meta.label}</span>
                        <p className="ma-tl-text">{t.text}</p>
                        <span className="ma-tl-time">{t.time}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>

            {/* Team info */}
            <section className="ma-panel ma-team-card">
              <h2 className="ma-panel-title">응원팀 정보</h2>
              <div className="ma-team-row">
                <TeamEmblem color={team.color} size={44} />
                <div>
                  <p className="ma-team-name">{team.name}</p>
                  <p className="ma-team-sub">K리그1 · 2026 시즌</p>
                </div>
              </div>
              <button className="ma-team-btn" onClick={() => navigate(`/club/${team.id}`)}>구단 홈으로 이동</button>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}

function StatCard({ label, value, icon }) {
  const icons = {
    message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>,
    comment: <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>,
    poll: <path d="M7 16V9M12 16V5M17 16v-4M4 20h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>,
  }
  return (
    <div className="ma-stat">
      <span className="ma-stat-icon"><svg viewBox="0 0 24 24" fill="none">{icons[icon]}</svg></span>
      <span className="ma-stat-value">{value}</span>
      <span className="ma-stat-label">{label}</span>
    </div>
  )
}
