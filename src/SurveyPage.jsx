import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getTeam, TeamEmblem } from './teams.jsx'
import './ClubHomePage.css'
import './SurveyPage.css'

const NICKNAME = '민준'
const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']

const IMPROVE_OPTIONS = ['좌석 / 시야', '편의시설', '먹거리 / 매점', '접근성 / 교통', '응원 환경', '기타']
const REVISIT_OPTIONS = ['매우 그렇다', '그렇다', '보통이다', '아니다']

export default function SurveyPage() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const [lang, setLang] = useState('ko')

  const [satisfaction, setSatisfaction] = useState(0)
  const [improve, setImprove] = useState('')
  const [revisit, setRevisit] = useState('')
  const [comment, setComment] = useState('')
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
    setSubmitted(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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
            <span className="ch-user">{NICKNAME}님</span>
            <button className="ch-icon-btn" title="설정" aria-label="설정">
              <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.4"/></svg>
            </button>
            <button className="ch-logout" onClick={() => navigate('/')}>로그아웃</button>
          </div>
        </div>
        <nav className="ch-nav" aria-label="메인 메뉴">
          {MENU.map(item => {
            const active = item === '설문'
            return (
              <a key={item} href="#" className={`ch-nav-item${active ? ' on' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={e => {
                  e.preventDefault()
                  if (item === '홈') navigate(`/club/${team.id}`)
                  else if (item === '팬 의견') navigate(`/club/${team.id}/opinions`)
                }}>
                {item}
              </a>
            )
          })}
        </nav>
      </header>

      {/* ── Main ── */}
      <main className="sv-main">
        <button className="sv-back" onClick={() => navigate(`/club/${team.id}`)}>← 뒤로가기</button>

        {submitted ? (
          <div className="sv-done">
            <div className="sv-done-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <h1>설문에 참여해 주셔서 감사합니다</h1>
            <p>여러분의 소중한 의견은 분석을 거쳐 {team.name} 구단에 전달됩니다.</p>
            <div className="sv-done-actions">
              <button className="sv-btn-primary" onClick={() => navigate(`/club/${team.id}`)}>홈으로 돌아가기</button>
              <button className="sv-btn-ghost" onClick={() => navigate(`/club/${team.id}/opinions`)}>팬 의견 보러 가기</button>
            </div>
          </div>
        ) : (
          <>
            <header className="sv-head">
              <span className="sv-tag">참여 가능 · D-5</span>
              <h1 className="sv-title">2026 시즌 홈 경기장 시설 만족도 조사</h1>
              <p className="sv-desc">
                {team.name}의 홈 경기 관람 환경에 대한 의견을 들려주세요.
                설문 결과는 분석을 거쳐 구단에 전달됩니다. 약 1분 소요됩니다.
              </p>
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

              <button type="submit" className="sv-submit">설문 제출하기</button>
            </form>
          </>
        )}
      </main>
    </div>
  )
}
