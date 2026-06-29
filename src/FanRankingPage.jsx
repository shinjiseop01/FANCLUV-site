import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getTeam, TEAMS, TeamEmblem } from './teams.jsx'
import './ClubHomePage.css'
import './FanRankingPage.css'

const NICKNAME = '민준'
const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

// ── Mock ranking data (deterministic) ──
const NAMES = [
  '블루윙', '레전드7', '직관러', '서포터K', '풋볼러버', '응원단장', '굿즈수집가', '시즌권홀더',
  '평일직관', '홈경기지킴이', '원정메이트', '풋볼맘', '필드의신', '12번째선수', '북패치', '응원가장인',
  '티켓요정', '골넣자', '주말축구', '클린시트', '미드필더', '라스트맨', '풋살왕', '관중석불꽃',
  '응원봉', '한일전', '스카프부대', '코너킥', '오프사이드', '해트트릭', '캡틴리더', '벤치워머',
  '풋볼다이어리', '경기장로컬', '시즌초심', '득점왕팬', '왼발잡이', '풀타임직관', '응원리더', '데이터팬',
  '하프타임', '추가시간', '득점기계', '리그광', '구단사랑', '인저리타임', '백넘버', '잔디남',
  '응원폼', '풋볼브레인',
]

function teamByIndex(i) {
  return TEAMS[i % TEAMS.length]
}

const RANKING = NAMES.map((name, i) => ({
  rank: i + 1,
  name,
  team: teamByIndex(i * 3 + 1),
  score: 1820 - i * 27 - (i % 4) * 9,
}))

const MY_RANK = { rank: 38, score: 245, toNext: 15, nextThreshold: 30 }

const WEEK_STATS = [
  { key: 'opinions', icon: '📝', label: '가장 많은 의견 작성', name: '블루윙', value: '32건' },
  { key: 'comments', icon: '💬', label: '가장 많은 댓글', name: '레전드7', value: '128개' },
  { key: 'surveys', icon: '📊', label: '가장 많은 설문 참여', name: '서포터K', value: '19회' },
  { key: 'empathy', icon: '❤️', label: '가장 많은 공감', name: '직관러', value: '540개' },
]

const SCORE_RULES = [
  { label: '의견 작성', points: '+10점' },
  { label: '댓글 작성', points: '+3점' },
  { label: '설문 참여', points: '+5점' },
  { label: '공감 받기', points: '+2점' },
]

const LEVELS = [
  { emoji: '🌱', name: 'Rookie Fan', min: 0 },
  { emoji: '⚽', name: 'Active Fan', min: 200 },
  { emoji: '🔥', name: 'Super Fan', min: 600 },
  { emoji: '🏆', name: 'Legend Fan', min: 1200 },
]

const BADGES = [
  { icon: '📝', label: '첫 의견 작성', desc: '의견 1건 작성하기', done: true },
  { icon: '💬', label: '댓글 10개 작성', desc: '댓글 10개 남기기', progress: 70 },
  { icon: '📊', label: '설문 5회 참여', desc: '설문 5회 참여하기', progress: 40 },
  { icon: '❤️', label: '공감 50개 받기', desc: '내 의견에 공감 50개', progress: 24 },
]

const MEDALS = ['🥇', '🥈', '🥉']

export default function FanRankingPage() {
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

  const themeStyle = { '--team': team.color, '--team-deep': team.colorDeep }
  const goWrite = () => navigate(`/club/${team.id}/write`)
  const goSurvey = () => navigate(`/club/${team.id}/survey`)

  // my level (mock, from MY_RANK score)
  let myLevelIdx = 0
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (MY_RANK.score >= LEVELS[i].min) { myLevelIdx = i; break }
  }
  const myLevel = LEVELS[myLevelIdx]
  const nextLevel = LEVELS[myLevelIdx + 1]
  const levelProgress = nextLevel
    ? Math.min(100, Math.round(((MY_RANK.score - myLevel.min) / (nextLevel.min - myLevel.min)) * 100))
    : 100

  const top3 = RANKING.slice(0, 3)
  const rest = RANKING.slice(3, 50)

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
            <button className="ch-logout" onClick={() => navigate('/')}>로그아웃</button>
          </div>
        </div>
        <nav className="ch-nav" aria-label="메인 메뉴">
          {MENU.map(item => {
            const active = item === '팬 랭킹'
            return (
              <a key={item} href="#" className={`ch-nav-item${active ? ' on' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={e => {
                  e.preventDefault()
                  if (item === '홈') navigate(`/club/${team.id}`)
                  else if (item === '팬 의견') navigate(`/club/${team.id}/opinions`)
                  else if (item === '내 활동') navigate(`/club/${team.id}/activity`)
                  else if (item === '경기센터') navigate(`/club/${team.id}/matches`)
                  else if (item === '팀 뉴스') navigate(`/club/${team.id}/news`)
                  else if (item === 'AI 인사이트') navigate(`/club/${team.id}/insights`)
                  else if (item === '팬 랭킹') navigate(`/club/${team.id}/ranking`)
                }}>
                {item}
              </a>
            )
          })}
        </nav>
      </header>

      {/* ── Main ── */}
      <main className="fr-main">
        <section className="fr-pagehead">
          <h1>팬 랭킹</h1>
          <p>팬들의 활동을 확인하고 함께 FANCLUV를 만들어 가세요.</p>
        </section>

        <div className="fr-grid">
          {/* Left 70% */}
          <div className="fr-col-main">

            {/* TOP 3 */}
            <section className="fr-top3" aria-label="이번 주 TOP 3">
              {[top3[1], top3[0], top3[2]].map((p, podiumIdx) => {
                const medalIdx = p.rank - 1
                const center = p.rank === 1
                return (
                  <div key={p.rank} className={`fr-podium r${p.rank}${center ? ' first' : ''}`}>
                    <div className="fr-medal" aria-hidden="true">{MEDALS[medalIdx]}</div>
                    <span className="fr-podium-avatar">{p.name[0]}</span>
                    <span className="fr-podium-name">{p.name}</span>
                    <span className="fr-podium-team">
                      <TeamEmblem color={p.team.color} size={16} /> {p.team.short}
                    </span>
                    <span className="fr-podium-score">{p.score.toLocaleString()}<em>점</em></span>
                    <span className="fr-podium-rank">{p.rank}위</span>
                  </div>
                )
              })}
            </section>

            {/* My rank */}
            <section className="fr-myrank">
              <div className="fr-myrank-head">
                <span className="fr-myrank-avatar">{NICKNAME[0]}</span>
                <div>
                  <span className="fr-myrank-name">{NICKNAME}님의 순위</span>
                  <span className="fr-myrank-level">{myLevel.emoji} {myLevel.name}</span>
                </div>
              </div>
              <div className="fr-myrank-stats">
                <div className="fr-myrank-stat">
                  <span className="fr-myrank-value">{MY_RANK.rank}<em>위</em></span>
                  <span className="fr-myrank-label">현재 순위</span>
                </div>
                <div className="fr-myrank-stat">
                  <span className="fr-myrank-value">{MY_RANK.score}<em>점</em></span>
                  <span className="fr-myrank-label">활동 점수</span>
                </div>
              </div>
              <p className="fr-myrank-hint">
                상위 {MY_RANK.nextThreshold}위까지 <strong>{MY_RANK.toNext}점</strong> 남았습니다.
              </p>
              <div className="fr-myrank-bar"><span style={{ width: '72%' }} /></div>
            </section>

            {/* Full ranking */}
            <section className="fr-panel">
              <div className="fr-panel-head">
                <h2 className="fr-panel-title">전체 랭킹 TOP 50</h2>
                <span className="fr-week">이번 주</span>
              </div>
              <ul className="fr-list">
                {rest.map(p => {
                  const me = false
                  return (
                    <li key={p.rank} className={`fr-row${me ? ' me' : ''}`}>
                      <span className="fr-rank">{p.rank}</span>
                      <span className="fr-avatar">{p.name[0]}</span>
                      <span className="fr-name">{p.name}</span>
                      <span className="fr-team"><TeamEmblem color={p.team.color} size={18} /> {p.team.short}</span>
                      <span className="fr-score">{p.score.toLocaleString()}점</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          </div>

          {/* Right 30% */}
          <aside className="fr-col-side">

            {/* Week stats */}
            <section className="fr-panel">
              <h2 className="fr-panel-title">이번 주 활동</h2>
              <div className="fr-weekstats">
                {WEEK_STATS.map(s => (
                  <div key={s.key} className="fr-weekstat">
                    <span className="fr-weekstat-icon" aria-hidden="true">{s.icon}</span>
                    <div className="fr-weekstat-body">
                      <span className="fr-weekstat-label">{s.label}</span>
                      <span className="fr-weekstat-name">{s.name} · {s.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Fan level + score rules */}
            <section className="fr-panel">
              <h2 className="fr-panel-title">팬 레벨</h2>
              <div className="fr-levels">
                {LEVELS.map((lv, i) => (
                  <div key={lv.name} className={`fr-level${i === myLevelIdx ? ' on' : ''}`}>
                    <span className="fr-level-emoji" aria-hidden="true">{lv.emoji}</span>
                    <span className="fr-level-name">{lv.name}</span>
                    {i === myLevelIdx && <span className="fr-level-tag">현재</span>}
                  </div>
                ))}
              </div>
              {nextLevel && (
                <>
                  <div className="fr-level-bar"><span style={{ width: `${levelProgress}%` }} /></div>
                  <p className="fr-level-hint">다음 레벨 <strong>{nextLevel.emoji} {nextLevel.name}</strong>까지 {levelProgress}%</p>
                </>
              )}
              <div className="fr-rules">
                {SCORE_RULES.map(r => (
                  <span key={r.label} className="fr-rule">{r.label} <em>{r.points}</em></span>
                ))}
              </div>
            </section>

            {/* Badges */}
            <section className="fr-panel">
              <h2 className="fr-panel-title">이번 주 획득 가능한 배지</h2>
              <div className="fr-badges">
                {BADGES.map(b => (
                  <div key={b.label} className={`fr-badge${b.done ? ' done' : ''}`}>
                    <span className="fr-badge-icon" aria-hidden="true">{b.icon}</span>
                    <div className="fr-badge-body">
                      <span className="fr-badge-label">{b.label}{b.done && <span className="fr-badge-done">획득 완료</span>}</span>
                      <span className="fr-badge-desc">{b.desc}</span>
                      {!b.done && <span className="fr-badge-bar"><span style={{ width: `${b.progress}%` }} /></span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* CTA */}
            <section className="fr-cta">
              <p className="fr-cta-text">랭킹을 올리려면 지금 의견을 남겨보세요.</p>
              <button className="fr-cta-btn primary" onClick={goWrite}>📝 의견 작성하기</button>
              <button className="fr-cta-btn secondary" onClick={goSurvey}>📊 설문 참여하기</button>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
