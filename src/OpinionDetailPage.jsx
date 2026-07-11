import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import IdentityNotice from './components/IdentityNotice.jsx'
import { logout, getCurrentUser, requiresIdentityVerification } from './lib/auth.js'
import { getTeam, teamName, TeamEmblem, menuPath } from './teams.jsx'
import { getOpinionDetail, listComments, addComment, deleteComment, updateComment, deleteOpinion, getLikeState, toggleLike as toggleLikeApi } from './lib/opinionsRepo.js'
import { submitReport } from './lib/reportsRepo.js'
import ReportModal from './components/ReportModal.jsx'
import Icon from './components/Icon.jsx'
import Pagination from './components/Pagination.jsx'
import { usePagination } from './lib/usePagination.js'
import AnimatedNumber from './components/AnimatedNumber.jsx'
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
  const { paged: pagedComments, page: cmPage, total: cmTotal, setPage: setCmPage } = usePagination(comments, 10)
  const [draft, setDraft] = useState('')
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [deleteId, setDeleteId] = useState(null)   // 삭제 확인 중인 댓글 id
  const [opDeleteOpen, setOpDeleteOpen] = useState(false) // 의견 삭제 확인 모달
  const [editingId, setEditingId] = useState(null) // 인라인 수정 중인 댓글 id
  const [editText, setEditText] = useState('')

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
    // 본인 의견에는 공감할 수 없다(UI 차단 + DB RLS 이중방어).
    if (base?.mine) { flash(t('detail.selfLike')); return }
    const next = !liked
    setLiked(next)
    setLikeCount(c => c + (next ? 1 : -1))
    await toggleLikeApi(opinionId, next, team.id)
  }

  async function handleReport(reason, detail) {
    setReporting(true)
    const res = await submitReport({
      targetType: 'opinion',
      targetId: opinionId,
      targetExcerpt: base?.title || '',
      reason, detail,
    })
    setReporting(false)
    setReportOpen(false)
    flash(res.ok ? t('detail.reported')
      : res.code === 'duplicate' ? t('detail.reportDuplicate')
      : (res.error || t('detail.reportFail')))
  }

  async function submitComment() {
    const text = draft.trim()
    if (!text) return
    const res = await addComment(opinionId, text, team.id)
    if (res.ok) {
      // 낙관적 추가 대신 Supabase 재조회로 실데이터 동기화.
      setComments(await listComments(opinionId))
      setDraft('')
    } else if (res.error) {
      flash(res.error)
    }
  }

  // 댓글 삭제(확인 모달 → 실행). Supabase RLS 로 본인/관리자만 실제 삭제.
  async function confirmDeleteComment() {
    const id = deleteId
    setDeleteId(null)
    if (!id) return
    const res = await deleteComment(opinionId, id)
    if (res.ok) {
      setComments(await listComments(opinionId))
      flash(t('detail.commentDeleted'))
    } else {
      flash(t('detail.commentDeleteFail'))
    }
  }

  // 의견 삭제(본인) → 목록으로. 댓글/공감은 FK cascade 로 함께 정리된다.
  async function confirmDeleteOpinion() {
    setOpDeleteOpen(false)
    const res = await deleteOpinion(team.id, opinionId)
    if (res.ok) {
      flash(t('detail.opinionDeleted'))
      setTimeout(() => navigate(`/club/${team.id}/opinions`), 800)
    } else {
      flash(res.code === 'forbidden' ? t('detail.forbidden') : t('detail.opinionDeleteFail'))
    }
  }

  function startEditComment(c) { setEditingId(c.id); setEditText(c.text) }
  async function saveEditComment() {
    const id = editingId, text = editText.trim()
    if (!id || !text) { setEditingId(null); return }
    const res = await updateComment(opinionId, id, text)
    setEditingId(null); setEditText('')
    if (res.ok) {
      setComments(await listComments(opinionId))
      flash(t('detail.commentEdited'))
    } else {
      flash(res.code === 'forbidden' ? t('detail.forbidden') : t('detail.commentEditFail'))
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    submitComment()
  }

  // Enter = 작성 / Shift+Enter = 줄바꿈 (한글 IME 조합 중에는 무시)
  function handleCommentKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submitComment()
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
                <div className="od-action-group">
                  <Stars rating={base.rating} />
                  {base.mine && (
                    <>
                      <button type="button" className="od-content-btn"
                        onClick={() => navigate(`/club/${team.id}/opinions/${opinionId}/edit`)}>
                        {t('detail.edit')}
                      </button>
                      <button type="button" className="od-content-btn danger"
                        onClick={() => setOpDeleteOpen(true)}>
                        {t('detail.delete')}
                      </button>
                    </>
                  )}
                </div>
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
                <button className={`od-act od-empathy${liked ? ' on' : ''}`} onClick={toggleLike}
                  disabled={base.mine} title={base.mine ? t('detail.selfLike') : undefined}>
                  <Icon name="heart" size={17} /> {t('detail.agree')} <strong><AnimatedNumber value={likeCount} /></strong>
                </button>
                {base.mine && <span className="od-selflike-note">{t('detail.selfLike')}</span>}
                <button className="od-act" onClick={() => document.querySelector('.od-comment-input')?.focus()}>
                  <Icon name="comment" size={17} /> {t('detail.comment')} <strong><AnimatedNumber value={comments.length} /></strong>
                </button>
                <button className="od-act" onClick={handleShare}>
                  <Icon name="share" size={17} /> {t('detail.share')}
                </button>
                <button className="od-act od-report" onClick={() => setReportOpen(true)}>
                  <Icon name="flag" size={17} /> {t('detail.report')}
                </button>
              </div>
            </article>

            {/* Comments */}
            <section className="od-comments">
              <h2 className="od-comments-title">{t('detail.commentTitle')} <span><AnimatedNumber value={comments.length} /></span></h2>

              <ul className="od-comment-list">
                {pagedComments.map((c, i) => (
                  <li key={c.id || i} className="od-comment">
                    <span className="od-avatar sm" aria-hidden="true">{c.author[0]}</span>
                    <div className="od-comment-body">
                      <div className="od-comment-head">
                        <span className="od-comment-name">{c.author}</span>
                        <span className="od-comment-time">{relativeTime(c.hours, lang)}</span>
                      </div>
                      {editingId === c.id ? (
                        <div className="od-comment-edit">
                          <textarea className="od-comment-input" rows={2}
                            value={editText} onChange={e => setEditText(e.target.value)} />
                          <div className="od-comment-edit-actions">
                            <button type="button" className="od-content-btn" onClick={() => { setEditingId(null); setEditText('') }}>{t('common.cancel')}</button>
                            <button type="button" className="od-comment-save" disabled={!editText.trim()} onClick={saveEditComment}>{t('detail.commentEditSave')}</button>
                          </div>
                        </div>
                      ) : (
                        <p className="od-comment-text">{c.text}</p>
                      )}
                    </div>
                    {c.mine && editingId !== c.id && (
                      <div className="od-comment-actions">
                        <button type="button" className="od-content-btn" onClick={() => startEditComment(c)}>{t('detail.commentEdit')}</button>
                        <button type="button" className="od-content-btn danger" onClick={() => setDeleteId(c.id)}>{t('detail.commentDelete')}</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <Pagination page={cmPage} total={cmTotal} onChange={setCmPage} />

              {requiresIdentityVerification() ? (
                <IdentityNotice />
              ) : (
                <form className="od-comment-form" onSubmit={handleSubmit}>
                  <textarea
                    className="od-comment-input"
                    placeholder={t('detail.commentPh')}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={handleCommentKeyDown}
                    rows={2}
                  />
                  <button type="submit" className="od-comment-submit" disabled={!draft.trim()}>{t('detail.commentSubmit')}</button>
                </form>
              )}
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

      <ReportModal
        open={reportOpen}
        submitting={reporting}
        onClose={() => setReportOpen(false)}
        onSubmit={handleReport}
      />

      {/* 의견 삭제 확인 모달 */}
      {opDeleteOpen && (
        <div className="rpt-overlay" role="dialog" aria-modal="true" onClick={() => setOpDeleteOpen(false)}>
          <div className="rpt-modal" onClick={e => e.stopPropagation()}>
            <h2 className="rpt-title">{t('detail.opinionDeleteConfirm')}</h2>
            <p className="rpt-desc">{t('detail.opinionDeleteDesc')}</p>
            <div className="rpt-actions">
              <button type="button" className="rpt-cancel" onClick={() => setOpDeleteOpen(false)}>{t('common.cancel')}</button>
              <button type="button" className="rpt-submit" onClick={confirmDeleteOpinion}>{t('detail.delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/* 댓글 삭제 확인 모달 (ReportModal 과 동일 스타일 재사용) */}
      {deleteId && (
        <div className="rpt-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteId(null)}>
          <div className="rpt-modal" onClick={e => e.stopPropagation()}>
            <h2 className="rpt-title">{t('detail.commentDeleteConfirm')}</h2>
            <p className="rpt-desc">{t('detail.commentDeleteDesc')}</p>
            <div className="rpt-actions">
              <button type="button" className="rpt-cancel" onClick={() => setDeleteId(null)}>{t('common.cancel')}</button>
              <button type="button" className="rpt-submit" onClick={confirmDeleteComment}>{t('detail.commentDelete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
