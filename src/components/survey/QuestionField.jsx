// FANCLUV — 설문 질문 1개의 입력 UI (공용).
//
// 팬 참여 화면 · 빌더 미리보기 · (향후) Quick Poll 이 그대로 재사용한다.
// 질문 유형(question.type)에 따라 입력 UI 가 자동으로 바뀐다.
//
// props
//   question   : { type, title, help_text, required, allow_other, options, config }
//   value      : 현재 응답 값 (emptyAnswer(type) 형태)
//   onChange   : (nextValue) => void
//   otherText  : "기타" 자유입력 텍스트 (single/multi + allow_other)
//   onOther    : (text) => void
//   disabled   : 읽기 전용(미리보기/종료)
import { OTHER_VALUE } from '../../lib/surveys/questionTypes.js'
import './QuestionField.css'

export default function QuestionField({ question: q, value, onChange, otherText = '', onOther, disabled }) {
  const opts = q.options || []

  // ── 객관식(단일) ──
  if (q.type === 'single') {
    return (
      <div className="qf-options" role="radiogroup">
        {opts.map(o => (
          <label key={o.id} className={`qf-opt${value === o.id ? ' on' : ''}${disabled ? ' ro' : ''}`}>
            <input type="radio" name={`q_${q.id}`} checked={value === o.id} disabled={disabled}
              onChange={() => onChange(o.id)} />
            <span className="qf-dot" aria-hidden="true" />
            <span className="qf-opt-label">{o.label || ' '}</span>
          </label>
        ))}
        {q.allow_other && (
          <label className={`qf-opt${value === OTHER_VALUE ? ' on' : ''}${disabled ? ' ro' : ''}`}>
            <input type="radio" name={`q_${q.id}`} checked={value === OTHER_VALUE} disabled={disabled}
              onChange={() => onChange(OTHER_VALUE)} />
            <span className="qf-dot" aria-hidden="true" />
            <input type="text" className="qf-other-input" placeholder="기타…" value={otherText} disabled={disabled}
              onFocusCapture={() => onChange(OTHER_VALUE)} onChange={e => onOther?.(e.target.value)} />
          </label>
        )}
      </div>
    )
  }

  // ── 다중 선택 ──
  if (q.type === 'multi') {
    const arr = Array.isArray(value) ? value : []
    const toggle = (id) => onChange(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id])
    return (
      <div className="qf-options">
        {opts.map(o => (
          <label key={o.id} className={`qf-opt${arr.includes(o.id) ? ' on' : ''}${disabled ? ' ro' : ''}`}>
            <input type="checkbox" checked={arr.includes(o.id)} disabled={disabled} onChange={() => toggle(o.id)} />
            <span className="qf-box" aria-hidden="true" />
            <span className="qf-opt-label">{o.label || ' '}</span>
          </label>
        ))}
        {q.allow_other && (
          <label className={`qf-opt${arr.includes(OTHER_VALUE) ? ' on' : ''}${disabled ? ' ro' : ''}`}>
            <input type="checkbox" checked={arr.includes(OTHER_VALUE)} disabled={disabled} onChange={() => toggle(OTHER_VALUE)} />
            <span className="qf-box" aria-hidden="true" />
            <input type="text" className="qf-other-input" placeholder="기타…" value={otherText} disabled={disabled}
              onFocusCapture={() => { if (!arr.includes(OTHER_VALUE)) toggle(OTHER_VALUE) }}
              onChange={e => onOther?.(e.target.value)} />
          </label>
        )}
      </div>
    )
  }

  // ── 드롭다운 ──
  if (q.type === 'dropdown') {
    return (
      <select className="qf-select" value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value)}>
        <option value="" disabled>선택해 주세요</option>
        {opts.map(o => <option key={o.id} value={o.id}>{o.label || '(빈 선택지)'}</option>)}
      </select>
    )
  }

  // ── 별점 ──
  if (q.type === 'rating') {
    const max = q.config?.max || 5
    const cur = Number(value) || 0
    return (
      <div className="qf-stars" role="radiogroup">
        {Array.from({ length: max }, (_, i) => i + 1).map(n => (
          <button type="button" key={n} className={`qf-star${n <= cur ? ' on' : ''}`}
            disabled={disabled} aria-label={`${n}`} aria-pressed={n === cur} onClick={() => onChange(n)}>
            <svg viewBox="0 0 24 24"><path d="M12 2l3 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.9 21l1.2-6.9-5-4.9 6.9-1z" /></svg>
          </button>
        ))}
        <span className="qf-stars-val">{cur ? `${cur} / ${max}` : ''}</span>
      </div>
    )
  }

  // ── NPS (0~10) ──
  if (q.type === 'nps') {
    const cur = value === null || value === undefined || value === '' ? null : Number(value)
    return (
      <div className="qf-nps">
        <div className="qf-nps-row">
          {Array.from({ length: 11 }, (_, i) => i).map(n => (
            <button type="button" key={n} className={`qf-nps-btn${cur === n ? ' on' : ''}`}
              disabled={disabled} aria-pressed={cur === n} onClick={() => onChange(n)}>{n}</button>
          ))}
        </div>
        <div className="qf-nps-legend"><span>전혀 아니다</span><span>매우 그렇다</span></div>
      </div>
    )
  }

  // ── 예/아니오 ──
  if (q.type === 'yesno') {
    return (
      <div className="qf-yesno">
        {[['yes', '예'], ['no', '아니오']].map(([v, label]) => (
          <button type="button" key={v} className={`qf-yesno-btn${value === v ? ' on' : ''}`}
            disabled={disabled} aria-pressed={value === v} onClick={() => onChange(v)}>{label}</button>
        ))}
      </div>
    )
  }

  // ── 단답형 ──
  if (q.type === 'short') {
    return (
      <input type="text" className="qf-text" placeholder="답변을 입력해 주세요" value={value || ''}
        disabled={disabled} onChange={e => onChange(e.target.value)} />
    )
  }

  // ── 장문형 ──
  return (
    <textarea className="qf-textarea" rows={4} placeholder="답변을 입력해 주세요" value={value || ''}
      disabled={disabled} onChange={e => onChange(e.target.value)} />
  )
}
