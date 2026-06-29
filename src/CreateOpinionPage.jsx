import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import { logout, getCurrentUser } from './lib/auth.js'
import { getTeam, TeamEmblem, menuPath } from './teams.jsx'
import { addOpinion } from './opinionStore.js'
import './ClubHomePage.css'
import './CreateOpinionPage.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']
const CATEGORIES = ['경기장', '응원문화', '티켓', 'MD', '선수', '구단 운영', '이벤트', '기타']

export default function CreateOpinionPage() {
  const NICKNAME = getCurrentUser()?.nickname || '팬'
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { lang, setLang, t } = useLang()

  const [category, setCategory] = useState('')
  const [rating, setRating] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [photoName, setPhotoName] = useState('')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>존재하지 않는 구단입니다.</p>
        <button onClick={() => navigate('/team-select')}>구단 다시 선택하기</button>
      </div>
    )
  }

  const themeStyle = { '--team': team.color, '--team-deep': team.colorDeep }

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!category) { setError(t('create.errCategory')); return }
    if (rating < 1) { setError(t('create.errRating')); return }
    if (!title.trim()) { setError(t('create.errTitle')); return }
    if (!body.trim()) { setError(t('create.errBody')); return }

    addOpinion(team.id, {
      id: `u${Date.now()}`,
      author: NICKNAME,
      category,
      rating,
      hours: 0,
      title: title.trim(),
      body: body.trim(),
      likes: 0,
      comments: 0,
      hasPhoto: !!photoName,
    })

    setSubmitted(true)
    setTimeout(() => navigate(`/club/${team.id}/opinions`), 1300)
  }

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
            <h1>{t('create.doneTitle')}</h1>
            <p>{t('create.doneDesc')}</p>
          </div>
        ) : (
          <div className="cw-card">
            <header className="cw-head">
              <h1 className="cw-title">{t('create.title')}</h1>
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

              {/* 5. Photo (optional) */}
              <div className="cw-field">
                <label className="cw-label">{t('create.photo')} <span className="cw-optional">{t('create.optional')}</span></label>
                <label className="cw-photo">
                  <input type="file" accept="image/*" hidden
                    onChange={e => setPhotoName(e.target.files?.[0]?.name || '')} />
                  <span className="cw-photo-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6"/><circle cx="8.5" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.4"/><path d="M21 16l-5-5-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                  <span className="cw-photo-text">{photoName || t('create.photoPh')}</span>
                </label>
              </div>

              {error && <div className="cw-error" role="alert">⚠ {error}</div>}

              <button type="submit" className="cw-submit">{t('create.submit')}</button>
            </form>
          </div>
        )}
      </main>
    </div>
  )
}
