import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import { logout, getCurrentUser } from './lib/auth.js'
import { getTeam, TeamEmblem, menuPath } from './teams.jsx'
import { getCreatedOpinions } from './opinionStore.js'
import './ClubHomePage.css'
import './OpinionsPage.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']
const CATEGORIES = ['전체', '경기장', '응원문화', '티켓', 'MD', '선수', '구단 운영', '이벤트', '기타']
const SORTS = ['최신순', '공감순', '댓글순']

// Base opinion pool — phrased to fit any club. Per-club numbers are derived from a seed.
const BASE_OPINIONS = [
  { author: '블루윙', category: '경기장', rating: 4, hours: 2,
    title: '홈 경기장 좌석 시야 개선이 필요합니다',
    body: 'N석 일부 구역은 광고판에 가려 골대가 잘 보이지 않습니다. 시야 방해 좌석은 예매 시 미리 안내해주면 좋겠어요.' },
  { author: '직관러', category: '응원문화', rating: 5, hours: 5,
    title: '원정 응원 분위기가 정말 최고였습니다',
    body: '지난 원정에서 서포터즈 응원이 끝까지 이어져 선수들에게 큰 힘이 됐을 것 같아요. 이런 문화가 계속 이어지길 바랍니다.' },
  { author: '시즌권홀더', category: '티켓', rating: 3, hours: 9,
    title: '티켓 예매 페이지 안정성 개선 요청',
    body: '인기 경기 예매 오픈 직후 페이지가 자주 멈춥니다. 대기열 시스템 도입을 진지하게 검토해주셨으면 합니다.' },
  { author: '굿즈수집가', category: 'MD', rating: 4, hours: 14,
    title: '신규 유니폼 디자인 만족도가 높아요',
    body: '이번 시즌 홈 유니폼 색감과 디테일이 훌륭합니다. 다만 사이즈별 재고가 빨리 소진돼 재입고 주기가 빨라지면 좋겠어요.' },
  { author: '응원단장', category: '선수', rating: 5, hours: 20,
    title: '유소년 출신 선수 출전 기회 확대 희망',
    body: '아카데미에서 성장한 선수들이 1군에서 뛰는 모습을 더 보고 싶습니다. 장기적으로 구단 색깔을 만드는 길이라 생각해요.' },
  { author: '풋볼러버', category: '구단 운영', rating: 4, hours: 28,
    title: '팬 소통 간담회를 정례화해 주세요',
    body: '구단의 방향성을 팬들과 직접 공유하는 자리가 분기마다 있으면 신뢰가 더 쌓일 것 같습니다. 온라인 병행도 환영합니다.' },
  { author: '홈경기지킴이', category: '이벤트', rating: 4, hours: 33,
    title: '가족 단위 관중을 위한 이벤트가 늘었으면',
    body: '아이와 함께 오는 팬들이 많아졌는데, 경기 전 체험 부스나 포토존이 더 다양해지면 좋겠습니다.' },
  { author: '평일직관', category: '경기장', rating: 3, hours: 41,
    title: '경기장 먹거리 줄이 너무 깁니다',
    body: '하프타임에 매점 줄이 길어 후반 시작을 놓칠 때가 많아요. 키오스크나 모바일 주문을 도입하면 좋겠습니다.' },
  { author: '레전드7', category: '기타', rating: 4, hours: 52,
    title: '대중교통 막차 시간 연계 안내 부탁',
    body: '야간 경기 후 대중교통 이용 정보가 한곳에 정리돼 있으면 편할 것 같아요. 셔틀 운영 확대도 검토 부탁드립니다.' },
]

function seedOf(id) {
  return id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
}

function timeLabel(hours) {
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

export default function OpinionsPage() {
  const NICKNAME = getCurrentUser()?.nickname || '팬'
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { lang, setLang, t } = useLang()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('전체')
  const [sort, setSort] = useState('최신순')

  const opinions = useMemo(() => {
    if (!team) return []
    const seed = seedOf(team.id)
    const base = BASE_OPINIONS.map((o, i) => {
      const likes = 40 + ((seed * (i + 3)) % 320)
      const comments = 4 + ((seed * (i + 7)) % 46)
      return { ...o, id: i + 1, likes, comments }
    })
    // fan-created opinions show first (newest at the very top)
    return [...getCreatedOpinions(team.id), ...base]
  }, [team])

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
            <span className="ch-user">{NICKNAME}{t('common.honorific')}</span>
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

            {visible.length === 0 ? (
              <div className="op-empty">검색 결과가 없습니다.</div>
            ) : (
              <div className="op-feed">
                {visible.map(o => {
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
                        <span className="op-avatar" aria-hidden="true">{o.author[0]}</span>
                        <span className="op-author">{o.author}</span>
                        <span className="op-dot-sep" aria-hidden="true">·</span>
                        <span className="op-time">{timeLabel(o.hours)}</span>
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
