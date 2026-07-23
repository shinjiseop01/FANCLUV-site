import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import { logout, getCurrentUser } from './lib/auth.js'
import { getTeam, teamName, TeamEmblem, menuPath } from './teams.jsx'
import { getClubLinks, CLUB_LINK_CHANNELS } from './clubLinks.js'
import Icon from './components/Icon.jsx'
import { getTeamNews } from './lib/news/teamNewsProvider.js'
import { incrementNewsView } from './lib/newsRepo.js'
import { getHomeContent, refreshHome } from './lib/homeRepo.js'
import { listSurveys } from './lib/surveysRepo.js'
import { subscribeChanges } from './lib/realtime.js'
import { getNewsSource } from './lib/news/newsSources.js'
import { isSupabaseConfigured } from './lib/supabase.js'
import DemoBadge from './components/DemoBadge.jsx'
import NewsSummaryCard from './components/news/NewsSummaryCard.jsx'
import EmptyState from './components/EmptyState.jsx'
import Pagination from './components/Pagination.jsx'
import { SkeletonList } from './components/Skeleton.jsx'
import LazyImage from './components/LazyImage.jsx'
import './ClubHomePage.css'
import './TeamNewsPage.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']
const CATEGORIES = ['전체', '구단 공지', '경기', '선수', '인터뷰', '이적', '이벤트']

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
  const [openId, setOpenId] = useState(null) // AI 요약이 펼쳐진 뉴스 id (카드 내 확장, 페이지 이동 없음)
  const [keywords, setKeywords] = useState([]) // 실 의견 기반 키워드
  const [ongoing, setOngoing] = useState(null) // 진행 중(종료 임박) 실제 설문
  const [newsPage, setNewsPage] = useState(1) // 뉴스 목록 페이지(10개/페이지)

  // 필터/검색/정렬 변경 시 뉴스 페이지 초기화.
  useEffect(() => { setNewsPage(1) }, [category, keyword, sort])

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
    // 사이드바(키워드·진행 중 설문) 실데이터 + Realtime
    const loadSide = () => {
      refreshHome(team.id)
      getHomeContent(team.id).then(c => { if (active) setKeywords(c.trendingKeywords || []) })
      listSurveys(team.id).then(list => {
        if (!active) return
        const open = (list || []).filter(s => s.status === 'published').sort((a, b) => a.dday - b.dday)
        setOngoing(open[0] || null)
      })
    }
    loadSide()
    const unsub = subscribeChanges(['opinions', 'likes', 'comments', 'surveys', 'survey_responses'], loadSide)
    return () => { active = false; unsub && unsub() }
  }, [teamId, team])

  // 뉴스 클릭: 항상 FANCLUV 내부 뉴스 상세로 이동(원문은 상세의 "원문 보기" 링크로).
  const openNews = n => navigate(`/club/${team.id}/news/${n.id}`)

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

  // 인기 뉴스: 실제 조회수(view_count, news_increment_view 누적) 기준 → 동률이면 최신순.
  const popular = useMemo(() => [...news]
    .sort((a, b) => ((b.views || 0) - (a.views || 0)) || (String(b.publishedAt || b.date).localeCompare(String(a.publishedAt || a.date))))
    .slice(0, 5), [news])

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
  // 공식 뉴스 페이지 URL — 실 크롤링이 CORS 로 막혀도 항상 새 탭 링크로 이동 가능.
  const officialNewsUrl = getNewsSource(team.id)?.newsUrl || clubLinks.home
  const openOfficialNews = () => window.open(officialNewsUrl, '_blank', 'noopener,noreferrer')
  const detail = newsId ? news.find(n => String(n.id) === String(newsId)) : null
  const goWrite = () => navigate(`/club/${team.id}/write`)
  const goSurvey = () => navigate(`/club/${team.id}/survey`)

  // 목록 페이지네이션(10개/페이지). 1페이지는 hero(대형)+나머지 카드, 이후는 카드만.
  const NEWS_PER = 10
  const newsTotalPages = Math.max(1, Math.ceil(list.length / NEWS_PER))
  const newsCur = Math.min(newsPage, newsTotalPages)
  const pageItems = list.slice((newsCur - 1) * NEWS_PER, newsCur * NEWS_PER)
  const hero = newsCur === 1 ? pageItems[0] : null
  const rest = newsCur === 1 ? pageItems.slice(1) : pageItems

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
            <button className="ch-logout" onClick={() => { logout(); navigate('/', { replace: true }) }}>{t('common.logout')}</button>
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
              <h1>{t('news.title')} {!isSupabaseConfigured && <DemoBadge />}</h1>
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
                  #{keyword} <Icon name="close" size={12} />
                </button>
              </div>
            )}

            <div className="tn-grid">
              {/* Left */}
              <div className="tn-col-main">
                {loading ? (
                  <SkeletonList count={3} lines={2} />
                ) : error && news.length === 0 ? (
                  <EmptyState iconName="news" title={t('news.errorTitle')} message={t('news.errorMsg')}
                    ctaLabel={t('news.officialCta')} onCta={openOfficialNews} />
                ) : list.length === 0 ? (
                  keyword ? (
                    <EmptyState iconName="search" title={t('empty.searchTitle')} message={t('empty.searchMsg')} />
                  ) : (
                    <EmptyState iconName="news" title={t('empty.newsTitle')} message={t('empty.newsMsg')}
                      ctaLabel={t('news.officialCta')} onCta={openOfficialNews} />
                  )
                ) : (
                <>
                {hero && (
                  <article className="tn-hero" onClick={() => openNews(hero)}>
                    <Thumb team={team} category={hero.category} imageUrl={hero.imageUrl} hero />
                    <div className="tn-hero-body">
                      <div className="tn-meta">
                        <span className="tn-cat-pill">{hero.category}</span>
                        <span className="tn-date">{hero.date}</span>
                        {hero.sourceUrl && <span className="tn-source"><Icon name="external" size={11} /> {hero.source}</span>}
                      </div>
                      <h2 className="tn-hero-title">{hero.title}</h2>
                      <p className="tn-hero-summary">{hero.summary}</p>
                      <AiSummarySection item={hero} teamId={team.id} open={openId === hero.id} onToggle={setOpenId} t={t} />
                    </div>
                  </article>
                )}

                <div className="tn-list">
                  {rest.map(n => (
                    <article key={n.id} className="tn-card" onClick={() => openNews(n)}>
                      <Thumb team={team} category={n.category} imageUrl={n.imageUrl} />
                      <div className="tn-card-body">
                        <div className="tn-meta">
                          <span className="tn-cat-pill">{n.category}</span>
                          <span className="tn-date">{n.date}</span>
                          {n.sourceUrl && <span className="tn-source"><Icon name="external" size={11} /> {n.source}</span>}
                        </div>
                        <h3 className="tn-card-title">{n.title}</h3>
                        <p className="tn-card-summary">{n.summary}</p>
                        <AiSummarySection item={n} teamId={team.id} open={openId === n.id} onToggle={setOpenId} t={t} />
                      </div>
                    </article>
                  ))}
                </div>
                <Pagination page={newsCur} total={newsTotalPages} onChange={p => { setNewsPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
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
                            <span className="tn-pop-views">{n.date}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="tn-panel">
                  <h2 className="tn-panel-title">{t('news.keywords')}</h2>
                  {keywords.length === 0 ? (
                    <p className="op-side-empty">{t('home.topicsEmpty')}</p>
                  ) : (
                    <div className="tn-tags">
                      {keywords.map(k => {
                        const active = k.tag === keyword
                        return (
                          <button key={k.tag} type="button"
                            className={`tn-tag${active ? ' on' : ''}`}
                            aria-pressed={active}
                            onClick={() => setKeyword(k.tag)}>#{k.tag}</button>
                        )
                      })}
                    </div>
                  )}
                </section>

                <section className="tn-panel">
                  <h2 className="tn-panel-title">{t('news.shortcuts')}</h2>
                  <div className="tn-shortcuts">
                    <a href={officialNewsUrl} target="_blank" rel="noopener noreferrer" className="tn-shortcut">
                      <span className="tn-shortcut-icon" aria-hidden="true"><Icon name="news" size={18} /></span>
                      <span>{t('news.officialShortcut')}</span>
                      <span className="tn-shortcut-arrow" aria-hidden="true"><Icon name="external" size={14} /></span>
                    </a>
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
                  {ongoing ? (
                    <>
                      <span className="tn-survey-tag">{t('survey.statusOpen')}{ongoing.dday != null ? ` · ${ongoing.dday === 0 ? 'D-DAY' : `D-${ongoing.dday}`}` : ''}</span>
                      <p className="tn-survey-name">{ongoing.title}</p>
                      <button className="tn-survey-btn" onClick={() => navigate(`/club/${team.id}/survey/${ongoing.id}`)}>{t('news.ctaSurveyShort')}</button>
                    </>
                  ) : (
                    <p className="op-side-empty">{t('home.surveyEmpty')}</p>
                  )}
                </section>
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

// 뉴스 카드 하단 — 단일 "AI 뉴스 요약" 버튼 + 카드 내부에서 펼쳐지는 요약(페이지 이동 없음).
function AiSummarySection({ item, teamId, open, onToggle, t }) {
  return (
    <div className="tn-ai-region" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        className={`tn-ai-btn${open ? ' open' : ''}`}
        aria-expanded={open}
        onClick={() => onToggle(prev => (prev === item.id ? null : item.id))}
      >
        <Icon name="sparkle" size={16} className="tn-ai-spark" /> {t('news.aiSummary')}
      </button>
      <div className={`tn-ai-expand${open ? ' open' : ''}`}>
        <div className="tn-ai-expand-inner">
          <NewsSummaryCard item={item} teamId={teamId} open={open} onClose={() => onToggle(null)} />
        </div>
      </div>
    </div>
  )
}

function Thumb({ team, category, hero, imageUrl }) {
  const emblem = <TeamEmblem color={team.color} size={hero ? 72 : 44} className="tn-thumb-emblem" />
  return (
    <div className={`tn-thumb${hero ? ' hero' : ''}`}>
      {/* 외부 뉴스 이미지가 있으면 지연 로딩(실패 시 구단 엠블럼으로 폴백), 없으면 엠블럼. */}
      {imageUrl
        ? <LazyImage src={imageUrl} alt="" className="tn-thumb-img" placeholder={emblem} />
        : emblem}
      <span className="tn-thumb-cat">{category}</span>
    </div>
  )
}

function NewsDetail({ news, team, t, onBack, onWrite, onSurvey }) {
  const [aiOpen, setAiOpen] = useState(true) // 상세에서는 AI 요약을 기본 펼침
  // 상세 진입 시 조회수 +1 (인기 뉴스 실데이터의 근거. race-safe: 서버 RPC 원자 증가)
  useEffect(() => { if (news?.id) incrementNewsView(news.id) }, [news?.id])
  // 본문은 저장 시점에 plain text 문단으로 정규화되어 있어(수집기에서 태그 제거)
  // innerHTML 없이 <p> 렌더만 사용한다(XSS 원천 차단).
  const paras = (news.body || []).filter(p => p !== news.summary) // lead(요약)와 중복 문단 제거
  return (
    <article className="tn-detail">
      <button className="tn-back" onClick={onBack}>{t('news.backToList')}</button>
      <div className="tn-meta">
        <span className="tn-cat-pill">{news.category}</span>
        <span className="tn-date">{news.date}</span>
        {news.source && news.source !== 'FANCLUV' && <span className="tn-source">{news.source}</span>}
      </div>
      <h1 className="tn-detail-title">{news.title}</h1>
      <Thumb team={team} category={news.category} imageUrl={news.imageUrl} hero />
      <div className="tn-detail-body">
        {news.summary && <p className="tn-lead">{news.summary}</p>}
        {paras.map((p, i) => <p key={i}>{p}</p>)}
      </div>

      {/* ✨ AI 뉴스 요약 — 핵심 내용 + 핵심 키워드 (캐시 재사용, 실패 시 본문은 그대로) */}
      <AiSummarySection item={news} teamId={team.id} open={aiOpen} onToggle={() => setAiOpen(v => !v)} t={t} />

      {/* 원문 보기 ↗ — 수집 뉴스만(관리자 작성 뉴스는 원문 없음) */}
      {news.sourceUrl && (
        <a className="tn-original-link" href={news.sourceUrl} target="_blank" rel="noopener noreferrer">
          {t('news.viewOriginal')} <Icon name="external" size={13} />
        </a>
      )}

      <div className="tn-cta tn-detail-cta">
        <button className="tn-cta-btn primary" onClick={onWrite}>{t('news.ctaWrite')}</button>
        <button className="tn-cta-btn secondary" onClick={onSurvey}>{t('news.ctaSurvey')}</button>
      </div>
    </article>
  )
}
