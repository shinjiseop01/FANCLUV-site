import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import { logout, getCurrentUser } from './lib/auth.js'
import { getTeam, TeamEmblem, menuPath } from './teams.jsx'
import { listSurveys, submitResponse } from './lib/surveysRepo.js'
import EmptyState from './components/EmptyState.jsx'
import { SkeletonList } from './components/Skeleton.jsx'
import './ClubHomePage.css'
import './SurveyPage.css'

const STATUS_FILTERS = ['all', 'open', 'closed']

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

const IMPROVE_OPTIONS = ['좌석 / 시야', '편의시설', '먹거리 / 매점', '접근성 / 교통', '응원 환경', '기타']
const REVISIT_OPTIONS = ['매우 그렇다', '그렇다', '보통이다', '아니다']

export default function SurveyPage() {
  const NICKNAME = getCurrentUser()?.nickname || '팬'
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { t } = useLang()

  const [surveys, setSurveys] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null) // null → 설문 목록 화면
  const [statusFilter, setStatusFilter] = useState('all')
  const [satisfaction, setSatisfaction] = useState(0)
  const [improve, setImprove] = useState('')
  const [revisit, setRevisit] = useState('')
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // 구단 설문 로드 (Supabase 우선, 아니면 Mock — surveysRepo)
  useEffect(() => {
    if (!team) return
    let active = true
    setLoading(true)
    listSurveys(team.id).then(list => {
      if (!active) return
      setSurveys(list)
      setLoading(false)
    })
    return () => { active = false }
  }, [teamId, team])

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>존재하지 않는 구단입니다.</p>
        <button onClick={() => navigate('/team-select')}>구단 다시 선택하기</button>
      </div>
    )
  }

  const themeStyle = { '--team': team.color, '--team-deep': team.colorDeep }
  const selected = surveys.find(s => s.id === selectedId) || null

  // 제목/설명: Supabase 설문은 DB 값, Mock 설문은 locale 키(survey.item.<id>.*)
  const surveyTitle = s => s.title || t(`survey.item.${s.id}.title`)
  const surveyDesc = s => s.desc || t(`survey.item.${s.id}.desc`)

  // 설문 폼 상태 초기화 (카드 선택 / 목록 복귀 시)
  function resetForm() {
    setSatisfaction(0)
    setImprove('')
    setRevisit('')
    setComment('')
    setSubmitted(false)
  }

  function openSurvey(id) {
    resetForm()
    setSelectedId(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function backToList() {
    resetForm()
    setSelectedId(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (selected) {
      await submitResponse(selected.id, team.id, { satisfaction, improve, revisit, comment })
      // 참여 완료 표시를 위해 로컬 목록 갱신
      setSurveys(list => list.map(s => (s.id === selected.id ? { ...s, participated: true } : s)))
    }
    setSubmitted(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 종료 후 7일 지난 설문은 repo(listSurveys)에서 이미 제외됨.
  const visibleSurveys = surveys
    .filter(s => (statusFilter === 'all' ? true : s.status === statusFilter))

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
            const active = item === '설문'
            return (
              <a key={item} href="#" className={`ch-nav-item${active ? ' on' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={e => { e.preventDefault(); navigate(menuPath(item, team.id)) }}>{t(NAV_KEYS[item])}</a>
            )
          })}
        </nav>
      </header>

      {/* ── Main ── */}
      {selected === null ? (
        /* ── 설문 목록 ── */
        <main className="sv-main is-list">
          <button className="sv-back" onClick={() => navigate(`/club/${team.id}`)}>{t('common.back')}</button>

          <header className="sv-head">
            <span className="sv-tag">{team.name}</span>
            <h1 className="sv-title">{t('survey.listTitle')}</h1>
            <p className="sv-desc">{t('survey.listDesc')}</p>
          </header>

          <div className="sv-filters" role="group" aria-label={t('survey.listTitle')}>
            {STATUS_FILTERS.map(f => (
              <button key={f}
                className={`sv-filter${statusFilter === f ? ' on' : ''}`}
                onClick={() => setStatusFilter(f)}>
                {f === 'all' ? t('survey.filterAll') : f === 'open' ? t('survey.filterOngoing') : t('survey.filterClosed')}
              </button>
            ))}
          </div>

          {loading ? (
            <SkeletonList count={4} lines={2} />
          ) : visibleSurveys.length === 0 ? (
            <EmptyState
              icon="📋"
              title={t('empty.surveysTitle')}
              message={t('empty.surveysMsg')}
            />
          ) : (
            <div className="sv-grid">
              {visibleSurveys.map(s => {
                const open = s.status === 'open'
                const done = s.participated
                const clickable = open && !done
                const dday = s.dday === 0 ? 'D-DAY' : `D-${s.dday}`
                return (
                  <article
                    key={s.id}
                    className={`sv-card${clickable ? '' : ' is-closed'}`}
                    role={clickable ? 'button' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onClick={clickable ? () => openSurvey(s.id) : undefined}
                    onKeyDown={clickable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSurvey(s.id) } } : undefined}
                  >
                    <div className="sv-card-top">
                      <span className={`sv-card-status${clickable ? '' : ' closed'}`}>
                        {done ? t('survey.statusDone') : open ? t('survey.statusOpen') : t('survey.statusClosed')}
                      </span>
                      <span className="sv-card-dday">{open ? dday : t('survey.ddayEnded')}</span>
                    </div>
                    <h2 className="sv-card-title">{surveyTitle(s)}</h2>
                    <p className="sv-card-desc">{surveyDesc(s)}</p>
                    <div className="sv-card-meta">
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15 4.6a3 3 0 0 1 0 5.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <span>{t('survey.participants', { count: s.participants.toLocaleString() })}</span>
                    </div>
                    <button
                      type="button"
                      className="sv-card-cta"
                      disabled={!clickable}
                      onClick={clickable ? e => { e.stopPropagation(); openSurvey(s.id) } : undefined}
                    >
                      {done ? t('survey.statusDone') : open ? t('survey.join') : t('survey.statusClosed')}
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </main>
      ) : (
      <main className="sv-main">
        {submitted ? (
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
        ) : (
          <>
            <header className="sv-head">
              <span className="sv-tag">{t('survey.statusOpen')} · {selected.dday === 0 ? 'D-DAY' : `D-${selected.dday}`}</span>
              <h1 className="sv-title">{surveyTitle(selected)}</h1>
              <p className="sv-desc">{surveyDesc(selected)}</p>
            </header>

            <form className="sv-form" onSubmit={handleSubmit}>
              {/* Q1 */}
              <fieldset className="sv-q">
                <legend><span className="sv-qnum">Q1.</span> 홈 경기장 전반에 대한 만족도는 어떠신가요?</legend>
                <div className="sv-stars" role="radiogroup" aria-label="만족도 별점">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button type="button" key={n}
                      className={`sv-star${n <= satisfaction ? ' on' : ''}`}
                      aria-label={`${n}점`}
                      aria-pressed={n === satisfaction}
                      onClick={() => setSatisfaction(n)}>
                      <svg viewBox="0 0 24 24"><path d="M12 2l3 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.9 21l1.2-6.9-5-4.9 6.9-1z"/></svg>
                    </button>
                  ))}
                  <span className="sv-stars-label">{satisfaction ? `${satisfaction}점` : '선택해 주세요'}</span>
                </div>
              </fieldset>

              {/* Q2 */}
              <fieldset className="sv-q">
                <legend><span className="sv-qnum">Q2.</span> 가장 개선이 필요한 부분은 무엇인가요?</legend>
                <div className="sv-options">
                  {IMPROVE_OPTIONS.map(opt => (
                    <label key={opt} className={`sv-option${improve === opt ? ' on' : ''}`}>
                      <input type="radio" name="improve" value={opt}
                        checked={improve === opt} onChange={() => setImprove(opt)} />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Q3 */}
              <fieldset className="sv-q">
                <legend><span className="sv-qnum">Q3.</span> 다음 홈 경기에 다시 방문할 의향이 있으신가요?</legend>
                <div className="sv-options">
                  {REVISIT_OPTIONS.map(opt => (
                    <label key={opt} className={`sv-option${revisit === opt ? ' on' : ''}`}>
                      <input type="radio" name="revisit" value={opt}
                        checked={revisit === opt} onChange={() => setRevisit(opt)} />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Q4 */}
              <fieldset className="sv-q">
                <legend><span className="sv-qnum">Q4.</span> 구단에 전하고 싶은 의견을 자유롭게 남겨 주세요. <em>(선택)</em></legend>
                <textarea
                  className="sv-textarea"
                  placeholder="경기장, 응원 환경, 팬 서비스 등 자유롭게 작성해 주세요."
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={4}
                />
              </fieldset>

              <button type="submit" className="sv-submit">{t('survey.submit')}</button>
            </form>
          </>
        )}
      </main>
      )}
    </div>
  )
}
