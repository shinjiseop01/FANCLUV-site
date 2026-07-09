import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import IdentityNotice from './components/IdentityNotice.jsx'
import QuestionField from './components/survey/QuestionField.jsx'
import { logout, getCurrentUser, requiresIdentityVerification } from './lib/auth.js'
import { getTeam, teamName, TeamEmblem, menuPath } from './teams.jsx'
import { getSurvey, submitResponse } from './lib/surveysRepo.js'
import { isAnswered, emptyAnswer, OTHER_VALUE } from './lib/surveys/questionTypes.js'
import { SkeletonList } from './components/Skeleton.jsx'
import './ClubHomePage.css'
import './SurveyPage.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

export default function SurveyDetailPage() {
  const NICKNAME = getCurrentUser()?.nickname || '팬'
  const { teamId, surveyId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { lang, t } = useLang()

  const [survey, setSurvey] = useState(null)
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState({})
  const [otherText, setOtherText] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!team) return
    let active = true
    setLoading(true)
    getSurvey(team.id, surveyId).then(s => {
      if (!active) return
      setSurvey(s)
      if (s?.questions) {
        const init = {}
        for (const q of s.questions) init[q.id] = emptyAnswer(q.type)
        setAnswers(init)
      }
      setLoading(false)
      window.scrollTo({ top: 0 })
    })
    return () => { active = false }
  }, [teamId, surveyId, team])

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>존재하지 않는 구단입니다.</p>
        <button onClick={() => navigate('/team-select')}>구단 다시 선택하기</button>
      </div>
    )
  }

  const themeStyle = { '--team': team.color, '--team-deep': team.colorDeep }
  const backToList = () => navigate(`/club/${team.id}/survey`)

  const setAnswer = (qid, v) => setAnswers(a => ({ ...a, [qid]: v }))
  const setOther = (qid, v) => setOtherText(o => ({ ...o, [qid]: v }))

  // OTHER_VALUE sentinel → 실제 입력 텍스트로 치환.
  function resolveAnswers() {
    const out = {}
    for (const q of survey.questions) {
      let v = answers[q.id]
      const other = (otherText[q.id] || '').trim()
      if (q.type === 'single' && v === OTHER_VALUE) v = other
      else if (q.type === 'multi' && Array.isArray(v)) v = v.map(x => (x === OTHER_VALUE ? other : x)).filter(Boolean)
      out[q.id] = v
    }
    return out
  }

  async function handleSubmit(e) {
    e.preventDefault()
    // 필수 검증
    for (let i = 0; i < survey.questions.length; i++) {
      const q = survey.questions[i]
      if (q.required && !isAnswered(q, answers[q.id])) {
        setError(t('survey.errRequired', { n: i + 1 }))
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
    }
    setError(''); setSubmitting(true)
    const res = await submitResponse(survey.id, team.id, resolveAnswers())
    setSubmitting(false)
    if (!res.ok) {
      if (res.code === 'duplicate') { setSurvey(s => ({ ...s, participated: true })); return }
      setError(res.error || t('survey.errSubmit'))
      return
    }
    setSubmitted(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="ch-root" style={themeStyle}>
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
            const active = item === '설문'
            return (
              <a key={item} href="#" className={`ch-nav-item${active ? ' on' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={e => { e.preventDefault(); navigate(menuPath(item, team.id)) }}>{t(NAV_KEYS[item])}</a>
            )
          })}
        </nav>
      </header>

      <main className="sv-main">
        {loading ? (
          <SkeletonList count={1} lines={4} />
        ) : !survey ? (
          <div className="sv-notfound" role="status">
            <p>{t('survey.notFound')}</p>
            <button className="sv-btn-primary" onClick={backToList}>{t('survey.backList')}</button>
          </div>
        ) : submitted ? (
          <div className="sv-done">
            <div className="sv-done-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <h1>{t('survey.doneTitle')}</h1>
            <p>{t('survey.doneMsg')}</p>
            <div className="sv-done-actions">
              <button className="sv-btn-primary" onClick={backToList}>{t('survey.backList')}</button>
            </div>
          </div>
        ) : survey.participated ? (
          <div className="sv-done">
            <div className="sv-done-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <h1>{t('survey.alreadyTitle')}</h1>
            <p>{t('survey.alreadyMsg')}</p>
            <div className="sv-done-actions">
              <button className="sv-btn-primary" onClick={backToList}>{t('survey.backList')}</button>
            </div>
          </div>
        ) : survey.status !== 'published' ? (
          <div className="sv-notfound" role="status">
            <p>{t('survey.closedMsg')}</p>
            <button className="sv-btn-primary" onClick={backToList}>{t('survey.backList')}</button>
          </div>
        ) : requiresIdentityVerification() ? (
          <>
            <button className="sv-back" onClick={backToList}>{t('common.back')}</button>
            <IdentityNotice />
          </>
        ) : (
          <>
            <button className="sv-back" onClick={backToList}>{t('common.back')}</button>
            <header className="sv-head">
              <span className="sv-tag">{t('survey.statusOpen')} · {survey.dday === 0 ? 'D-DAY' : `D-${survey.dday}`}</span>
              <h1 className="sv-title">{survey.title}</h1>
              {survey.desc && <p className="sv-desc">{survey.desc}</p>}
            </header>

            {error && <div className="sv-error" role="alert">⚠ {error}</div>}

            <form className="sv-form" onSubmit={handleSubmit}>
              {survey.questions.map((q, i) => (
                <div className="sv-q" key={q.id}>
                  <div className="sv-q-head">
                    <span className="sv-qnum">Q{i + 1}.</span>
                    <span className="sv-q-title">
                      {q.title}{q.required && <em className="sv-req"> *</em>}
                    </span>
                  </div>
                  {q.help_text && <p className="sv-q-help">{q.help_text}</p>}
                  <QuestionField
                    question={q}
                    value={answers[q.id] ?? emptyAnswer(q.type)}
                    onChange={v => setAnswer(q.id, v)}
                    otherText={otherText[q.id] || ''}
                    onOther={v => setOther(q.id, v)}
                  />
                </div>
              ))}

              {survey.questions.length === 0 ? (
                <p className="sv-desc">{t('survey.noQuestions')}</p>
              ) : (
                <button type="submit" className="sv-submit" disabled={submitting}>
                  {submitting ? t('survey.submitting') : t('survey.submit')}
                </button>
              )}
            </form>
          </>
        )}
      </main>
    </div>
  )
}
