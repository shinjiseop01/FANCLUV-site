import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import { logout, getCurrentUser } from './lib/auth.js'
import { getTeam, TeamEmblem, menuPath } from './teams.jsx'
import { listOpinions } from './lib/opinionsRepo.js'
import EmptyState from './components/EmptyState.jsx'
import { SkeletonList } from './components/Skeleton.jsx'
import Avatar from './components/Avatar.jsx'
import { relativeTime } from './lib/relativeTime.js'
import './ClubHomePage.css'
import './OpinionsPage.css'

const PAGE_SIZE = 5

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']
const CATEGORIES = ['전체', '경기장', '응원문화', '티켓', 'MD', '선수', '구단 운영', '이벤트', '기타']
const SORTS = ['최신순', '공감순', '댓글순']

export default function OpinionsPage() {
  const NICKNAME = getCurrentUser()?.nickname || '팬'
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { lang, t } = useLang()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('전체')
  const [sort, setSort] = useState('최신순')
  const [page, setPage] = useState(1)
  const [opinions, setOpinions] = useState([])
  const [loading, setLoading] = useState(true)

  // Reset pagination whenever the active filter/search/sort changes.
  useEffect(() => { setPage(1) }, [category, query, sort])

  // 구단별 의견 로드 — Supabase 설정 시 실제 데이터, 아니면 Mock (opinionsRepo).
  useEffect(() => {
    if (!team) return
    let active = true
    setLoading(true)
    listOpinions(team.id).then(list => {
      if (!active) return
      setOpinions(list)
      setLoading(false)
    })
    return () => { active = false }
  }, [teamId, team])

  const popularThreshold = useMemo(() => {
    const sorted = [...opinions].map(o => o.likes).sort((a, b) => b - a)
    return sorted[Math.min(1, sorted.length - 1)] ?? Infinity // top 2 are "popular"
  }, [opinions])

  const visible = useMemo(() => {
    let list = opinions
    if (category !== '전체') list = list.filter(o => o.category === category)
    const q = query.trim().toLowerCase()
    if (q) list = list.filter(o => (o.title + o.body).toLowerCase().includes(q))
    list = [...list]
    if (sort === '최신순') list.sort((a, b) => a.hours - b.hours)
    else if (sort === '공감순') list.sort((a, b) => b.likes - a.likes)
    else if (sort === '댓글순') list.sort((a, b) => b.comments - a.comments)
    return list
  }, [opinions, category, query, sort])

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>존재하지 않는 구단입니다.</p>
        <button onClick={() => navigate('/team-select')}>구단 다시 선택하기</button>
      </div>
    )
  }

  const themeStyle = { '--team': team.color, '--team-deep': team.colorDeep }
  const paged = visible.slice(0, page * PAGE_SIZE)
  const hasMore = paged.length < visible.length
  const filtersActive = category !== '전체' || query.trim() !== ''

  return (
    <div className="ch-root" style={themeStyle}>

      {/* ── Header (shared style) ── */}
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
          {MENU.map(item => {
            const active = item === '팬 의견'
            const isHome = item === '홈'
            return (
              <a key={item} href="#" className={`ch-nav-item${active ? ' on' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={e => { e.preventDefault(); navigate(menuPath(item, team.id)) }}>{t(NAV_KEYS[item])}</a>
            )
          })}
        </nav>
      </header>

      {/* ── Main ── */}
      <main className="op-main">
        <section className="op-title">
          <h1>{t('op.title')}</h1>
          <p>{t('op.subtitle')}</p>
        </section>

        {/* Search + category filter */}
        <div className="op-controls">
          <div className="op-search">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/><path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            <input
              type="search"
              placeholder={t('op.searchPh')}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="op-cats" role="group" aria-label="카테고리 필터">
            {CATEGORIES.map(c => (
              <button key={c}
                className={`op-cat${category === c ? ' on' : ''}`}
                onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="op-layout">
          {/* Left: list */}
          <div className="op-list-col">
            <div className="op-list-head">
              <span className="op-count">{t('op.count', { n: visible.length })}</span>
              <div className="op-sorts" role="group" aria-label="정렬">
                {SORTS.map(s => (
                  <button key={s}
                    className={`op-sort${sort === s ? ' on' : ''}`}
                    onClick={() => setSort(s)}>
                    {s === '최신순' ? t('op.sortLatest') : s === '공감순' ? t('op.sortAgreed') : t('op.sortCommented')}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <SkeletonList count={4} lines={2} />
            ) : visible.length === 0 ? (
              filtersActive ? (
                <EmptyState
                  icon="🔍"
                  title={t('empty.searchTitle')}
                  message={t('empty.searchMsg')}
                />
              ) : (
                <EmptyState
                  icon="💬"
                  title={t('empty.opinionsTitle')}
                  message={t('empty.opinionsMsg')}
                  ctaLabel={t('empty.opinionsCta')}
                  onCta={() => navigate(`/club/${team.id}/write`)}
                />
              )
            ) : (
              <>
                <div className="op-feed">
                  {paged.map(o => {
                    const popular = o.likes >= popularThreshold
                    const isNew = o.hours <= 6
                    return (
                      <article
                        key={o.id}
                        className="op-feed-item"
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/club/${team.id}/opinions/${o.id}`)}
                        onKeyDown={e => { if (e.key === 'Enter') navigate(`/club/${team.id}/opinions/${o.id}`) }}
                      >
                        <div className="op-item-head">
                          <Avatar name={o.author} size={28} />
                          <span className="op-author">{o.author}</span>
                          <span className="op-dot-sep" aria-hidden="true">·</span>
                          <span className="op-time">{relativeTime(o.hours, lang)}</span>
                          <span className="op-cat-pill">{o.category}</span>
                          <Stars rating={o.rating} />
                        </div>

                        {(popular || isNew) && (
                          <div className="op-badges">
                            {popular && <span className="op-badge op-badge-hot">{t('op.badgePopular')}</span>}
                            {isNew && <span className="op-badge op-badge-new">{t('op.badgeNew')}</span>}
                          </div>
                        )}

                        <h3 className="op-item-title">{o.title}</h3>
                        <p className="op-item-body">{o.body}</p>
                        <div className="op-item-foot">
                          <span className="op-foot-stat">♥ {t('op.agree')} {o.likes}</span>
                          <span className="op-foot-stat">💬 {t('op.comment')} {o.comments}</span>
                        </div>
                      </article>
                    )
                  })}
                </div>
                {hasMore && (
                  <button className="op-loadmore" onClick={() => setPage(p => p + 1)}>
                    {t('common.loadMore')}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Right: sidebar */}
          <aside className="op-side">
            <section className="op-panel">
              <h2 className="op-panel-title">{t('op.sideOngoing')}</h2>
              <div className="op-survey">
                <span className="op-survey-tag">{t('survey.tag')}</span>
                <p className="op-survey-name">{t('op.surveyName')}</p>
                <p className="op-survey-desc">{t('op.surveyDesc')}</p>
                <button className="op-survey-btn" onClick={() => navigate(`/club/${team.id}/survey`)}>{t('op.joinSurvey')}</button>
              </div>
            </section>

            <section className="op-panel">
              <h2 className="op-panel-title">{t('op.sidePopularCat')}</h2>
              <ul className="op-side-cats">
                <li><span className="op-dot" />경기장<em>320</em></li>
                <li><span className="op-dot" />응원문화<em>254</em></li>
                <li><span className="op-dot" />티켓<em>188</em></li>
                <li><span className="op-dot" />선수<em>142</em></li>
                <li><span className="op-dot" />구단 운영<em>121</em></li>
              </ul>
            </section>

            <section className="op-panel">
              <h2 className="op-panel-title">{t('op.sideKeywords')}</h2>
              <div className="op-tags">
                {['#티켓', '#응원가', '#MD', '#경기장', '#유니폼', '#선수', '#원정', '#시즌권'].map(t => (
                  <span key={t} className="op-tag">{t}</span>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </main>

      {/* Floating write button */}
      <button className="ch-fab" aria-label={t('op.fab')} onClick={() => navigate(`/club/${team.id}/write`)}>
        <span className="op-fab-emoji" aria-hidden="true">✏️</span>
        <span>{t('op.fab')}</span>
      </button>
    </div>
  )
}

function Stars({ rating }) {
  return (
    <span className="op-stars" aria-label={`만족도 ${rating}점`}>
      {[1, 2, 3, 4, 5].map(n => (
        <svg key={n} viewBox="0 0 20 20" className={n <= rating ? 'on' : ''} aria-hidden="true">
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 15l-5.2 2.6 1-5.8L1.5 7.7l5.9-.9z" />
        </svg>
      ))}
    </span>
  )
}
