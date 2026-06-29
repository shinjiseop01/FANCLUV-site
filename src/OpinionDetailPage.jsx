import { useState, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import { logout, getCurrentUser } from './lib/auth.js'
import { getTeam, TeamEmblem, menuPath } from './teams.jsx'
import './ClubHomePage.css'
import './OpinionDetailPage.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

// Same pool as the opinions list (kept here so the list page stays untouched).
const BASE_OPINIONS = [
  { author: '블루윙', category: '경기장', rating: 4, hours: 2, hasPhoto: true,
    title: '홈 경기장 좌석 시야 개선이 필요합니다',
    body: 'N석 일부 구역은 광고판에 가려 골대가 잘 보이지 않습니다. 시야 방해 좌석은 예매 시 미리 안내해주면 좋겠어요.',
    full: ['N석 하단 일부 구역은 경기 중 골대 한쪽이 광고판과 안전 펜스에 가려 잘 보이지 않습니다. 특히 코너킥이나 골 장면에서 시야가 막혀 아쉬운 순간이 많았습니다.',
      '시야 방해가 있는 좌석은 예매 단계에서 미리 표시해 주시면 좋겠습니다. 팬들이 자리를 선택할 때 충분히 알고 결정할 수 있도록요.',
      '장기적으로는 해당 구역의 펜스 높이나 광고판 위치를 조정하는 것도 검토해 주시면 감사하겠습니다.'] },
  { author: '직관러', category: '응원문화', rating: 5, hours: 5,
    title: '원정 응원 분위기가 정말 최고였습니다',
    body: '지난 원정에서 서포터즈 응원이 끝까지 이어져 선수들에게 큰 힘이 됐을 것 같아요. 이런 문화가 계속 이어지길 바랍니다.',
    full: ['지난 원정 경기에서 끝까지 멈추지 않은 응원이 정말 인상적이었습니다. 경기 결과를 떠나 선수들에게 분명 큰 힘이 됐을 거예요.',
      '원정 팬들을 위한 좌석 배치와 안내가 더 체계적으로 운영된다면, 이런 응원 문화가 더욱 단단하게 자리 잡을 수 있을 것 같습니다.'] },
  { author: '시즌권홀더', category: '티켓', rating: 3, hours: 9,
    title: '티켓 예매 페이지 안정성 개선 요청',
    body: '인기 경기 예매 오픈 직후 페이지가 자주 멈춥니다. 대기열 시스템 도입을 진지하게 검토해주셨으면 합니다.',
    full: ['인기 경기 예매가 열리는 순간 접속이 몰리면서 페이지가 자주 멈춥니다. 결제 직전에 오류가 나 처음부터 다시 시도해야 하는 경우도 있었습니다.',
      '대기열(큐) 시스템을 도입하면 접속 폭주 상황에서도 순서대로 안정적으로 예매할 수 있을 것 같습니다. 시즌권 회원 우선 예매 시간도 함께 고려해 주시면 좋겠습니다.'] },
  { author: '굿즈수집가', category: 'MD', rating: 4, hours: 14,
    title: '신규 유니폼 디자인 만족도가 높아요',
    body: '이번 시즌 홈 유니폼 색감과 디테일이 훌륭합니다. 다만 사이즈별 재고가 빨리 소진돼 재입고 주기가 빨라지면 좋겠어요.',
    full: ['이번 시즌 홈 유니폼은 색감과 엠블럼 디테일이 특히 잘 나왔다고 생각합니다. 구단 정체성이 잘 드러나서 만족스럽습니다.',
      '다만 인기 사이즈가 금방 품절되어 구하기 어려웠습니다. 재입고 주기를 조금 더 빠르게 가져가 주시면 더 많은 팬들이 함께할 수 있을 것 같아요.'] },
  { author: '응원단장', category: '선수', rating: 5, hours: 20,
    title: '유소년 출신 선수 출전 기회 확대 희망',
    body: '아카데미에서 성장한 선수들이 1군에서 뛰는 모습을 더 보고 싶습니다. 장기적으로 구단 색깔을 만드는 길이라 생각해요.',
    full: ['우리 아카데미에서 성장한 선수들이 1군 무대에서 뛰는 모습을 더 자주 보고 싶습니다. 팬들에게는 그 자체로 큰 의미가 있습니다.',
      '단기 성적도 중요하지만, 유소년 육성은 장기적으로 구단만의 색깔과 지속 가능성을 만드는 길이라고 생각합니다.'] },
  { author: '풋볼러버', category: '구단 운영', rating: 4, hours: 28,
    title: '팬 소통 간담회를 정례화해 주세요',
    body: '구단의 방향성을 팬들과 직접 공유하는 자리가 분기마다 있으면 신뢰가 더 쌓일 것 같습니다. 온라인 병행도 환영합니다.',
    full: ['구단의 운영 방향과 계획을 팬들과 직접 공유하는 간담회가 분기마다 정기적으로 열리면 좋겠습니다.',
      '현장 참석이 어려운 팬들을 위해 온라인 중계나 사후 요약 공유도 함께 진행된다면 더 많은 팬이 참여할 수 있을 것입니다.'] },
  { author: '홈경기지킴이', category: '이벤트', rating: 4, hours: 33,
    title: '가족 단위 관중을 위한 이벤트가 늘었으면',
    body: '아이와 함께 오는 팬들이 많아졌는데, 경기 전 체험 부스나 포토존이 더 다양해지면 좋겠습니다.',
    full: ['최근 아이와 함께 경기장을 찾는 가족 팬들이 눈에 띄게 늘었습니다. 다음 세대 팬을 만드는 좋은 흐름이라고 생각합니다.',
      '경기 시작 전 체험 부스, 포토존, 키즈존 같은 프로그램이 더 다양해지면 가족 단위 방문이 더욱 즐거운 경험이 될 것 같습니다.'] },
  { author: '평일직관', category: '경기장', rating: 3, hours: 41,
    title: '경기장 먹거리 줄이 너무 깁니다',
    body: '하프타임에 매점 줄이 길어 후반 시작을 놓칠 때가 많아요. 키오스크나 모바일 주문을 도입하면 좋겠습니다.',
    full: ['하프타임에 매점 줄이 너무 길어 음식을 사고 나면 후반전 시작을 놓치는 경우가 많습니다.',
      '키오스크 증설이나 모바일 주문 후 픽업 시스템을 도입하면 대기 시간이 크게 줄어들 것 같습니다. 좌석으로 배달해 주는 서비스도 검토해 볼 만합니다.'] },
  { author: '레전드7', category: '기타', rating: 4, hours: 52,
    title: '대중교통 막차 시간 연계 안내 부탁',
    body: '야간 경기 후 대중교통 이용 정보가 한곳에 정리돼 있으면 편할 것 같아요. 셔틀 운영 확대도 검토 부탁드립니다.',
    full: ['야간 경기가 끝난 뒤 대중교통 막차 시간과 정류장 정보를 한곳에서 확인할 수 있으면 귀가가 훨씬 수월할 것 같습니다.',
      '경기 종료 시간에 맞춘 셔틀버스 운영을 확대해 주시면 원거리에서 오는 팬들에게 큰 도움이 될 것입니다.'] },
]

const INITIAL_COMMENTS = [
  { author: '풋볼맘', hours: 6, text: '정말 공감합니다. 저도 같은 구역에서 비슷한 불편을 느꼈어요. 구단이 꼭 검토해 주면 좋겠네요.' },
  { author: '직관7년차', hours: 3, text: '예매 단계에서 시야 정보를 표시해주는 건 정말 필요한 부분 같습니다. 건설적인 의견 감사합니다.' },
  { author: '서포터K', hours: 1, text: '데이터로 잘 정리돼서 구단에 전달되면 좋겠습니다. 저도 공감 눌렀어요!' },
]

const seedOf = id => id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
const timeLabel = h => (h <= 0 ? '방금 전' : h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`)

function Stars({ rating }) {
  return (
    <span className="od-stars" aria-label={`만족도 ${rating}점`}>
      {[1, 2, 3, 4, 5].map(n => (
        <svg key={n} viewBox="0 0 20 20" className={n <= rating ? 'on' : ''} aria-hidden="true">
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 15l-5.2 2.6 1-5.8L1.5 7.7l5.9-.9z" />
        </svg>
      ))}
    </span>
  )
}

export default function OpinionDetailPage() {
  const NICKNAME = getCurrentUser()?.nickname || '팬'
  const { teamId, opinionId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const idx = Number(opinionId) - 1
  const base = team && Number.isInteger(idx) && BASE_OPINIONS[idx] ? BASE_OPINIONS[idx] : null

  const { lang, setLang, t } = useLang()
  const [comments, setComments] = useState(INITIAL_COMMENTS)
  const [draft, setDraft] = useState('')
  const [liked, setLiked] = useState(false)
  const [toast, setToast] = useState('')
  const commentBoxRef = useRef(null)

  const seed = team ? seedOf(team.id) : 0
  const baseLikes = base ? 40 + ((seed * (idx + 3)) % 320) : 0

  const related = useMemo(() => {
    if (!base) return []
    return BASE_OPINIONS
      .map((o, i) => ({ ...o, id: i + 1 }))
      .filter(o => o.category === base.category && o.id !== idx + 1)
      .concat(
        BASE_OPINIONS.map((o, i) => ({ ...o, id: i + 1 })).filter(o => o.category !== base.category && o.id !== idx + 1)
      )
      .slice(0, 4)
  }, [base, idx])

  if (!team || !base) {
    return (
      <div className="ch-fallback">
        <p>존재하지 않는 의견입니다.</p>
        <button onClick={() => navigate(team ? `/club/${team.id}/opinions` : '/team-select')}>팬 의견으로 돌아가기</button>
      </div>
    )
  }

  const likeCount = baseLikes + (liked ? 1 : 0)

  function flash(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 1800)
  }

  function handleShare() {
    const url = window.location.href
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => flash('링크가 복사되었습니다.'), () => flash('링크: ' + url))
    } else {
      flash('링크가 복사되었습니다.')
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setComments(prev => [...prev, { author: NICKNAME, hours: 0, text }])
    setDraft('')
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
      <main className="od-main">
        <button className="od-back" onClick={() => navigate(`/club/${team.id}/opinions`)}>
          {t('common.back')}
        </button>

        <div className="od-layout">
          {/* Left: article + comments */}
          <div className="od-col-main">
            <article className="od-article">
              <h1 className="od-title">{base.title}</h1>

              <div className="od-author">
                <span className="od-avatar" aria-hidden="true">{base.author[0]}</span>
                <div className="od-author-meta">
                  <span className="od-author-name">{base.author}</span>
                  <span className="od-author-sub">
                    {timeLabel(base.hours)} · <span className="od-cat">{base.category}</span>
                  </span>
                </div>
                <Stars rating={base.rating} />
              </div>

              <div className="od-content">
                {base.full.map((p, i) => <p key={i}>{p}</p>)}
              </div>

              {base.hasPhoto && (
                <figure className="od-photo">
                  <div className="od-photo-box" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6"/><circle cx="8.5" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.4"/><path d="M21 16l-5-5-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <figcaption>첨부된 사진 · 좌석에서 바라본 경기장 시야</figcaption>
                </figure>
              )}

              {/* Interaction bar */}
              <div className="od-actions">
                <button className={`od-act od-empathy${liked ? ' on' : ''}`} onClick={() => setLiked(v => !v)}>
                  <span aria-hidden="true">❤️</span> {t('detail.agree')} <strong>{likeCount}</strong>
                </button>
                <button className="od-act" onClick={() => commentBoxRef.current?.focus()}>
                  <span aria-hidden="true">💬</span> {t('detail.comment')} <strong>{comments.length}</strong>
                </button>
                <button className="od-act" onClick={handleShare}>
                  <span aria-hidden="true">🔗</span> {t('detail.share')}
                </button>
                <button className="od-act od-report" onClick={() => flash(t('detail.reported'))}>
                  <span aria-hidden="true">🚩</span> {t('detail.report')}
                </button>
              </div>
            </article>

            {/* Comments */}
            <section className="od-comments">
              <h2 className="od-comments-title">{t('detail.commentTitle')} <span>{comments.length}</span></h2>

              <ul className="od-comment-list">
                {comments.map((c, i) => (
                  <li key={i} className="od-comment">
                    <span className="od-avatar sm" aria-hidden="true">{c.author[0]}</span>
                    <div className="od-comment-body">
                      <div className="od-comment-head">
                        <span className="od-comment-name">{c.author}</span>
                        <span className="od-comment-time">{timeLabel(c.hours)}</span>
                      </div>
                      <p className="od-comment-text">{c.text}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <form className="od-comment-form" onSubmit={handleSubmit}>
                <textarea
                  ref={commentBoxRef}
                  className="od-comment-input"
                  placeholder={t('detail.commentPh')}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  rows={2}
                />
                <button type="submit" className="od-comment-submit" disabled={!draft.trim()}>{t('detail.commentSubmit')}</button>
              </form>
            </section>
          </div>

          {/* Right: sidebar */}
          <aside className="od-side">
            <section className="od-panel">
              <h2 className="od-panel-title">{t('detail.related')}</h2>
              <ul className="od-related">
                {related.map(r => (
                  <li key={r.id}>
                    <button className="od-related-item" onClick={() => navigate(`/club/${team.id}/opinions/${r.id}`)}>
                      <span className="od-related-cat">{r.category}</span>
                      <span className="od-related-title">{r.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="od-panel">
              <h2 className="od-panel-title">{t('detail.ongoing')}</h2>
              <span className="od-survey-tag">참여 가능 · D-5</span>
              <p className="od-survey-name">2026 시즌 홈 경기장 시설 만족도 조사</p>
              <p className="od-survey-desc">여러분의 의견이 구단에 그대로 전달됩니다.</p>
              <button className="od-survey-btn" onClick={() => navigate(`/club/${team.id}/survey`)}>{t('op.joinSurvey')}</button>
            </section>
          </aside>
        </div>
      </main>

      {toast && <div className="od-toast" role="status">{toast}</div>}
    </div>
  )
}
