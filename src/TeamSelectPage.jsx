import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TEAMS, teamName, TeamEmblem } from './teams.jsx'
import { setSelectedTeam } from './lib/auth.js'
import { useLang } from './contexts/LanguageContext.jsx'
import './TeamSelectPage.css'

export default function TeamSelectPage() {
  const navigate = useNavigate()
  const { lang, t } = useLang()
  const [selected, setSelected] = useState(null)

  function handleStart() {
    if (!selected) return
    setSelectedTeam(selected) // 선택한 응원팀을 사용자 정보에 저장 (다음 로그인 시 바로 구단 홈으로)
    navigate(`/club/${selected}`)
  }

  function handleBack() {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  return (
    <div className="ts-root">
      <div className="ts-container">

        <header className="ts-header">
          <div className="ts-brand">FANCLUV</div>
          <h1 className="ts-title">{t('team.title')}</h1>
          <p className="ts-subtitle">{t('team.subtitle')}</p>
        </header>

        <div className="ts-grid" role="radiogroup" aria-label="응원 구단 선택">
          {TEAMS.map(team => {
            const isSelected = selected === team.id
            return (
              <button
                key={team.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`ts-card${isSelected ? ' ts-card--selected' : ''}`}
                onClick={() => setSelected(team.id)}
              >
                <span className="ts-check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                <TeamEmblem color={team.color} />
                <span className="ts-card-name">{teamName(team, lang)}</span>
              </button>
            )
          })}
        </div>

        <div className="ts-actions">
          <button
            type="button"
            className="ts-cta"
            disabled={!selected}
            onClick={handleStart}
          >
            <span>{t('team.cta')}</span>
            <svg className="ts-cta-arrow" viewBox="0 0 20 20" fill="none">
              <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <button type="button" className="ts-back" onClick={handleBack}>{t('team.back')}</button>
        </div>

      </div>
    </div>
  )
}
