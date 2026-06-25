import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TEAMS, TeamEmblem } from './teams.jsx'
import './TeamSelectPage.css'

export default function TeamSelectPage() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState(null)

  function handleStart() {
    if (!selected) return
    window.location.href = `/club/${selected}`
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
          <h1 className="ts-title">응원하는 구단을 선택해 주세요</h1>
          <p className="ts-subtitle">
            선택한 구단을 중심으로 의견 작성과 설문 참여가 진행됩니다.
            나중에 마이페이지에서 변경할 수 있습니다.
          </p>
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
                <span className="ts-card-name">{team.name}</span>
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
            <span>선택 완료하고 시작하기</span>
            <svg className="ts-cta-arrow" viewBox="0 0 20 20" fill="none">
              <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <button type="button" className="ts-back" onClick={handleBack}>← 이전으로</button>
        </div>

      </div>
    </div>
  )
}
