import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import { logout, getCurrentUser } from './lib/auth.js'
import { getTeam, teamName, TeamEmblem, menuPath } from './teams.jsx'
import EmptyState from './components/EmptyState.jsx'
import Icon from './components/Icon.jsx'
import { SkeletonList } from './components/Skeleton.jsx'
import { loadMatchDetail } from './lib/matchRepo.js'
import './ClubHomePage.css'
import './MatchCenterPage.css'
import './MatchDetailPage.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']
// 표시 지원 팀기록(공식 matchRecord.do 확인 필드만). higher-better 아닌 것도 값 그대로 표시.
const STAT_ROWS = ['possession', 'attempts', 'onTarget', 'corners', 'fouls', 'offsides', 'freeKicks', 'yellowCards', 'redCards']

export default function MatchDetailPage() {
  const NICKNAME = getCurrentUser()?.nickname || '팬'
  const { teamId, matchId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { lang, t } = useLang()

  const [m, setM] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const load = useCallback(() => {
    let active = true
    setLoading(true); setNotFound(false)
    loadMatchDetail(matchId)
      .then(d => { if (!active) return; if (!d) setNotFound(true); setM(d); setLoading(false) })
      .catch(() => { if (active) { setNotFound(true); setLoading(false) } })
    return () => { active = false }
  }, [matchId])
  useEffect(() => load(), [load])

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>{t('match.noTeam')}</p>
        <button onClick={() => navigate('/team-select')}>{t('match.reselect')}</button>
      </div>
    )
  }

  const backToCenter = () => navigate(`/club/${team.id}/matches`)
  // 경기의견 작성 — 상대팀 context(vs) 전달(기존 흐름 재사용). 상대 = 보는 구단이 아닌 쪽.
  const goWrite = () => {
    const opp = m && m.home && m.away ? (m.home.id === team.id ? m.away : m.home) : null
    const vs = opp ? teamName(opp, lang) : null
    navigate(`/club/${team.id}/write${vs ? `?vs=${encodeURIComponent(vs)}` : ''}`)
  }

  const finished = m?.finished
  const detail = m?.detail || null
  const events = detail?.events || null
  const stats = detail?.stats || null
  const goals = events?.goals || []
  const timeline = events?.timeline || []
  const statusText = m ? t(`match.status.${m.status}`) : ''

  return (
    <div className="ch-root" style={{ '--team': team.color, '--team-deep': team.colorDeep }}>
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
              <a key={item} href="#" className={`ch-nav-item${active ? ' on' : ''}`} aria-current={active ? 'page' : undefined}
                onClick={e => { e.preventDefault(); navigate(menuPath(item, team.id)) }}>{t(NAV_KEYS[item])}</a>
            )
          })}
        </nav>
      </header>

      <main className="mc-main md-main">
        <button className="md-back" onClick={backToCenter}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span>{t('match.backToCenter')}</span>
        </button>

        {loading ? <SkeletonList count={3} lines={2} />
          : notFound || !m ? (
            <EmptyState iconName="ball" title={t('match.detailMissingTitle')} message={t('match.detailMissingMsg')} ctaLabel={t('match.backToCenter')} onCta={backToCenter} />
          ) : <>
          {/* ── 스코어보드 ── */}
          <section className="md-scoreboard">
            <div className="md-meta">
              <span className="md-league">{t('match.leagueRound', { round: m.round ?? '-' })}</span>
              <span className="md-dt">{m.date} {m.time}</span>
              {m.stadium && <span className="ic-txt"><Icon name="pin" size={14} /> {m.stadium}</span>}
            </div>
            <div className="md-teams">
              <div className="md-team">
                <TeamEmblem color={m.home?.color || '#888'} size={62} />
                <span className="md-team-name">{m.home ? teamName(m.home, lang) : m.homeTeamName}</span>
                <span className="md-ha">HOME</span>
              </div>
              <div className="md-center">
                {finished ? (
                  <span className="md-score">{m.homeScore} <span className="md-colon">:</span> {m.awayScore}</span>
                ) : (
                  <span className="md-vs">VS</span>
                )}
                <span className={`md-status ${m.status}`}>{statusText}</span>
              </div>
              <div className="md-team">
                <TeamEmblem color={m.away?.color || '#888'} size={62} />
                <span className="md-team-name">{m.away ? teamName(m.away, lang) : m.awayTeamName}</span>
                <span className="md-ha away">AWAY</span>
              </div>
            </div>
          </section>

          {/* ── 예정 경기: 상세 없음 안내 ── */}
          {!finished && (
            <section className="mc-panel">
              <EmptyState iconName="clock" title={t('match.scheduledTitle')} message={t('match.scheduledMsg')} />
            </section>
          )}

          {/* ── 득점 (공식 지원) ── */}
          {finished && goals.length > 0 && (
            <section className="mc-panel">
              <h2 className="mc-panel-title">{t('match.goals')}</h2>
              <ul className="md-goals">
                {goals.map((g, i) => (
                  <li key={i} className={`md-goal ${g.side}`}>
                    <span className="md-goal-min">{g.minute != null ? `${g.minute}'` : ''}</span>
                    <span className="md-goal-player">
                      {g.player}{g.ownGoal ? <em className="md-og"> (OG)</em> : null}
                      {g.assist ? <span className="md-assist"> ({t('match.assist')}: {g.assist})</span> : null}
                    </span>
                    <span className="md-goal-side">{g.side === 'home' ? (m.home ? teamName(m.home, lang) : '') : (m.away ? teamName(m.away, lang) : '')}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── 경기 기록 (공식 지원) ── */}
          {finished && stats && (stats.home || stats.away) && (
            <section className="mc-panel">
              <h2 className="mc-panel-title">{t('match.stats')}</h2>
              <div className="md-stats">
                {STAT_ROWS.filter(k => (stats.home?.[k] != null) || (stats.away?.[k] != null)).map(k => {
                  const h = stats.home?.[k]; const a = stats.away?.[k]
                  const hv = h == null ? 0 : h; const av = a == null ? 0 : a
                  const tot = hv + av
                  const hp = tot > 0 ? Math.round((hv / tot) * 100) : 50
                  return (
                    <div key={k} className="md-stat">
                      <span className="md-stat-v home">{h == null ? '-' : h}{k === 'possession' ? '%' : ''}</span>
                      <div className="md-stat-mid">
                        <span className="md-stat-label">{t(`match.stat.${k}`)}</span>
                        <div className="md-stat-bar"><i className="home" style={{ width: `${hp}%` }} /><i className="away" style={{ width: `${100 - hp}%` }} /></div>
                      </div>
                      <span className="md-stat-v away">{a == null ? '-' : a}{k === 'possession' ? '%' : ''}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* ── 타임라인: 득점/교체/카드 (공식 지원) ── */}
          {finished && timeline.length > 0 && (
            <section className="mc-panel">
              <h2 className="mc-panel-title">{t('match.timeline')}</h2>
              <ul className="md-timeline">
                {timeline.map((e, i) => (
                  <li key={i} className={`md-tl ${e.side}`}>
                    <span className="md-tl-min">{e.minute != null ? `${e.minute}'` : ''}</span>
                    <span className={`md-tl-ic ${e.kind}${e.cardType ? ' ' + e.cardType : ''}`} aria-hidden="true">
                      {e.kind === 'goal' ? '⚽' : e.kind === 'sub' ? '⇄' : e.cardType === 'red' ? '🟥' : '🟨'}
                    </span>
                    <span className="md-tl-txt">
                      {e.kind === 'goal' && <>{t('match.goal')} · <strong>{e.player}</strong>{e.ownGoal ? ` (OG)` : ''}{e.assist ? ` (${t('match.assist')}: ${e.assist})` : ''}</>}
                      {e.kind === 'card' && <>{e.cardType === 'red' ? t('match.redCard') : t('match.yellowCard')} · <strong>{e.player}</strong></>}
                      {e.kind === 'sub' && <>{t('match.sub')} · <strong>{e.playerIn || '-'}</strong> ↔ {e.playerOut || '-'}</>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── 라인업: 공식 JSON 미제공 → 정직한 Empty State (가짜 명단 금지) ── */}
          {finished && (
            <section className="mc-panel">
              <h2 className="mc-panel-title">{t('match.lineup')}</h2>
              <EmptyState iconName="users" title={t('match.lineupEmptyTitle')} message={t('match.lineupEmptyMsg')} />
            </section>
          )}

          {/* ── 종료됐지만 상세 미수집: graceful (코어는 보이고 상세만 안내) ── */}
          {finished && !detail && (
            <section className="mc-panel">
              <EmptyState iconName="ball" title={t('match.detailPendingTitle')} message={t('match.detailPendingMsg')} />
            </section>
          )}

          {/* ── 경기 의견 작성하기 (기존 흐름 재사용) ── */}
          <div className="md-cta">
            <button className="mc-cta-btn primary" onClick={goWrite}>{t('match.ctaWrite')}</button>
          </div>
        </>}
      </main>
    </div>
  )
}
