import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import { logout, getCurrentUser } from './lib/auth.js'
import { getTeam, TeamEmblem, menuPath } from './teams.jsx'
import { getOpinionDetail, listComments, addComment, getLikeState, toggleLike as toggleLikeApi } from './lib/opinionsRepo.js'
import { relativeTime } from './lib/relativeTime.js'
import './ClubHomePage.css'
import './OpinionDetailPage.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

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
  const { lang, t } = useLang()

  const [detail, setDetail] = useState(null) // { opinion, related }
  const [comments, setComments] = useState([])
  const [draft, setDraft] = useState('')
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  // 의견 상세 + 댓글 + 공감 상태 로드 (Supabase 우선, 아니면 Mock — opinionsRepo)
  useEffect(() => {
    if (!team) { setLoading(false); return }
    let active = true
    setLoading(true)
    Promise.all([
      getOpinionDetail(team.id, opinionId),
      listComments(opinionId),
      getLikeState(opinionId),
    ]).then(([d, cs, likeState]) => {
      if (!active) return
      setDetail(d)
      setComments(cs)
      setLiked(likeState.likedByMe)
      setLikeCount(d ? d.opinion.likes : 0)
      setLoading(false)
    })
    return () => { active = false }
  }, [teamId, opinionId, team])

  const themeStyle = team ? { '--team': team.color, '--team-deep': team.colorDeep } : {}

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>존재하지 않는 의견입니다.</p>
        <button onClick={() => navigate('/team-select')}>팬 의견으로 돌아가기</button>
      </div>
    )
  }

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

  async function toggleLike() {
    const next = !liked
    setLiked(next)
    setLikeCount(c => c + (next ? 1 : -1))
    await toggleLikeApi(opinionId, next)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    const res = await addComment(opinionId, text)
    if (res.ok) {
      setComments(prev => [...prev, res.comment])
      setDraft('')
    }
  }

  const base = detail?.opinion || null
  const related = detail?.related || []

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

        {loading ? (
          <p className="od-loading" role="status">불러오는 중…</p>
        ) : !base ? (
          <div className="od-notfound" role="status">
            <p>존재하지 않는 의견입니다.</p>
            <button className="od-back" onClick={() => navigate(`/club/${team.id}/opinions`)}>{t('common.back')}</button>
          </div>
        ) : (
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
                    {relativeTime(base.hours, lang)} · <span className="od-cat">{base.category}</span>
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
                <button className={`od-act od-empathy${liked ? ' on' : ''}`} onClick={toggleLike}>
                  <span aria-hidden="true">❤️</span> {t('detail.agree')} <strong>{likeCount}</strong>
                </button>
                <button className="od-act" onClick={() => document.querySelector('.od-comment-input')?.focus()}>
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
                  <li key={c.id || i} className="od-comment">
                    <span className="od-avatar sm" aria-hidden="true">{c.author[0]}</span>
                    <div className="od-comment-body">
                      <div className="od-comment-head">
                        <span className="od-comment-name">{c.author}</span>
                        <span className="od-comment-time">{relativeTime(c.hours, lang)}</span>
                      </div>
                      <p className="od-comment-text">{c.text}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <form className="od-comment-form" onSubmit={handleSubmit}>
                <textarea
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
        )}
      </main>

      {toast && <div className="od-toast" role="status">{toast}</div>}
    </div>
  )
}
