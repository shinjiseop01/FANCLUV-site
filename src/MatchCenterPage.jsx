import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import { logout, getCurrentUser } from './lib/auth.js'
import { getTeam, teamName, TeamEmblem, menuPath } from './teams.jsx'
import EmptyState from './components/EmptyState.jsx'
import Icon from './components/Icon.jsx'
import { SkeletonList } from './components/Skeleton.jsx'
import { loadStandings, loadMatchData, refreshMatch, isLeagueApiConfigured, isLeagueUnconfigured } from './lib/matchRepo.js'
import DemoBadge from './components/DemoBadge.jsx'
import './ClubHomePage.css'
import './MatchCenterPage.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

export default function MatchCenterPage() {
  const NICKNAME = getCurrentUser()?.nickname || '팬'
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { lang, t } = useLang()

  const [data, setData] = useState(null)         // { next, live, upcoming, recent }
  const [standings, setStandings] = useState([]) // [{ rank, team, played, win, draw, loss, gd, points }]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // 순위표 + 경기 일정 로드 (Provider→Mock fallback, 30초 캐시 — matchRepo)
  const load = useCallback(() => {
    if (!team) return
    let active = true
    setLoading(true)
    setError(false)
    Promise.all([loadMatchData(team.id), loadStandings()])
      .then(([md, st]) => {
        if (!active) return
        setData(md)
        setStandings(st?.rows || [])
        setLoading(false)
        if (!md) setError(true)
      })
      .catch(() => { if (active) { setError(true); setLoading(false) } })
    return () => { active = false }
  }, [team])

  useEffect(() => load(), [load])

  function refresh() {
    refreshMatch(team?.id)
    load()
  }

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>존재하지 않는 구단입니다.</p>
        <button onClick={() => navigate('/team-select')}>구단 다시 선택하기</button>
      </div>
    )
  }

  // 경기의견 작성 — 선택적으로 상대팀 context(vs=)를 전달해 작성 화면 제목을 프리필한다.
  const goWrite = (vs) => navigate(`/club/${team.id}/write${vs ? `?vs=${encodeURIComponent(vs)}` : ''}`)
  const goOpinions = () => navigate(`/club/${team.id}/opinions`)

  const { next, live, upcoming, recent } = data || {}

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
            <button className="ch-logout" onClick={() => { logout(); navigate('/', { replace: true }) }}>{t('common.logout')}</button>
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
        {isLeagueUnconfigured ? (
          /* 프로덕션 · 실제 공급원 미설정 → Mock 노출 금지, "준비 중" + 공식 페이지 링크 */
          <EmptyState
            iconName="ball"
            title={t('match.providerPendingTitle')}
            message={t('match.providerPendingMsg')}
            ctaLabel={t('match.officialCta')}
            onCta={() => window.open('https://www.kleague.com', '_blank', 'noopener,noreferrer')}
          />
        ) : loading ? <SkeletonList count={4} lines={2} /> : (error || !data || !next) ? (
          <EmptyState
            iconName="ball"
            title={t('match.emptyTitle')}
            message={t('match.emptyMsg')}
            ctaLabel={t('common.refresh')}
            onCta={refresh}
          />
        ) : <>
        <section className="mc-pagehead">
          <div className="mc-pagehead-text">
            <h1>{t('match.title')} {!isLeagueApiConfigured && <DemoBadge />}</h1>
            <p>{t('match.subtitle')}</p>
          </div>
          <button className="mc-refresh" onClick={refresh} aria-label={t('common.refresh')}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span>{t('common.refresh')}</span>
          </button>
        </section>

        <div className="mc-grid">
          {/* Left */}
          <div className="mc-col-main">

            {/* Next match (hero) — 예정 경기가 없으면(시즌 말 등) 안내로 대체 */}
            <section className="mc-next">
              <div className="mc-next-top">
                <span className="mc-next-label">{t('match.next')}</span>
                {next && <span className="mc-dday">{next.dday}</span>}
              </div>
              {next && next.home && next.away ? (
              <>
              <div className="mc-matchup">
                <div className="mc-side">
                  <TeamEmblem color={next.home.color} size={64} />
                  <span className="mc-side-name">{teamName(next.home, lang)}</span>
                  <span className="mc-side-tag">HOME</span>
                </div>
                <div className="mc-vs">VS</div>
                <div className="mc-side">
                  <TeamEmblem color={next.away.color} size={64} />
                  <span className="mc-side-name">{teamName(next.away, lang)}</span>
                  <span className="mc-side-tag">AWAY</span>
                </div>
              </div>
              <div className="mc-next-meta">
                <span className="ic-txt"><Icon name="calendar" size={15} /> {next.date}</span>
                <span className="ic-txt"><Icon name="clock" size={15} /> {next.time}</span>
                <span className="ic-txt"><Icon name="pin" size={15} /> {next.stadium}</span>
              </div>
              </>
              ) : (
                <p className="mc-next-empty">{t('match.noUpcoming')}</p>
              )}

              {/* CTA — 다음 경기 카드의 유일한 팬 참여 CTA(경기의견 작성하기). 현재 표시 경기 기준. */}
              <div className="mc-cta">
                <button className="mc-cta-btn primary" onClick={() => goWrite(
                  next && next.home && next.away
                    ? teamName(next.home.id === team.id ? next.away : next.home, lang)
                    : null)}>
                  {t('match.ctaWrite')}
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
                        <TeamEmblem color={m.home.color} size={12} /> {teamName(m.home, lang)}
                        <span className="mc-ha">홈</span>
                      </span>
                      <span className="mc-team-line">
                        <TeamEmblem color={m.away.color} size={12} /> {teamName(m.away, lang)}
                        <span className="mc-ha away">원정</span>
                      </span>
                    </div>
                    <div className="mc-match-info">
                      <span className="mc-stadium ic-txt"><Icon name="pin" size={13} /> {m.stadium}</span>
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
                        <span className="mc-result-team right"><TeamEmblem color={m.home.color} size={12} /> {teamName(m.home, lang)}</span>
                        <span className="mc-score">{m.homeScore} : {m.awayScore}</span>
                        <span className="mc-result-team"><TeamEmblem color={m.away.color} size={12} /> {teamName(m.away, lang)}</span>
                      </div>
                      <div className="mc-match-info">
                        <span className="mc-stadium ic-txt"><Icon name="pin" size={13} /> {m.stadium}</span>
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

            {/* Live match — 공식 소스에 안정적 LIVE 가 있을 때만 표시(Phase 1: 미제공 → 숨김) */}
            {live && live.home && live.away && (
            <section className="mc-panel mc-live">
              <div className="mc-live-head">
                <span className="mc-live-badge"><span className="mc-live-dot" /> LIVE</span>
                <span className="mc-live-min">{live.minute}</span>
              </div>
              <div className="mc-live-body">
                <div className="mc-live-team">
                  <TeamEmblem color={live.home.color} size={34} />
                  <span>{teamName(live.home, lang)}</span>
                </div>
                <span className="mc-live-score">{live.homeScore} : {live.awayScore}</span>
                <div className="mc-live-team">
                  <TeamEmblem color={live.away.color} size={34} />
                  <span>{teamName(live.away, lang)}</span>
                </div>
              </div>
              <p className="mc-live-stadium ic-txt"><Icon name="pin" size={14} /> {live.stadium}</p>
            </section>
            )}

            {/* Standings (실시간 순위표 — API 미연결 시 Mock) */}
            <section className="mc-panel">
              <h2 className="mc-panel-title">{t('match.standings')}</h2>
              <div className="mc-table-wrap">
                <table className="mc-table">
                  <thead>
                    <tr>
                      <th>{t('match.stRank')}</th>
                      <th className="mc-th-team">{t('match.stTeam')}</th>
                      <th>{t('match.stPlayed')}</th>
                      <th>{t('match.stWin')}</th>
                      <th>{t('match.stDraw')}</th>
                      <th>{t('match.stLoss')}</th>
                      <th>{t('match.stGf')}</th>
                      <th>{t('match.stGa')}</th>
                      <th>{t('match.stGd')}</th>
                      <th>{t('match.stPoints')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map(s => (
                      <tr key={s.team.id} className={s.team.id === team.id ? 'me' : ''}>
                        <td className="mc-rank">{s.rank}</td>
                        <td className="mc-tname"><TeamEmblem color={s.team.color} size={14} /> <span>{teamName(s.team, lang)}</span></td>
                        <td>{s.played}</td>
                        <td>{s.win}</td>
                        <td>{s.draw}</td>
                        <td>{s.loss}</td>
                        <td>{s.gf}</td>
                        <td>{s.ga}</td>
                        <td className="mc-gd">{s.gd > 0 ? `+${s.gd}` : s.gd}</td>
                        <td className="mc-pts">{s.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Quick links */}
            <section className="mc-panel">
              <h2 className="mc-panel-title">{t('match.quick')}</h2>
              <div className="mc-quick">
                <button className="ic-txt" onClick={() => goWrite()}><Icon name="edit" size={16} /> 경기 의견 작성</button>
                <button className="ic-txt" onClick={goOpinions}><Icon name="comment" size={16} /> 팬 의견 보러 가기</button>
              </div>
            </section>
          </aside>
        </div>
        </>}
      </main>
    </div>
  )
}
