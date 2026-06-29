import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import { logout, getCurrentUser } from './lib/auth.js'
import { getTeam, TEAMS, TeamEmblem, menuPath } from './teams.jsx'
import './ClubHomePage.css'
import './MatchCenterPage.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

const STADIUMS = {
  seoul: '서울월드컵경기장', ulsan: '울산문수경기장', jeonbuk: '전주월드컵경기장',
  pohang: '포항스틸야드', daejeon: '대전월드컵경기장', gwangju: '광주축구전용구장',
  gangwon: '강릉종합운동장', gimcheon: '김천종합스포츠타운', jeju: '제주월드컵경기장',
  anyang: '안양종합운동장', incheon: '인천축구전용경기장', bucheon: '부천종합운동장',
}

// pick a few distinct opponents (deterministic) from the other clubs
function opponentsFor(teamId) {
  const others = TEAMS.filter(t => t.id !== teamId)
  const seed = teamId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const pick = n => others[(seed * (n + 1)) % others.length]
  return [pick(0), pick(2), pick(4), pick(6), pick(8), pick(1), pick(3)]
}

export default function MatchCenterPage() {
  const NICKNAME = getCurrentUser()?.nickname || '팬'
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { lang, setLang, t } = useLang()

  const data = useMemo(() => {
    if (!team) return null
    const opp = opponentsFor(team.id)
    const next = { home: team, away: opp[0], date: '2026.07.02', time: '19:30',
      stadium: STADIUMS[team.id], dday: 'D-3' }
    const live = { home: team, away: opp[5], homeScore: 1, awayScore: 1, minute: "67'",
      stadium: STADIUMS[team.id] }
    const upcoming = [
      { id: 'u1', date: '2026.07.06', time: '19:00', home: opp[1], away: team, stadium: STADIUMS[opp[1].id] },
      { id: 'u2', date: '2026.07.13', time: '18:30', home: team, away: opp[2], stadium: STADIUMS[team.id] },
      { id: 'u3', date: '2026.07.20', time: '20:00', home: opp[3], away: team, stadium: STADIUMS[opp[3].id] },
    ]
    const recent = [
      { id: 'r1', date: '2026.06.24', home: team, away: opp[0], homeScore: 2, awayScore: 1, stadium: STADIUMS[team.id] },
      { id: 'r2', date: '2026.06.18', home: opp[4], away: team, homeScore: 0, awayScore: 0, stadium: STADIUMS[opp[4].id] },
      { id: 'r3', date: '2026.06.11', home: opp[6], away: team, homeScore: 3, awayScore: 2, stadium: STADIUMS[opp[6].id] },
    ]
    // mock standings: put current team near the top, fill the rest
    const standings = [
      { team, pts: 47 },
      { team: opp[0], pts: 45 },
      { team: opp[1], pts: 42 },
      { team: opp[2], pts: 38 },
      { team: opp[3], pts: 35 },
      { team: opp[4], pts: 31 },
    ]
    return { next, live, upcoming, recent, standings }
  }, [team])

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>존재하지 않는 구단입니다.</p>
        <button onClick={() => navigate('/team-select')}>구단 다시 선택하기</button>
      </div>
    )
  }

  const goWrite = () => navigate(`/club/${team.id}/write`)
  const goSurvey = () => navigate(`/club/${team.id}/survey`)
  const goOpinions = () => navigate(`/club/${team.id}/opinions`)

  const { next, live, upcoming, recent, standings } = data

  function outcome(m) {
    const my = m.home.id === team.id ? m.homeScore : m.awayScore
    const their = m.home.id === team.id ? m.awayScore : m.homeScore
    if (my > their) return { label: '승', cls: 'win' }
    if (my < their) return { label: '패', cls: 'loss' }
    return { label: '무', cls: 'draw' }
  }

  return (
    <div className="ch-root" style={{ '--team': team.color, '--team-deep': team.colorDeep }}>

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
            <span className="ch-user">{NICKNAME}{t('common.honorific')}</span>
            <button className="ch-icon-btn" title={t('common.settings')} aria-label={t('common.settings')} onClick={() => navigate(`/club/${team.id}/settings`)}>
              <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.4"/></svg>
            </button>
            <button className="ch-logout" onClick={() => { logout(); navigate('/') }}>{t('common.logout')}</button>
          </div>
        </div>
        <nav className="ch-nav" aria-label="메인 메뉴">
          {MENU.map(item => {
            const active = item === '경기센터'
            return (
              <a key={item} href="#" className={`ch-nav-item${active ? ' on' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={e => { e.preventDefault(); navigate(menuPath(item, team.id)) }}>{t(NAV_KEYS[item])}</a>
            )
          })}
        </nav>
      </header>

      {/* ── Main ── */}
      <main className="mc-main">
        <section className="mc-pagehead">
          <h1>{t('match.title')}</h1>
          <p>{t('match.subtitle')}</p>
        </section>

        <div className="mc-grid">
          {/* Left */}
          <div className="mc-col-main">

            {/* Next match (hero) */}
            <section className="mc-next">
              <div className="mc-next-top">
                <span className="mc-next-label">{t('match.next')}</span>
                <span className="mc-dday">{next.dday}</span>
              </div>
              <div className="mc-matchup">
                <div className="mc-side">
                  <TeamEmblem color={next.home.color} size={64} />
                  <span className="mc-side-name">{next.home.name}</span>
                  <span className="mc-side-tag">HOME</span>
                </div>
                <div className="mc-vs">VS</div>
                <div className="mc-side">
                  <TeamEmblem color={next.away.color} size={64} />
                  <span className="mc-side-name">{next.away.name}</span>
                  <span className="mc-side-tag">AWAY</span>
                </div>
              </div>
              <div className="mc-next-meta">
                <span>📅 {next.date}</span>
                <span>🕒 {next.time}</span>
                <span>📍 {next.stadium}</span>
              </div>

              {/* CTA */}
              <div className="mc-cta">
                <button className="mc-cta-btn primary" onClick={goWrite}>
                  {t('match.ctaWrite')}
                </button>
                <button className="mc-cta-btn secondary" onClick={goSurvey}>
                  {t('match.ctaSurvey')}
                </button>
              </div>
            </section>

            {/* Schedule */}
            <section className="mc-panel">
              <h2 className="mc-panel-title">{t('match.schedule')}</h2>
              <ul className="mc-list">
                {upcoming.map(m => (
                  <li key={m.id} className="mc-match">
                    <div className="mc-match-date">
                      <span className="mc-date">{m.date}</span>
                      <span className="mc-time">{m.time}</span>
                    </div>
                    <div className="mc-match-teams">
                      <span className="mc-team-line">
                        <TeamEmblem color={m.home.color} size={12} /> {m.home.name}
                        <span className="mc-ha">홈</span>
                      </span>
                      <span className="mc-team-line">
                        <TeamEmblem color={m.away.color} size={12} /> {m.away.name}
                        <span className="mc-ha away">원정</span>
                      </span>
                    </div>
                    <div className="mc-match-info">
                      <span className="mc-stadium">📍 {m.stadium}</span>
                      <span className="mc-status upcoming">{t('match.upcoming')}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Recent results */}
            <section className="mc-panel">
              <h2 className="mc-panel-title">{t('match.recent')}</h2>
              <ul className="mc-list">
                {recent.map(m => {
                  const o = outcome(m)
                  return (
                    <li key={m.id} className="mc-match">
                      <div className="mc-match-date">
                        <span className="mc-date">{m.date}</span>
                        <span className={`mc-outcome ${o.cls}`}>{o.label}</span>
                      </div>
                      <div className="mc-result">
                        <span className="mc-result-team right"><TeamEmblem color={m.home.color} size={12} /> {m.home.name}</span>
                        <span className="mc-score">{m.homeScore} : {m.awayScore}</span>
                        <span className="mc-result-team"><TeamEmblem color={m.away.color} size={12} /> {m.away.name}</span>
                      </div>
                      <div className="mc-match-info">
                        <span className="mc-stadium">📍 {m.stadium}</span>
                        <button className="mc-op-btn" onClick={goOpinions}>{t('match.viewOpinion')}</button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          </div>

          {/* Right */}
          <aside className="mc-col-side">

            {/* Live match */}
            <section className="mc-panel mc-live">
              <div className="mc-live-head">
                <span className="mc-live-badge"><span className="mc-live-dot" /> LIVE</span>
                <span className="mc-live-min">{live.minute}</span>
              </div>
              <div className="mc-live-body">
                <div className="mc-live-team">
                  <TeamEmblem color={live.home.color} size={34} />
                  <span>{live.home.name}</span>
                </div>
                <span className="mc-live-score">{live.homeScore} : {live.awayScore}</span>
                <div className="mc-live-team">
                  <TeamEmblem color={live.away.color} size={34} />
                  <span>{live.away.name}</span>
                </div>
              </div>
              <p className="mc-live-stadium">📍 {live.stadium}</p>
            </section>

            {/* Standings */}
            <section className="mc-panel">
              <h2 className="mc-panel-title">{t('match.standings')}</h2>
              <table className="mc-table">
                <thead>
                  <tr><th>순위</th><th>팀</th><th>승점</th></tr>
                </thead>
                <tbody>
                  {standings.map((s, i) => (
                    <tr key={s.team.id} className={s.team.id === team.id ? 'me' : ''}>
                      <td className="mc-rank">{i + 1}</td>
                      <td className="mc-tname"><TeamEmblem color={s.team.color} size={11} /> {s.team.name}</td>
                      <td className="mc-pts">{s.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* Quick links */}
            <section className="mc-panel">
              <h2 className="mc-panel-title">{t('match.quick')}</h2>
              <div className="mc-quick">
                <button onClick={goWrite}>📝 경기 의견 작성</button>
                <button onClick={goSurvey}>📊 경기 설문 참여</button>
                <button onClick={goOpinions}>💬 팬 의견 보러 가기</button>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
