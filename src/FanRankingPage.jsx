import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import { logout, getCurrentUser } from './lib/auth.js'
import { getTeam, teamName, TEAMS, TeamEmblem, menuPath } from './teams.jsx'
import EmptyState from './components/EmptyState.jsx'
import RankIcon from './components/RankIcon.jsx'
import { SkeletonList } from './components/Skeleton.jsx'
import { useFakeLoading } from './lib/useFakeLoading.js'
import './ClubHomePage.css'
import './FanRankingPage.css'

// Mock data is always present; flip to false to preview the empty state.
const HAS_RANKING = true

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

// fans competing across the whole league
const LEAGUE_NAMES = [
  '블루윙', '레전드7', '직관러', '서포터K', '풋볼러버', '응원단장', '굿즈수집가', '시즌권홀더',
  '평일직관', '홈경기지킴이', '원정메이트', '풋볼맘', '필드의신', '12번째선수', '북패치', '응원가장인',
  '티켓요정', '골넣자', '주말축구', '클린시트', '미드필더', '라스트맨', '풋살왕', '관중석불꽃',
  '응원봉', '한일전', '스카프부대', '코너킥', '오프사이드', '해트트릭', '캡틴리더', '벤치워머',
  '풋볼다이어리', '경기장로컬', '시즌초심', '득점왕팬', '왼발잡이', '풀타임직관', '응원리더', '데이터팬',
  '하프타임', '추가시간', '득점기계', '리그광', '구단사랑', '인저리타임', '백넘버', '잔디남',
  '응원폼', '풋볼브레인',
]
// fans within our own club
const CLUB_NAMES = [
  '홈경기단골', '시즌권1호', '울트라스', '직관마스터', '응원대장', '굿즈덕후', '원정버스', '깃발지기',
  '북소리', '응원가왕', '골세리머니', '팬존터줏대감', '하이파이브', '스카프장인', '경기장요정', '주말직관러',
  '12th맨', '클럽러버', '서포터스', '응원불사조', '관중석터줏', '풀스타디움', '티켓헌터', '레전드팬',
]

const CRITERIA = [
  { key: 'score', label: '활동 점수', unit: '점' },
  { key: 'opinions', label: '의견 작성', unit: '건' },
  { key: 'comments', label: '댓글 작성', unit: '개' },
  { key: 'surveys', label: '설문 참여', unit: '회' },
  { key: 'empathy', label: '공감 받은 수', unit: '개' },
]

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function fanMetrics(key) {
  const h = hash(key)
  return {
    score: 380 + (h % 1500),
    opinions: 4 + ((h >> 3) % 64),
    comments: 8 + ((h >> 6) % 190),
    surveys: 1 + ((h >> 9) % 42),
    empathy: 18 + ((h >> 12) % 620),
    change: (h % 7) - 3, // -3 ~ +3
  }
}

const CRIT_KEY = { score: 'rank.critScore', opinions: 'rank.critOpinions', comments: 'rank.critComments', surveys: 'rank.critSurveys', empathy: 'rank.critEmpathy' }

// 1·2·3위 메달 색상 (금 / 은 / 동)
const MEDAL_COLORS = ['#E8B33D', '#A9B2BD', '#C77B45']

// my rank (mock) per scope
const MY = {
  league: { total: 12483, rank: 328, change: 5, score: 245, opinions: 18, comments: 64, surveys: 9, empathy: 320 },
  club: { total: 1428, rank: 15, change: 2, score: 245, opinions: 18, comments: 64, surveys: 9, empathy: 320 },
}

const WEEK_STATS = [
  { key: 'opinions', icon: 'opinions', label: '가장 많은 의견 작성', name: '블루윙', value: '32건' },
  { key: 'comments', icon: 'comments', label: '가장 많은 댓글', name: '레전드7', value: '128개' },
  { key: 'surveys', icon: 'surveys', label: '가장 많은 설문 참여', name: '서포터K', value: '19회' },
  { key: 'empathy', icon: 'empathy', label: '가장 많은 공감', name: '직관러', value: '540개' },
]
const SCORE_RULES = [
  { label: '의견 작성', points: '+10점' },
  { label: '댓글 작성', points: '+3점' },
  { label: '설문 참여', points: '+5점' },
  { label: '공감 받기', points: '+2점' },
]
const LEVELS = [
  { icon: 'rookie', name: 'Rookie Fan', min: 0 },
  { icon: 'active', name: 'Active Fan', min: 200 },
  { icon: 'super', name: 'Super Fan', min: 600 },
  { icon: 'legend', name: 'Legend Fan', min: 1200 },
]
const BADGES = [
  { icon: 'opinions', label: '첫 의견 작성', desc: '의견 1건 작성하기', done: true },
  { icon: 'comments', label: '댓글 10개 작성', desc: '댓글 10개 남기기', progress: 70 },
  { icon: 'surveys', label: '설문 5회 참여', desc: '설문 5회 참여하기', progress: 40 },
  { icon: 'empathy', label: '공감 50개 받기', desc: '내 의견에 공감 50개', progress: 24 },
]

function Change({ value }) {
  if (value > 0) return <span className="fr-chg up" title="상승">▲ {value}</span>
  if (value < 0) return <span className="fr-chg down" title="하락">▼ {Math.abs(value)}</span>
  return <span className="fr-chg same" title="변동 없음">—</span>
}

export default function FanRankingPage() {
  const NICKNAME = getCurrentUser()?.nickname || '팬'
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { lang, t } = useLang()
  const loading = useFakeLoading()
  const [scope, setScope] = useState('league') // 'league' | 'club'
  const [criteria, setCriteria] = useState('score')

  // build + sort the ranking for current scope/criteria
  const ranking = useMemo(() => {
    if (!team) return []
    const fans =
      scope === 'league'
        ? LEAGUE_NAMES.map((name, i) => ({ name, team: TEAMS[(i * 3 + 1) % TEAMS.length], ...fanMetrics(name) }))
        : CLUB_NAMES.map(name => ({ name, team, ...fanMetrics(name + team.id) }))
    return fans
      .slice()
      .sort((a, b) => b[criteria] - a[criteria])
      .map((f, i) => ({ ...f, rank: i + 1 }))
  }, [team, scope, criteria])

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

  const crit = CRITERIA.find(c => c.key === criteria)
  const fmt = v => v.toLocaleString()
  const mine = MY[scope]
  const myValue = mine[criteria]
  const scopeLabel = scope === 'league' ? t('rank.tabLeague') : t('rank.tabClub')
  const critLabel = t(CRIT_KEY[criteria])

  // my level (from activity score)
  let myLevelIdx = 0
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (mine.score >= LEVELS[i].min) { myLevelIdx = i; break }
  }
  const myLevel = LEVELS[myLevelIdx]
  const nextLevel = LEVELS[myLevelIdx + 1]
  const levelProgress = nextLevel
    ? Math.min(100, Math.round(((mine.score - myLevel.min) / (nextLevel.min - myLevel.min)) * 100))
    : 100
  const percentile = Math.max(1, Math.round((mine.rank / mine.total) * 100))

  const top3 = ranking.slice(0, 3)
  const rest = ranking.slice(3, 50)

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
            const active = item === '팬 랭킹'
            return (
              <a key={item} href="#" className={`ch-nav-item${active ? ' on' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={e => { e.preventDefault(); navigate(menuPath(item, team.id)) }}>{t(NAV_KEYS[item])}</a>
            )
          })}
        </nav>
      </header>

      {/* ── Main ── */}
      <main className="fr-main">
        {loading ? (
          <SkeletonList count={5} lines={1} />
        ) : !HAS_RANKING ? (
          <EmptyState icon={<RankIcon name="legend" size={30} />} title={t('empty.rankingTitle')} message={t('empty.rankingMsg')} />
        ) : (
        <>
        <section className="fr-pagehead">
          <h1>{t('rank.title')}</h1>
          <p>{t('rank.subtitle')}</p>
        </section>

        {/* Scope tabs */}
        <div className="fr-tabs" role="tablist" aria-label="랭킹 범위">
          <button role="tab" aria-selected={scope === 'league'}
            className={`fr-tab${scope === 'league' ? ' on' : ''}`} onClick={() => setScope('league')}>
            {t('rank.tabLeague')}
          </button>
          <button role="tab" aria-selected={scope === 'club'}
            className={`fr-tab${scope === 'club' ? ' on' : ''}`} onClick={() => setScope('club')}>
            {t('rank.tabClub')}
          </button>
        </div>

        {/* Criteria filter */}
        <div className="fr-criteria" role="group" aria-label="랭킹 기준">
          {CRITERIA.map(c => (
            <button key={c.key} className={`fr-crit${criteria === c.key ? ' on' : ''}`}
              onClick={() => setCriteria(c.key)}>{t(CRIT_KEY[c.key])}</button>
          ))}
        </div>

        <div className="fr-grid">
          {/* Left 70% */}
          <div className="fr-col-main">

            {/* TOP 3 */}
            <section className="fr-top3" aria-label="TOP 3">
              {[top3[1], top3[0], top3[2]].map(p => {
                if (!p) return null
                const center = p.rank === 1
                return (
                  <div key={p.rank} className={`fr-podium r${p.rank}${center ? ' first' : ''}`}>
                    <div className="fr-medal" aria-hidden="true">
                      <RankIcon name="medal" size={center ? 36 : 30} style={{ color: MEDAL_COLORS[p.rank - 1] }} />
                    </div>
                    <span className="fr-podium-avatar">{p.name[0]}</span>
                    <span className="fr-podium-name">{p.name}</span>
                    <span className="fr-podium-team">
                      <TeamEmblem color={p.team.color} size={16} /> {p.team.short}
                    </span>
                    <span className="fr-podium-score">{fmt(p[criteria])}<em>{crit.unit}</em></span>
                    <span className="fr-podium-rank">{p.rank}위 <Change value={p.change} /></span>
                  </div>
                )
              })}
            </section>

            {/* My rank */}
            <section className="fr-myrank">
              <div className="fr-myrank-head">
                <span className="fr-myrank-avatar">{NICKNAME[0]}</span>
                <div>
                  <span className="fr-myrank-name">{t('rank.myRank', { name: NICKNAME })}</span>
                  <span className="fr-myrank-level"><RankIcon name={myLevel.icon} size={15} /> {myLevel.name}</span>
                </div>
                <span className="fr-myrank-scope">{scopeLabel}</span>
              </div>
              <div className="fr-myrank-stats">
                <div className="fr-myrank-stat">
                  <span className="fr-myrank-value">{fmt(mine.rank)}<em>위</em></span>
                  <span className="fr-myrank-label">/ {fmt(mine.total)}명 중</span>
                </div>
                <div className="fr-myrank-stat">
                  <span className="fr-myrank-value">{fmt(myValue)}<em>{crit.unit}</em></span>
                  <span className="fr-myrank-label">{critLabel}</span>
                </div>
                <div className="fr-myrank-stat">
                  <span className="fr-myrank-value fr-myrank-chg"><Change value={mine.change} /></span>
                  <span className="fr-myrank-label">지난주 대비</span>
                </div>
              </div>
              <p className="fr-myrank-hint">
                현재 상위 <strong>{percentile}%</strong> 입니다. 의견을 하나 더 남기면 순위가 올라가요!
              </p>
              <div className="fr-myrank-bar"><span style={{ width: `${100 - percentile}%` }} /></div>
            </section>

            {/* Full ranking */}
            <section className="fr-panel">
              <div className="fr-panel-head">
                <h2 className="fr-panel-title">{scopeLabel} {t('rank.top50')}</h2>
                <span className="fr-week">{t('rank.criteriaBasis', { c: critLabel })}</span>
              </div>
              <ul className={`fr-list ${scope}`}>
                {rest.map(p => (
                  <li key={p.rank} className="fr-row">
                    <span className="fr-rank">{p.rank}</span>
                    <span className="fr-rowchg"><Change value={p.change} /></span>
                    <span className="fr-avatar">{p.name[0]}</span>
                    <span className="fr-name">{p.name}</span>
                    {scope === 'league' && (
                      <span className="fr-team"><TeamEmblem color={p.team.color} size={18} /> {teamName(p.team, lang)}</span>
                    )}
                    <span className="fr-score">{fmt(p[criteria])}{crit.unit}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Right 30% */}
          <aside className="fr-col-side">

            {/* Week stats */}
            <section className="fr-panel">
              <h2 className="fr-panel-title">{t('rank.weekActivity')}</h2>
              <div className="fr-weekstats">
                {WEEK_STATS.map(s => (
                  <div key={s.key} className="fr-weekstat">
                    <span className="fr-weekstat-icon" aria-hidden="true"><RankIcon name={s.icon} size={20} /></span>
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
              <h2 className="fr-panel-title">{t('rank.fanLevel')}</h2>
              <div className="fr-levels">
                {LEVELS.map((lv, i) => (
                  <div key={lv.name} className={`fr-level${i === myLevelIdx ? ' on' : ''}`}>
                    <span className="fr-level-emoji" aria-hidden="true"><RankIcon name={lv.icon} size={18} /></span>
                    <span className="fr-level-name">{lv.name}</span>
                    {i === myLevelIdx && <span className="fr-level-tag">현재</span>}
                  </div>
                ))}
              </div>
              {nextLevel && (
                <>
                  <div className="fr-level-bar"><span style={{ width: `${levelProgress}%` }} /></div>
                  <p className="fr-level-hint">다음 레벨 <strong><RankIcon name={nextLevel.icon} size={14} /> {nextLevel.name}</strong>까지 {levelProgress}%</p>
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
              <h2 className="fr-panel-title">{t('rank.badges')}</h2>
              <div className="fr-badges">
                {BADGES.map(b => (
                  <div key={b.label} className={`fr-badge${b.done ? ' done' : ''}`}>
                    <span className="fr-badge-icon" aria-hidden="true"><RankIcon name={b.icon} size={20} /></span>
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
              <p className="fr-cta-text">{t('rank.ctaText')}</p>
              <button className="fr-cta-btn primary" onClick={goWrite}><RankIcon name="opinions" size={16} /> {t('rank.ctaWrite')}</button>
              <button className="fr-cta-btn secondary" onClick={goSurvey}><RankIcon name="surveys" size={16} /> {t('rank.ctaSurvey')}</button>
            </section>
          </aside>
        </div>
        </>
        )}
      </main>
    </div>
  )
}
