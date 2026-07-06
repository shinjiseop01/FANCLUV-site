import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import { logout, getCurrentUser } from './lib/auth.js'
import { getTeam, teamName, TeamEmblem, menuPath } from './teams.jsx'
import { getClubLinks, CLUB_LINK_CHANNELS } from './clubLinks.js'
import Icon from './components/Icon.jsx'
import { getTeamNews } from './lib/news/teamNewsProvider.js'
import EmptyState from './components/EmptyState.jsx'
import { SkeletonList } from './components/Skeleton.jsx'
import './ClubHomePage.css'
import './TeamNewsPage.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']
const CATEGORIES = ['전체', '구단 공지', '경기', '선수', '인터뷰', '이적', '이벤트']

const KEYWORDS = ['#감독', '#이적', '#티켓', '#MD', '#응원가', '#유니폼', '#주장', '#멤버십']

export default function TeamNewsPage() {
  const NICKNAME = getCurrentUser()?.nickname || '팬'
  const { teamId, newsId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { lang, t } = useLang()
  const [searchParams, setSearchParams] = useSearchParams()
  const keyword = searchParams.get('keyword') || '' // 키워드 클릭/직접 접속 시 필터
  const [news, setNews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [category, setCategory] = useState('전체')
  const [sort, setSort] = useState('latest') // 'latest' | 'important'

  // 키워드 칩 클릭 → URL query 로 관련 뉴스만 필터 (다시 누르면 해제)
  const setKeyword = kw => {
    const clean = kw.replace(/^#/, '')
    if (clean === keyword) setSearchParams({}, { replace: true })
    else setSearchParams({ keyword: clean }, { replace: true })
  }

  // 구단 뉴스 로드 — Team News Provider(실제 Provider → Supabase/관리자 → Mock, 5분 캐시).
  useEffect(() => {
    if (!team) return
    let active = true
    setLoading(true); setError(false)
    getTeamNews(team.id)
      .then(l => { if (active) { setNews(l); setLoading(false) } })
      .catch(() => { if (active) { setNews([]); setError(true); setLoading(false) } })
    return () => { active = false }
  }, [teamId, team])

  // 뉴스 클릭: 외부(원본 URL 있음)는 새 탭, 관리자/내부 뉴스는 내부 상세로 이동.
  const openNews = n => {
    if (n.sourceUrl) window.open(n.sourceUrl, '_blank', 'noopener,noreferrer')
    else navigate(`/club/${team.id}/news/${n.id}`)
  }

  const list = useMemo(() => {
    let filtered = category === '전체' ? news : news.filter(n => n.category === category)
    const kw = keyword.trim().toLowerCase()
    if (kw) {
      filtered = filtered.filter(n =>
        (n.title + ' ' + (n.summary || '') + ' ' + (Array.isArray(n.body) ? n.body.join(' ') : n.body || '')).toLowerCase().includes(kw),
      )
    }
    const sorted = [...filtered]
    if (sort === 'important') sorted.sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0) || b.date.localeCompare(a.date))
    else sorted.sort((a, b) => b.date.localeCompare(a.date))
    return sorted
  }, [news, category, sort, keyword])

  const popular = useMemo(() => [...news].sort((a, b) => b.views - a.views).slice(0, 5), [news])

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>존재하지 않는 구단입니다.</p>
        <button onClick={() => navigate('/team-select')}>구단 다시 선택하기</button>
      </div>
    )
  }

  const themeStyle = { '--team': team.color, '--team-deep': team.colorDeep }
  const clubLinks = getClubLinks(team.id)
  const detail = newsId ? news.find(n => String(n.id) === String(newsId)) : null
  const goWrite = () => navigate(`/club/${team.id}/write`)
  const goSurvey = () => navigate(`/club/${team.id}/survey`)

  const hero = list[0]
  const rest = list.slice(1)

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
            const active = item === '팀 뉴스'
            return (
              <a key={item} href="#" className={`ch-nav-item${active ? ' on' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={e => { e.preventDefault(); navigate(menuPath(item, team.id)) }}>{t(NAV_KEYS[item])}</a>
            )
          })}
        </nav>
      </header>

      {/* ── Main ── */}
      <main className="tn-main">
        {detail ? (
          <NewsDetail news={detail} team={team} t={t} onBack={() => navigate(`/club/${team.id}/news`)}
            onWrite={goWrite} onSurvey={goSurvey} />
        ) : (
          <>
            <section className="tn-pagehead">
              <h1>{t('news.title')}</h1>
              <p>{t('news.subtitle')}</p>
            </section>

            <div className="tn-filterbar">
              <div className="tn-cats" role="group" aria-label="뉴스 카테고리">
                {CATEGORIES.map(c => (
                  <button key={c} className={`tn-cat${category === c ? ' on' : ''}`}
                    onClick={() => setCategory(c)}>{c}</button>
                ))}
              </div>
              <div className="tn-sorts" role="group" aria-label="정렬">
                <button className={`tn-sort${sort === 'latest' ? ' on' : ''}`}
                  onClick={() => setSort('latest')}>{t('news.sortLatest')}</button>
                <button className={`tn-sort${sort === 'important' ? ' on' : ''}`}
                  onClick={() => setSort('important')}>{t('news.sortImportant')}</button>
              </div>
            </div>

            {keyword && (
              <div className="tn-active-filter">
                <span>{t('news.filteredBy')}</span>
                <button type="button" className="tn-keyword-chip" onClick={() => setKeyword(keyword)}>
                  #{keyword} <span aria-hidden="true">✕</span>
                </button>
              </div>
            )}

            <div className="tn-grid">
              {/* Left */}
              <div className="tn-col-main">
                {loading ? (
                  <SkeletonList count={3} lines={2} />
                ) : error && news.length === 0 ? (
                  <EmptyState iconName="news" title={t('news.errorTitle')} message={t('news.errorMsg')} />
                ) : list.length === 0 ? (
                  keyword ? (
                    <EmptyState iconName="search" title={t('empty.searchTitle')} message={t('empty.searchMsg')} />
                  ) : (
                    <EmptyState iconName="news" title={t('empty.newsTitle')} message={t('empty.newsMsg')} />
                  )
                ) : (
                <>
                {hero && (
                  <article className="tn-hero" onClick={() => openNews(hero)}>
                    <Thumb team={team} category={hero.category} hero />
                    <div className="tn-hero-body">
                      <div className="tn-meta">
                        <span className="tn-cat-pill">{hero.category}</span>
                        <span className="tn-date">{hero.date}</span>
                        {hero.sourceUrl && <span className="tn-source"><Icon name="external" size={11} /> {hero.source}</span>}
                      </div>
                      <h2 className="tn-hero-title">{hero.title}</h2>
                      <p className="tn-hero-summary">{hero.summary}</p>
                      <div className="tn-reactions">
                        <span className="ic-txt"><Icon name="comment" size={13} /> 팬 의견 {hero.opinions}개</span>
                        <span className="ic-txt"><Icon name="chart" size={13} /> 설문 참여 {hero.survey}명</span>
                      </div>
                      <div className="tn-cta" onClick={e => e.stopPropagation()}>
                        <button className="tn-cta-btn primary" onClick={goWrite}>{t('news.ctaWrite')}</button>
                        <button className="tn-cta-btn secondary" onClick={goSurvey}>{t('news.ctaSurvey')}</button>
                      </div>
                    </div>
                  </article>
                )}

                <div className="tn-list">
                  {rest.map(n => (
                    <article key={n.id} className="tn-card" onClick={() => openNews(n)}>
                      <Thumb team={team} category={n.category} />
                      <div className="tn-card-body">
                        <div className="tn-meta">
                          <span className="tn-cat-pill">{n.category}</span>
                          <span className="tn-date">{n.date}</span>
                          {n.sourceUrl && <span className="tn-source"><Icon name="external" size={11} /> {n.source}</span>}
                        </div>
                        <h3 className="tn-card-title">{n.title}</h3>
                        <p className="tn-card-summary">{n.summary}</p>
                        <div className="tn-reactions">
                          <span className="ic-txt"><Icon name="comment" size={13} /> 팬 의견 {n.opinions}개</span>
                          <span className="ic-txt"><Icon name="chart" size={13} /> 설문 참여 {n.survey}명</span>
                        </div>
                        <div className="tn-cta" onClick={e => e.stopPropagation()}>
                          <button className="tn-cta-btn primary" onClick={goWrite}>{t('news.ctaWriteShort')}</button>
                          <button className="tn-cta-btn secondary" onClick={goSurvey}>{t('news.ctaSurveyShort')}</button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                </>
                )}
              </div>

              {/* Right */}
              <aside className="tn-side">
                <section className="tn-panel">
                  <h2 className="tn-panel-title">{t('news.popular')}</h2>
                  <ul className="tn-popular">
                    {popular.map((n, i) => (
                      <li key={n.id}>
                        <button className="tn-pop-item" onClick={() => openNews(n)}>
                          <span className="tn-pop-rank">{i + 1}</span>
                          <span className="tn-pop-text">
                            <span className="tn-pop-title">{n.title}</span>
                            <span className="tn-pop-views">조회 {n.views.toLocaleString()}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="tn-panel">
                  <h2 className="tn-panel-title">{t('news.keywords')}</h2>
                  <div className="tn-tags">
                    {KEYWORDS.map(k => {
                      const active = k.replace(/^#/, '') === keyword
                      return (
                        <button key={k} type="button"
                          className={`tn-tag${active ? ' on' : ''}`}
                          aria-pressed={active}
                          onClick={() => setKeyword(k)}>{k}</button>
                      )
                    })}
                  </div>
                </section>

                <section className="tn-panel">
                  <h2 className="tn-panel-title">{t('news.shortcuts')}</h2>
                  <div className="tn-shortcuts">
                    {CLUB_LINK_CHANNELS.map(ch => (
                      <a key={ch.key} href={clubLinks[ch.key]} target="_blank" rel="noopener noreferrer" className="tn-shortcut">
                        <span className="tn-shortcut-icon" aria-hidden="true"><Icon name={ch.icon} size={18} /></span>
                        <span>{t(ch.labelKey)}</span>
                        <span className="tn-shortcut-arrow" aria-hidden="true"><Icon name="external" size={14} /></span>
                      </a>
                    ))}
                  </div>
                </section>

                <section className="tn-panel tn-survey-card">
                  <h2 className="tn-panel-title">{t('news.ongoing')}</h2>
                  <span className="tn-survey-tag">참여 가능 · D-5</span>
                  <p className="tn-survey-name">2026 시즌 홈 경기장 시설 만족도 조사</p>
                  <button className="tn-survey-btn" onClick={goSurvey}>{t('news.ctaSurveyShort')}</button>
                </section>
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function Thumb({ team, category, hero }) {
  return (
    <div className={`tn-thumb${hero ? ' hero' : ''}`}>
      <TeamEmblem color={team.color} size={hero ? 72 : 44} className="tn-thumb-emblem" />
      <span className="tn-thumb-cat">{category}</span>
    </div>
  )
}

function NewsDetail({ news, team, t, onBack, onWrite, onSurvey }) {
  return (
    <article className="tn-detail">
      <button className="tn-back" onClick={onBack}>{t('news.backToList')}</button>
      <div className="tn-meta">
        <span className="tn-cat-pill">{news.category}</span>
        <span className="tn-date">{news.date}</span>
      </div>
      <h1 className="tn-detail-title">{news.title}</h1>
      <Thumb team={team} category={news.category} hero />
      <div className="tn-reactions tn-detail-reactions">
        <span className="ic-txt"><Icon name="comment" size={13} /> 팬 의견 {news.opinions}개</span>
        <span className="ic-txt"><Icon name="chart" size={13} /> 설문 참여 {news.survey}명</span>
        <span className="ic-txt"><Icon name="eye" size={13} /> 조회 {news.views.toLocaleString()}</span>
      </div>
      <div className="tn-detail-body">
        <p className="tn-lead">{news.summary}</p>
        {news.body.map((p, i) => <p key={i}>{p}</p>)}
      </div>
      <div className="tn-cta tn-detail-cta">
        <button className="tn-cta-btn primary" onClick={onWrite}>{t('news.ctaWrite')}</button>
        <button className="tn-cta-btn secondary" onClick={onSurvey}>{t('news.ctaSurvey')}</button>
      </div>
    </article>
  )
}
