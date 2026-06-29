import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getTeam, TeamEmblem, menuPath } from './teams.jsx'
import './ClubHomePage.css'
import './TeamNewsPage.css'

const NICKNAME = '민준'
const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']
const CATEGORIES = ['전체', '구단 공지', '경기', '선수', '인터뷰', '이적', '이벤트']

const NEWS = [
  { id: 1, category: '구단 공지', date: '2026.07.01', views: 12840, opinions: 124, survey: 538,
    title: '구단, 2026 시즌 하반기 멤버십 혜택 개편 발표',
    summary: '하반기부터 멤버십 등급별 혜택이 확대됩니다. 홈경기 우선 예매와 굿즈 할인 폭이 커집니다.',
    body: ['구단이 2026 시즌 하반기를 맞아 팬 멤버십 혜택을 대폭 개편한다고 발표했습니다. 이번 개편의 핵심은 홈경기 우선 예매 권한 확대와 공식 굿즈 할인율 상향입니다.',
      '특히 시즌권 회원에게는 원정 경기 단체 이동 우선 신청권이 새롭게 부여됩니다. 구단은 "팬들의 의견을 적극 반영한 결과"라고 밝혔습니다.',
      '여러분은 이번 혜택 개편을 어떻게 생각하시나요? 의견을 남기고 설문에 참여해 주세요.'] },
  { id: 2, category: '경기', date: '2026.06.29', views: 9320, opinions: 88, survey: 401,
    title: '주말 홈경기, 후반 추가시간 결승골로 짜릿한 승리',
    summary: '치열했던 라이벌전에서 후반 추가시간 결승골이 터지며 값진 3점을 챙겼습니다.',
    body: ['주말 홈경기에서 후반 추가시간에 터진 극적인 결승골로 소중한 승점 3점을 획득했습니다. 경기장을 가득 메운 홈 팬들의 응원이 큰 힘이 됐습니다.',
      '감독은 경기 후 인터뷰에서 "끝까지 포기하지 않은 선수들이 자랑스럽다"고 전했습니다.'] },
  { id: 3, category: '선수', date: '2026.06.27', views: 7610, opinions: 65, survey: 287,
    title: '주장, 리그 통산 100호 골 달성… 구단 레전드 반열에',
    summary: '주장이 리그 통산 100호 골을 기록하며 구단 역사에 새로운 이정표를 세웠습니다.',
    body: ['팀의 주장이 리그 통산 100호 골이라는 대기록을 달성했습니다. 데뷔 이후 한 팀에서만 쌓아 올린 의미 있는 기록입니다.',
      '팬들은 SNS를 통해 축하 메시지를 쏟아내고 있습니다.'] },
  { id: 4, category: '인터뷰', date: '2026.06.24', views: 5480, opinions: 52, survey: 198,
    title: '[인터뷰] 신임 감독 "팬과 함께 만드는 축구가 목표"',
    summary: '신임 감독이 취임 후 첫 공식 인터뷰에서 팬 소통과 공격적인 축구 철학을 강조했습니다.',
    body: ['신임 감독이 취임 후 첫 인터뷰를 가졌습니다. 그는 "팬과 함께 만들어가는 축구"를 핵심 가치로 내세웠습니다.',
      '또한 유소년 선수 육성과 공격적인 경기 운영에 대한 구상도 함께 밝혔습니다.'] },
  { id: 5, category: '이적', date: '2026.06.21', views: 14200, opinions: 211, survey: 642,
    title: '여름 이적시장, 측면 공격수 영입 임박 보도',
    summary: '여름 이적시장을 맞아 측면 공격 보강을 위한 영입 협상이 막바지에 이르렀다는 보도가 나왔습니다.',
    body: ['여름 이적시장에서 측면 공격수 영입이 임박했다는 보도가 이어지고 있습니다. 구단은 공식 입장을 아직 내놓지 않았습니다.',
      '팬들 사이에서는 기대와 우려가 교차하고 있습니다. 여러분의 생각은 어떠신가요?'] },
  { id: 6, category: '이벤트', date: '2026.06.18', views: 4310, opinions: 39, survey: 156,
    title: '홈경기 가족의 날, 다양한 팬 참여 부스 운영',
    summary: '다가오는 홈경기를 가족의 날로 운영합니다. 포토존, 키즈존, 굿즈 체험 부스가 마련됩니다.',
    body: ['다가오는 홈경기를 "가족의 날"로 운영합니다. 경기 시작 2시간 전부터 다양한 팬 참여 부스가 열립니다.',
      '포토존, 키즈존, 굿즈 체험 부스 등이 마련되어 온 가족이 즐길 수 있습니다.'] },
  { id: 7, category: '구단 공지', date: '2026.06.15', views: 3980, opinions: 28, survey: 132,
    title: '공식 온라인 스토어 리뉴얼 오픈 안내',
    summary: '공식 온라인 스토어가 새 단장을 마치고 오픈했습니다. 신규 시즌 한정 굿즈도 함께 공개됩니다.',
    body: ['공식 온라인 스토어가 리뉴얼 오픈했습니다. 상품 검색과 결제 과정이 한층 편리해졌습니다.',
      '오픈 기념 시즌 한정 굿즈도 함께 공개되었습니다.'] },
]

const POPULAR = [...NEWS].sort((a, b) => b.views - a.views).slice(0, 5)
const KEYWORDS = ['#감독', '#이적', '#티켓', '#MD', '#응원가', '#유니폼', '#주장', '#멤버십']

const SHORTCUTS = [
  { key: 'home', icon: '🌐', label: '공식 홈페이지', url: 'https://www.kleague.com' },
  { key: 'ticket', icon: '🎫', label: '티켓 예매', url: 'https://www.ticketlink.co.kr' },
  { key: 'instagram', icon: '📸', label: 'Instagram', url: 'https://www.instagram.com' },
  { key: 'youtube', icon: '▶', label: 'YouTube', url: 'https://www.youtube.com' },
  { key: 'x', icon: '𝕏', label: 'X (Twitter)', url: 'https://x.com' },
]

export default function TeamNewsPage() {
  const { teamId, newsId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const [lang, setLang] = useState('ko')
  const [category, setCategory] = useState('전체')

  const list = useMemo(
    () => (category === '전체' ? NEWS : NEWS.filter(n => n.category === category)),
    [category]
  )

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>존재하지 않는 구단입니다.</p>
        <button onClick={() => navigate('/team-select')}>구단 다시 선택하기</button>
      </div>
    )
  }

  const themeStyle = { '--team': team.color, '--team-deep': team.colorDeep }
  const detail = newsId ? NEWS.find(n => n.id === Number(newsId)) : null
  const goWrite = () => navigate(`/club/${team.id}/write`)
  const goSurvey = () => navigate(`/club/${team.id}/survey`)

  const hero = list[0]
  const rest = list.slice(1)

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
            const active = item === '팀 뉴스'
            return (
              <a key={item} href="#" className={`ch-nav-item${active ? ' on' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={e => { e.preventDefault(); navigate(menuPath(item, team.id)) }}>
                {item}
              </a>
            )
          })}
        </nav>
      </header>

      {/* ── Main ── */}
      <main className="tn-main">
        {detail ? (
          <NewsDetail news={detail} team={team} onBack={() => navigate(`/club/${team.id}/news`)}
            onWrite={goWrite} onSurvey={goSurvey} />
        ) : (
          <>
            <section className="tn-pagehead">
              <h1>팀 뉴스</h1>
              <p>응원하는 구단의 최신 소식을 확인하고 여러분의 의견을 남겨보세요.</p>
            </section>

            <div className="tn-cats" role="group" aria-label="뉴스 카테고리">
              {CATEGORIES.map(c => (
                <button key={c} className={`tn-cat${category === c ? ' on' : ''}`}
                  onClick={() => setCategory(c)}>{c}</button>
              ))}
            </div>

            <div className="tn-grid">
              {/* Left */}
              <div className="tn-col-main">
                {hero && (
                  <article className="tn-hero" onClick={() => navigate(`/club/${team.id}/news/${hero.id}`)}>
                    <Thumb team={team} category={hero.category} hero />
                    <div className="tn-hero-body">
                      <div className="tn-meta">
                        <span className="tn-cat-pill">{hero.category}</span>
                        <span className="tn-date">{hero.date}</span>
                      </div>
                      <h2 className="tn-hero-title">{hero.title}</h2>
                      <p className="tn-hero-summary">{hero.summary}</p>
                      <div className="tn-reactions">
                        <span>💬 팬 의견 {hero.opinions}개</span>
                        <span>📊 설문 참여 {hero.survey}명</span>
                      </div>
                      <div className="tn-cta" onClick={e => e.stopPropagation()}>
                        <button className="tn-cta-btn primary" onClick={goWrite}>📝 이 뉴스에 의견 남기기</button>
                        <button className="tn-cta-btn secondary" onClick={goSurvey}>📊 관련 설문 참여하기</button>
                      </div>
                    </div>
                  </article>
                )}

                <div className="tn-list">
                  {rest.map(n => (
                    <article key={n.id} className="tn-card" onClick={() => navigate(`/club/${team.id}/news/${n.id}`)}>
                      <Thumb team={team} category={n.category} />
                      <div className="tn-card-body">
                        <div className="tn-meta">
                          <span className="tn-cat-pill">{n.category}</span>
                          <span className="tn-date">{n.date}</span>
                        </div>
                        <h3 className="tn-card-title">{n.title}</h3>
                        <p className="tn-card-summary">{n.summary}</p>
                        <div className="tn-reactions">
                          <span>💬 팬 의견 {n.opinions}개</span>
                          <span>📊 설문 참여 {n.survey}명</span>
                        </div>
                        <div className="tn-cta" onClick={e => e.stopPropagation()}>
                          <button className="tn-cta-btn primary" onClick={goWrite}>📝 의견 남기기</button>
                          <button className="tn-cta-btn secondary" onClick={goSurvey}>📊 설문 참여하기</button>
                        </div>
                      </div>
                    </article>
                  ))}
                  {list.length === 0 && <div className="tn-empty">해당 카테고리의 뉴스가 없습니다.</div>}
                </div>
              </div>

              {/* Right */}
              <aside className="tn-side">
                <section className="tn-panel">
                  <h2 className="tn-panel-title">인기 뉴스</h2>
                  <ul className="tn-popular">
                    {POPULAR.map((n, i) => (
                      <li key={n.id}>
                        <button className="tn-pop-item" onClick={() => navigate(`/club/${team.id}/news/${n.id}`)}>
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
                  <h2 className="tn-panel-title">많이 언급되는 키워드</h2>
                  <div className="tn-tags">
                    {KEYWORDS.map(k => <span key={k} className="tn-tag">{k}</span>)}
                  </div>
                </section>

                <section className="tn-panel">
                  <h2 className="tn-panel-title">구단 바로가기</h2>
                  <div className="tn-shortcuts">
                    {SHORTCUTS.map(s => (
                      <a key={s.key} href={s.url} target="_blank" rel="noopener noreferrer" className="tn-shortcut">
                        <span className="tn-shortcut-icon" aria-hidden="true">{s.icon}</span>
                        <span>{s.label}</span>
                        <span className="tn-shortcut-arrow" aria-hidden="true">↗</span>
                      </a>
                    ))}
                  </div>
                </section>

                <section className="tn-panel tn-survey-card">
                  <h2 className="tn-panel-title">진행 중인 설문</h2>
                  <span className="tn-survey-tag">참여 가능 · D-5</span>
                  <p className="tn-survey-name">2026 시즌 홈 경기장 시설 만족도 조사</p>
                  <button className="tn-survey-btn" onClick={goSurvey}>설문 참여하기</button>
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

function NewsDetail({ news, team, onBack, onWrite, onSurvey }) {
  return (
    <article className="tn-detail">
      <button className="tn-back" onClick={onBack}>← 뉴스 목록으로</button>
      <div className="tn-meta">
        <span className="tn-cat-pill">{news.category}</span>
        <span className="tn-date">{news.date}</span>
      </div>
      <h1 className="tn-detail-title">{news.title}</h1>
      <Thumb team={team} category={news.category} hero />
      <div className="tn-reactions tn-detail-reactions">
        <span>💬 팬 의견 {news.opinions}개</span>
        <span>📊 설문 참여 {news.survey}명</span>
        <span>👁 조회 {news.views.toLocaleString()}</span>
      </div>
      <div className="tn-detail-body">
        <p className="tn-lead">{news.summary}</p>
        {news.body.map((p, i) => <p key={i}>{p}</p>)}
      </div>
      <div className="tn-cta tn-detail-cta">
        <button className="tn-cta-btn primary" onClick={onWrite}>📝 이 뉴스에 의견 남기기</button>
        <button className="tn-cta-btn secondary" onClick={onSurvey}>📊 관련 설문 참여하기</button>
      </div>
    </article>
  )
}
