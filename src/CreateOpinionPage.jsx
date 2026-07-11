import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import Icon from './components/Icon.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import IdentityNotice from './components/IdentityNotice.jsx'
import { logout, getCurrentUser, requiresIdentityVerification } from './lib/auth.js'
import { getTeam, teamName, TeamEmblem, menuPath } from './teams.jsx'
import { createOpinion, updateOpinion, getOpinionDetail } from './lib/opinionsRepo.js'
import './ClubHomePage.css'
import './CreateOpinionPage.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']
const CATEGORIES = ['경기장', '응원문화', '티켓', 'MD', '선수', '구단 운영', '이벤트', '기타']

export default function CreateOpinionPage() {
  const NICKNAME = getCurrentUser()?.nickname || '팬'
  const { teamId, opinionId } = useParams()
  const isEdit = !!opinionId // /opinions/:opinionId/edit 로 진입하면 수정 모드
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { lang, t } = useLang()

  const [category, setCategory] = useState('')
  const [rating, setRating] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  // 본인인증 미완료 계정은 의견을 작성할 수 없다(작성 폼 대신 안내 노출).
  const gated = requiresIdentityVerification()

  // 수정 모드: 기존 값을 불러와 폼에 채운다. 본인 글이 아니면 상세로 되돌린다(RLS 이중방어).
  useEffect(() => {
    if (!isEdit || !team) return
    let active = true
    getOpinionDetail(team.id, opinionId).then(d => {
      if (!active) return
      if (!d || !d.opinion) { navigate(`/club/${team.id}/opinions`); return }
      if (!d.opinion.mine) { navigate(`/club/${team.id}/opinions/${opinionId}`); return }
      setCategory(d.opinion.category || '')
      setRating(d.opinion.rating || 0)
      setTitle(d.opinion.title || '')
      setBody(d.opinion.body || '')
    })
    return () => { active = false }
  }, [isEdit, team, opinionId, navigate])

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>존재하지 않는 구단입니다.</p>
        <button onClick={() => navigate('/team-select')}>구단 다시 선택하기</button>
      </div>
    )
  }

  const themeStyle = { '--team': team.color, '--team-deep': team.colorDeep }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!category) { setError(t('create.errCategory')); return }
    if (rating < 1) { setError(t('create.errRating')); return }
    if (!title.trim()) { setError(t('create.errTitle')); return }
    if (!body.trim()) { setError(t('create.errBody')); return }

    const payload = { category, rating, title: title.trim(), body: body.trim() }
    const res = isEdit
      ? await updateOpinion(team.id, opinionId, payload)
      : await createOpinion(team.id, { ...payload, hasPhoto: false })
    if (!res.ok) {
      setError(res.code === 'forbidden' ? t('create.forbidden') : (res.error || t('create.errBody')))
      return
    }

    setSubmitted(true)
    // 수정=상세로, 작성=목록으로 이동 → 실데이터 재조회로 반영.
    setTimeout(() => navigate(isEdit ? `/club/${team.id}/opinions/${opinionId}` : `/club/${team.id}/opinions`), 1300)
  }

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
      <main className="cw-main">
        <button className="cw-back" onClick={() => navigate(-1)}>{t('common.back')}</button>

        {submitted ? (
          <div className="cw-done">
            <div className="cw-done-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <h1>{isEdit ? t('create.editDone') : t('create.doneTitle')}</h1>
            <p>{isEdit ? t('create.editDoneDesc') : t('create.doneDesc')}</p>
          </div>
        ) : gated ? (
          <IdentityNotice />
        ) : (
          <div className="cw-card">
            <header className="cw-head">
              <h1 className="cw-title">{isEdit ? t('create.editTitle') : t('create.title')}</h1>
              <p className="cw-desc">여러분의 의견은 구단 운영 개선을 위한 소중한 데이터가 됩니다.</p>
            </header>

            <form className="cw-form" onSubmit={handleSubmit} noValidate>
              {/* 1. Category */}
              <div className="cw-field">
                <label className="cw-label">{t('create.category')}</label>
                <div className="cw-cats">
                  {CATEGORIES.map(c => (
                    <button type="button" key={c}
                      className={`cw-cat${category === c ? ' on' : ''}`}
                      onClick={() => { setCategory(c); setError('') }}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Rating */}
              <div className="cw-field">
                <label className="cw-label">{t('create.rating')}</label>
                <div className="cw-stars" role="radiogroup" aria-label="만족도 별점">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button type="button" key={n}
                      className={`cw-star${n <= rating ? ' on' : ''}`}
                      aria-label={`${n}점`} aria-pressed={n === rating}
                      onClick={() => { setRating(n); setError('') }}>
                      <svg viewBox="0 0 24 24"><path d="M12 2l3 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.9 21l1.2-6.9-5-4.9 6.9-1z"/></svg>
                    </button>
                  ))}
                  <span className="cw-stars-label">{rating ? `${rating}점` : t('create.ratingPh')}</span>
                </div>
              </div>

              {/* 3. Title */}
              <div className="cw-field">
                <label className="cw-label" htmlFor="cw-title">{t('create.titleLabel')}</label>
                <input id="cw-title" type="text" className="cw-input"
                  placeholder={t('create.titlePh')}
                  value={title} onChange={e => { setTitle(e.target.value); setError('') }} maxLength={60} />
              </div>

              {/* 4. Body */}
              <div className="cw-field">
                <label className="cw-label" htmlFor="cw-body">{t('create.body')}</label>
                <textarea id="cw-body" className="cw-textarea"
                  placeholder={t('create.bodyPh')}
                  value={body} onChange={e => { setBody(e.target.value); setError('') }} rows={6} />
              </div>
              {/* 사진 첨부는 실제 업로드 연동(Storage) 후 제공 예정 — 베타에서는 노출하지 않음 */}

              {error && <div className="cw-error" role="alert"><Icon name="warningTriangle" size={14} className="fc-inline-ico" />{error}</div>}

              <button type="submit" className="cw-submit">{isEdit ? t('create.editSubmit') : t('create.submit')}</button>
            </form>
          </div>
        )}
      </main>
    </div>
  )
}
