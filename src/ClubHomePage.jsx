import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getTeam, TeamEmblem } from './teams.jsx'
import './ClubHomePage.css'

const NICKNAME = '민준'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

const POPULAR_OPINIONS = [
  { author: '블루윙', time: '2시간 전', category: '팬서비스', likes: 142, comments: 28,
    text: '원정 경기 셔틀버스 운행 시간을 조금만 더 늘려주면 좋겠어요. 경기 종료 후 이동이 늘 아쉽습니다.' },
  { author: '레전드7', time: '5시간 전', category: '경기운영', likes: 119, comments: 17,
    text: '유소년 출신 선수들에게 출전 기회가 더 많아졌으면 합니다. 미래를 위한 투자가 필요해요.' },
  { author: '직관러', time: '어제', category: '시설', likes: 96, comments: 11,
    text: '경기장 먹거리 종류가 다양해져서 만족스럽습니다. 다음엔 비건 메뉴도 있으면 좋겠네요.' },
  { author: '시즌권홀더', time: '2일 전', category: '티켓/예매', likes: 73, comments: 9,
    text: '티켓 예매 페이지가 경기 직전에 가끔 느려집니다. 서버 안정성 개선 부탁드려요.' },
]

const ONGOING_SURVEYS = [
  { title: '2026 홈 유니폼 디자인 선호도', deadline: 'D-3', count: 1284 },
  { title: '응원가 리뉴얼 의견 수렴', deadline: 'D-7', count: 842 },
  { title: '경기 시작 시간 선호 조사', deadline: 'D-12', count: 1567 },
]

const CATEGORIES = [
  { name: '경기운영', count: 320 },
  { name: '팬서비스', count: 254 },
  { name: '시설', count: 188 },
  { name: '티켓/예매', count: 142 },
  { name: '선수단', count: 121 },
  { name: '마케팅', count: 87 },
]

const TOPICS = [
  { tag: '홈경기장', mentions: 412 },
  { tag: '원정응원', mentions: 287 },
  { tag: '시즌권', mentions: 231 },
  { tag: '유소년', mentions: 176 },
  { tag: '굿즈', mentions: 134 },
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
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const [lang, setLang] = useState('ko')

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
            <button className="ch-logout" onClick={() => navigate('/')}>로그아웃</button>
          </div>
        </div>

        <nav className="ch-nav" aria-label="메인 메뉴">
          {MENU.map((item, i) => (
            <a key={item} href="#" className={`ch-nav-item${i === 0 ? ' on' : ''}`}
              aria-current={i === 0 ? 'page' : undefined}
              onClick={e => {
                e.preventDefault()
                if (item === '팬 의견') navigate(`/club/${team.id}/opinions`)
                else if (item === '내 활동') navigate(`/club/${team.id}/activity`)
                else if (item === '경기센터') navigate(`/club/${team.id}/matches`)
              }}>
              {item}
            </a>
          ))}
        </nav>
      </header>

      {/* ── Main ── */}
      <main className="ch-main">

        <section className="ch-welcome">
          <h1>안녕하세요, {NICKNAME}님!</h1>
          <p>{team.name}의 최신 소식과 팬 활동을 확인해보세요.</p>
        </section>

        {/* Stat cards */}
        <section className="ch-stats">
          <StatCard label="활동 중인 팬" value={stats.fans.toLocaleString()} icon="users" />
          <StatCard label="총 의견 수" value={stats.opinions.toLocaleString()} icon="message" />
          <StatCard label="총 댓글 수" value={stats.comments.toLocaleString()} icon="comment" />
          <StatCard label="팬 만족도" value={`${stats.satisfaction}%`} icon="heart" />
        </section>

        {/* Content grid */}
        <div className="ch-grid">

          {/* Left 2/3 */}
          <div className="ch-col-main">

            <Panel title="최신 설문" action="전체 보기">
              <div className="ch-survey-feature">
                <span className="ch-tag">진행 중 · D-5</span>
                <h3>2026 시즌 홈 경기장 시설 만족도 조사</h3>
                <p>올 시즌 홈 경기 관람 환경에 대한 솔직한 의견을 들려주세요. 결과는 구단에 전달됩니다.</p>
                <div className="ch-survey-meta">
                  <div className="ch-progress"><span style={{ width: '64%' }} /></div>
                  <span className="ch-survey-count">1,842명 참여</span>
                </div>
                <button className="ch-btn-primary" onClick={() => navigate(`/club/${team.id}/survey`)}>설문 참여하기</button>
              </div>
            </Panel>

            <Panel title="인기 의견" action="더 보기">
              <ul className="ch-opinions">
                {POPULAR_OPINIONS.map((o, i) => (
                  <li key={i} className="ch-opinion">
                    <div className="ch-opinion-head">
                      <span className="ch-avatar" aria-hidden="true">{o.author[0]}</span>
                      <span className="ch-opinion-author">{o.author}</span>
                      <span className="ch-opinion-time">{o.time}</span>
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

            <Panel title="진행 중인 설문">
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

            <Panel title="인기 카테고리">
              <div className="ch-cats">
                {CATEGORIES.map(c => (
                  <span key={c.name} className="ch-cat-chip">
                    <span className="ch-dot" /> {c.name}
                    <em>{c.count}</em>
                  </span>
                ))}
              </div>
            </Panel>

            <Panel title="최근 많이 언급되는 주제">
              <ul className="ch-topics">
                {TOPICS.map((t, i) => (
                  <li key={t.tag}>
                    <span className="ch-topic-rank">{i + 1}</span>
                    <span className="ch-topic-tag">#{t.tag}</span>
                    <span className="ch-topic-count">{t.mentions.toLocaleString()}회 언급</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </aside>
        </div>
      </main>

      {/* Floating write button */}
      <button className="ch-fab" aria-label="의견 작성" onClick={() => navigate(`/club/${team.id}/write`)}>
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
        <span>의견 작성</span>
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

function Panel({ title, action, children }) {
  return (
    <section className="ch-panel">
      <div className="ch-panel-head">
        <h2>{title}</h2>
        {action && <a href="#" className="ch-panel-action" onClick={e => e.preventDefault()}>{action}</a>}
      </div>
      {children}
    </section>
  )
}
