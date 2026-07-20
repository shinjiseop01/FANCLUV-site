import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import { logout, getCurrentUser } from './lib/auth.js'
import { getTeam, teamName, TeamEmblem, menuPath } from './teams.jsx'
import EmptyState from './components/EmptyState.jsx'
import RankIcon from './components/RankIcon.jsx'
import Avatar from './components/Avatar.jsx'
import { SkeletonList } from './components/Skeleton.jsx'
import Pagination from './components/Pagination.jsx'
import { getRanking, getMyRank } from './lib/rankingRepo.js'
import { ACTIVITY_POINTS } from './lib/activityScore.js'
import { subscribeChanges } from './lib/realtime.js'
import './ClubHomePage.css'
import './FanRankingPage.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

const CRITERIA = [
  { key: 'score', unit: '점' },
  { key: 'opinions', unit: '건' },
  { key: 'comments', unit: '개' },
  { key: 'surveys', unit: '회' },
  { key: 'empathy', unit: '개' },
]
const CRIT_KEY = { score: 'rank.critScore', opinions: 'rank.critOpinions', comments: 'rank.critComments', surveys: 'rank.critSurveys', empathy: 'rank.critEmpathy' }
const MEDAL_COLORS = ['#E8B33D', '#A9B2BD', '#C77B45']

// 점수 정책(단일 소스: activityScore.ACTIVITY_POINTS = DB 0041 와 동일)
const SCORE_RULES = [
  { label: '의견 작성', points: `+${ACTIVITY_POINTS.opinion}점` },
  { label: '댓글 작성', points: `+${ACTIVITY_POINTS.comment}점` },
  { label: '설문 참여', points: `+${ACTIVITY_POINTS.survey}점` },
  { label: '공감 받기', points: `+${ACTIVITY_POINTS.like}점` },
]
const LEVELS = [
  { icon: 'rookie', name: 'Rookie Fan', min: 0 },
  { icon: 'active', name: 'Active Fan', min: 200 },
  { icon: 'super', name: 'Super Fan', min: 600 },
  { icon: 'legend', name: 'Legend Fan', min: 1200 },
]

function Change({ value }) {
  // 실제 지난주 대비 변동 데이터가 없으면 표시하지 않는다(가짜 화살표 금지).
  if (value == null) return null
  if (value > 0) return <span className="fr-chg up">▲ {value}</span>
  if (value < 0) return <span className="fr-chg down">▼ {Math.abs(value)}</span>
  return <span className="fr-chg same">—</span>
}

export default function FanRankingPage() {
  const me = getCurrentUser()
  const NICKNAME = me?.nickname || '팬'
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { lang, t } = useLang()

  const [scope, setScope] = useState('league') // 'league'(전체) | 'club'(팀별)
  const [criteria, setCriteria] = useState('score')
  const [rankPage, setRankPage] = useState(1)
  useEffect(() => { setRankPage(1) }, [scope, criteria])
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({ source: 'live', rows: [], updatedAt: null })
  const [mine, setMine] = useState({ rank: null, total: 0, score: 0, opinions: 0, comments: 0, surveys: 0, empathy: 0, source: 'live' })
  const debounceRef = useRef(null)

  const scopeTeamId = scope === 'club' ? team?.id || null : null

  const load = useCallback(() => {
    if (!team) return
    let active = true
    setLoading(true)
    Promise.all([getRanking(scopeTeamId), getMyRank(me?.id, scopeTeamId)])
      .then(([rk, my]) => { if (!active) return; setData(rk); setMine(my); setLoading(false) })
      .catch(() => { if (active) { setData({ source: 'error', rows: [], updatedAt: null }); setLoading(false) } })
    return () => { active = false }
  }, [team, scopeTeamId, me?.id])

  useEffect(() => { const cleanup = load(); return cleanup }, [load])

  // 실시간: 의견/댓글/설문/공감 변화 시 debounce 후 랭킹 재조회(과도한 재조회 방지).
  useEffect(() => {
    const unsub = subscribeChanges(['opinions', 'comments', 'likes', 'survey_responses'], () => {
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => load(), 1500)
    })
    return () => { clearTimeout(debounceRef.current); unsub && unsub() }
  }, [load])

  // 페이지 포커스 복귀 시 재조회
  useEffect(() => {
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  // 선택 기준으로 재정렬(랭크 위치는 현재 뷰 기준 idx+1).
  const ranking = useMemo(() => {
    const rows = [...(data.rows || [])]
    if (criteria !== 'score') rows.sort((a, b) => b[criteria] - a[criteria])
    return rows.map((r, i) => ({ ...r, viewRank: i + 1 }))
  }, [data.rows, criteria])

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>존재하지 않는 구단입니다.</p>
        <button onClick={() => navigate('/team-select')}>구단 다시 선택하기</button>
      </div>
    )
  }

  const themeStyle = { '--team': team.color, '--team-deep': team.colorDeep }
  const crit = CRITERIA.find(c => c.key === criteria)
  const critLabel = t(CRIT_KEY[criteria])
  const fmt = v => (Number(v) || 0).toLocaleString()
  const scopeLabel = scope === 'league' ? t('rank.tabLeague') : t('rank.tabClub')

  const myValue = criteria === 'score' ? mine.score : mine[criteria]
  const hasRank = mine.rank != null

  // 내 레벨(실제 점수 기준)
  let myLevelIdx = 0
  for (let i = LEVELS.length - 1; i >= 0; i--) { if (mine.score >= LEVELS[i].min) { myLevelIdx = i; break } }
  const myLevel = LEVELS[myLevelIdx]
  const nextLevel = LEVELS[myLevelIdx + 1]
  const levelProgress = nextLevel ? Math.min(100, Math.round(((mine.score - myLevel.min) / (nextLevel.min - myLevel.min)) * 100)) : 100
  const percentile = hasRank && mine.total ? Math.max(1, Math.round((mine.rank / mine.total) * 100)) : null

  const RANK_PER = 10
  const top3 = ranking.slice(0, 3)
  const rest = ranking.slice(3)
  const restTotalPages = Math.max(1, Math.ceil(rest.length / RANK_PER))
  const restCur = Math.min(rankPage, restTotalPages)
  const visibleRest = rest.slice((restCur - 1) * RANK_PER, restCur * RANK_PER)
  const isEmpty = !loading && ranking.length === 0
  const isError = data.source === 'error'

  // 내 점수 상세(실제 집계)
  const breakdown = [
    { label: t('rank.critOpinions'), n: mine.opinions, pt: ACTIVITY_POINTS.opinion },
    { label: t('rank.critComments'), n: mine.comments, pt: ACTIVITY_POINTS.comment },
    { label: t('rank.critSurveys'), n: mine.surveys, pt: ACTIVITY_POINTS.survey },
    { label: t('rank.critEmpathy'), n: mine.empathy, pt: ACTIVITY_POINTS.like },
  ]

  // 주간(현 기준) 최다 활동자 — 실제 랭킹에서 파생(가짜 데이터 아님)
  const topByMetric = (key) => {
    let best = null
    for (const r of data.rows || []) if (!best || r[key] > best[key]) best = r
    return best && best[key] > 0 ? best : null
  }

  // 실제 배지 진행도
  const badges = [
    { icon: 'opinions', label: t('rank.badgeOpinion'), target: 1, cur: mine.opinions },
    { icon: 'comments', label: t('rank.badgeComment'), target: 10, cur: mine.comments },
    { icon: 'surveys', label: t('rank.badgeSurvey'), target: 5, cur: mine.surveys },
    { icon: 'empathy', label: t('rank.badgeEmpathy'), target: 50, cur: mine.empathy },
  ].map(b => ({ ...b, done: b.cur >= b.target, progress: Math.min(100, Math.round((b.cur / b.target) * 100)) }))

  return (
    <div className="ch-root" style={themeStyle}>
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
            const active = item === '팬 랭킹'
            return (
              <a key={item} href="#" className={`ch-nav-item${active ? ' on' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={e => { e.preventDefault(); navigate(menuPath(item, team.id)) }}>{t(NAV_KEYS[item])}</a>
            )
          })}
        </nav>
      </header>

      <main className="fr-main">
        <section className="fr-pagehead">
          <h1>{t('rank.title')}</h1>
          <p>{t('rank.subtitle')}</p>
        </section>

        {/* Scope tabs */}
        <div className="fr-tabs" role="tablist" aria-label="랭킹 범위">
          <button role="tab" aria-selected={scope === 'league'} className={`fr-tab${scope === 'league' ? ' on' : ''}`} onClick={() => { setScope('league'); setExpanded(false) }}>{t('rank.tabLeague')}</button>
          <button role="tab" aria-selected={scope === 'club'} className={`fr-tab${scope === 'club' ? ' on' : ''}`} onClick={() => { setScope('club'); setExpanded(false) }}>{t('rank.tabClub')}</button>
        </div>

        {/* Criteria filter */}
        <div className="fr-criteria" role="group" aria-label="랭킹 기준">
          {CRITERIA.map(c => (
            <button key={c.key} className={`fr-crit${criteria === c.key ? ' on' : ''}`} onClick={() => setCriteria(c.key)}>{t(CRIT_KEY[c.key])}</button>
          ))}
        </div>

        {loading ? (
          <SkeletonList count={6} lines={1} />
        ) : isError ? (
          <EmptyState icon={<RankIcon name="legend" size={30} />} title={t('rank.errorTitle')} message={t('rank.errorMsg')} />
        ) : (
        <div className="fr-grid">
          <div className="fr-col-main">

            {/* My rank */}
            <section className="fr-myrank">
              <div className="fr-myrank-head">
                <Avatar name={NICKNAME} src={me?.avatarUrl} size={38} />
                <div>
                  <span className="fr-myrank-name">{t('rank.myRank', { name: NICKNAME })}</span>
                  <span className="fr-myrank-level"><RankIcon name={myLevel.icon} size={15} /> {myLevel.name}</span>
                </div>
                <span className="fr-myrank-scope">{scopeLabel}</span>
              </div>
              {hasRank ? (
                <div className="fr-myrank-stats">
                  <div className="fr-myrank-stat">
                    <span className="fr-myrank-value">{fmt(mine.rank)}<em>위</em></span>
                    <span className="fr-myrank-label">/ {fmt(mine.total)}{t('rank.ofN')}</span>
                  </div>
                  <div className="fr-myrank-stat">
                    <span className="fr-myrank-value">{fmt(myValue)}<em>{crit.unit}</em></span>
                    <span className="fr-myrank-label">{critLabel}</span>
                  </div>
                  {percentile != null && (
                    <div className="fr-myrank-stat">
                      <span className="fr-myrank-value">{t('rank.topPct', { p: percentile })}</span>
                      <span className="fr-myrank-label">{t('rank.percentile')}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="fr-myrank-none">{t('rank.noRankYet')}</p>
              )}
              {/* 점수 상세(실제 집계) */}
              <div className="fr-score-detail">
                <span className="fr-score-detail-title">{t('rank.scoreBreakdown')}</span>
                {breakdown.map(b => (
                  <span key={b.label} className="fr-score-line">{b.label} {b.n}×{b.pt} = <em>{b.n * b.pt}{t('rank.pt')}</em></span>
                ))}
                <span className="fr-score-total">{t('rank.totalScore', { n: fmt(mine.score) })}</span>
              </div>
            </section>

            {isEmpty ? (
              <EmptyState icon={<RankIcon name="legend" size={30} />} title={t('rank.emptyTitle')} message={t('rank.emptyMsg')} />
            ) : (
            <>
            {/* TOP 3 */}
            <section className="fr-top3" aria-label="TOP 3">
              {[top3[1], top3[0], top3[2]].map(p => {
                if (!p) return null
                const center = p.viewRank === 1
                return (
                  <div key={p.userId} className={`fr-podium r${p.viewRank}${center ? ' first' : ''}`}>
                    <div className="fr-medal" aria-hidden="true"><RankIcon name="medal" size={center ? 36 : 30} style={{ color: MEDAL_COLORS[p.viewRank - 1] }} /></div>
                    <Avatar name={p.nickname} src={p.avatarUrl} size={center ? 52 : 44} />
                    <span className="fr-podium-name">{p.nickname}</span>
                    {p.team && <span className="fr-podium-team"><TeamEmblem color={p.team.color} size={16} /> {p.team.short}</span>}
                    <span className="fr-podium-score">{fmt(p[criteria])}<em>{crit.unit}</em></span>
                    <span className="fr-podium-rank">{p.viewRank}위</span>
                  </div>
                )
              })}
            </section>

            {/* Full ranking */}
            <section className="fr-panel">
              <div className="fr-panel-head">
                <h2 className="fr-panel-title">
                  {scopeLabel} {t('rank.top50')}
                  {data.updatedAt && <span className="fr-update-note">{t('rank.updatedAt', { time: new Date(data.updatedAt).toLocaleTimeString(lang === 'en' ? 'en-US' : 'ko-KR', { hour: '2-digit', minute: '2-digit' }) })}</span>}
                </h2>
                <span className="fr-week">{t('rank.criteriaBasis', { c: critLabel })}</span>
              </div>
              <ul className={`fr-list ${scope}`}>
                {visibleRest.map(p => (
                  <li key={p.userId} className={`fr-row${p.userId === me?.id ? ' me' : ''}`}>
                    <span className="fr-rank">{p.viewRank}</span>
                    <Avatar name={p.nickname} src={p.avatarUrl} size={30} />
                    <span className="fr-name">{p.nickname}</span>
                    {scope === 'league' && p.team && (
                      <span className="fr-team"><TeamEmblem color={p.team.color} size={18} /> {teamName(p.team, lang)}</span>
                    )}
                    <span className="fr-score">{fmt(p[criteria])}{crit.unit}</span>
                  </li>
                ))}
              </ul>
              <Pagination page={restCur} total={restTotalPages} onChange={setRankPage} />
            </section>
            </>
            )}
          </div>

          {/* Right */}
          <aside className="fr-col-side">
            {/* Top per metric (실제 파생) */}
            <section className="fr-panel">
              <h2 className="fr-panel-title">{t('rank.topActivity')}</h2>
              <div className="fr-weekstats">
                {[['opinions', 'rank.critOpinions', '건'], ['comments', 'rank.critComments', '개'], ['surveys', 'rank.critSurveys', '회'], ['empathy', 'rank.critEmpathy', '개']].map(([key, lk, unit]) => {
                  const b = topByMetric(key)
                  return (
                    <div key={key} className="fr-weekstat">
                      <span className="fr-weekstat-icon" aria-hidden="true"><RankIcon name={key} size={20} /></span>
                      <div className="fr-weekstat-body">
                        <span className="fr-weekstat-label">{t(lk)}</span>
                        <span className="fr-weekstat-name">{b ? `${b.nickname} · ${fmt(b[key])}${unit}` : t('rank.noneYet')}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Fan level + score rules */}
            <section className="fr-panel">
              <h2 className="fr-panel-title">{t('rank.fanLevel')}</h2>
              <div className="fr-levels">
                {LEVELS.map((lv, i) => (
                  <div key={lv.name} className={`fr-level${i === myLevelIdx ? ' on' : ''}`}>
                    <span className="fr-level-emoji" aria-hidden="true"><RankIcon name={lv.icon} size={18} /></span>
                    <span className="fr-level-name">{lv.name}</span>
                    {i === myLevelIdx && <span className="fr-level-tag">{t('rank.current')}</span>}
                  </div>
                ))}
              </div>
              {nextLevel && (
                <>
                  <div className="fr-level-bar"><span style={{ width: `${levelProgress}%` }} /></div>
                  <p className="fr-level-hint">{t('rank.toNext', { name: nextLevel.name, p: levelProgress })}</p>
                </>
              )}
              <div className="fr-rules" title={t('rank.scoreBasisHint')}>
                {SCORE_RULES.map(r => (<span key={r.label} className="fr-rule">{r.label} <em>{r.points}</em></span>))}
              </div>
            </section>

            {/* Badges (실제 진행도) */}
            <section className="fr-panel">
              <h2 className="fr-panel-title">{t('rank.badges')}</h2>
              <div className="fr-badges">
                {badges.map(b => (
                  <div key={b.label} className={`fr-badge${b.done ? ' done' : ''}`}>
                    <span className="fr-badge-icon" aria-hidden="true"><RankIcon name={b.icon} size={20} /></span>
                    <div className="fr-badge-body">
                      <span className="fr-badge-label">{b.label}{b.done && <span className="fr-badge-done">{t('rank.badgeDone')}</span>}</span>
                      <span className="fr-badge-desc">{b.cur} / {b.target}</span>
                      {!b.done && <span className="fr-badge-bar"><span style={{ width: `${b.progress}%` }} /></span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="fr-cta">
              <p className="fr-cta-text">{t('rank.ctaText')}</p>
              <button className="fr-cta-btn primary" onClick={() => navigate(`/club/${team.id}/write`)}><RankIcon name="opinions" size={16} /> {t('rank.ctaWrite')}</button>
              <button className="fr-cta-btn secondary" onClick={() => navigate(`/club/${team.id}/survey`)}><RankIcon name="surveys" size={16} /> {t('rank.ctaSurvey')}</button>
            </section>
          </aside>
        </div>
        )}
      </main>
    </div>
  )
}
