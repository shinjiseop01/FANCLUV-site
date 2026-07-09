import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext.jsx'
import Icon from '../components/Icon.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { getSurveyResults } from '../lib/surveysRepo.js'
import { aggregate, optionLabel, getType } from '../lib/surveys/questionTypes.js'
import { exportCsv } from '../lib/admin/csv.js'
import './SurveyResults.css'

// 응답 값을 사람이 읽을 수 있는 문자열로(CSV/텍스트 공용).
function formatAnswer(q, value) {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(v => optionLabel(q, v)).join(' | ')
  if (q.type === 'yesno') return value === 'yes' ? '예' : value === 'no' ? '아니오' : String(value)
  if (q.type === 'single' || q.type === 'dropdown') return optionLabel(q, value)
  return String(value)
}

export default function SurveyResults() {
  const { t } = useLang()
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    getSurveyResults(id).then(r => { if (active) { setData(r); setLoading(false) } })
    return () => { active = false }
  }, [id])

  function downloadCsv() {
    if (!data) return
    const cols = [
      { key: '_n', label: '#' },
      ...data.questions.filter(q => q.active !== false).map(q => ({ key: q.id, label: q.title || q.type })),
    ]
    const rows = (data.responseRows || []).map((r, i) => {
      const row = { _n: i + 1 }
      for (const q of data.questions) row[q.id] = formatAnswer(q, r.answers[q.id])
      return row
    })
    exportCsv(`fancluv_survey_${(data.survey.title || 'result').slice(0, 20)}`, cols, rows)
  }

  if (loading) return <div className="adm-page"><div className="adm-loading">{t('common.loading')}</div></div>
  if (!data) return <div className="adm-page"><EmptyState iconName="alert" title={t('admin.sv.notFound')} message="" /></div>

  const { survey, questions, answersByQuestion, responseCount } = data
  const activeQs = questions.filter(q => q.active !== false)

  return (
    <div className="adm-page sr-page">
      <header className="adm-page-head adm-head-row">
        <div>
          <button className="sb-back" onClick={() => navigate('/admin/surveys')}>
            <Icon name="chevron" size={15} style={{ transform: 'rotate(90deg)' }} /> {t('admin.sv.backList')}
          </button>
          <h1 className="adm-h1">{survey.title || t('admin.sv.untitled')}</h1>
          <p className="adm-sub">{t('admin.sv.resultsSub', { n: responseCount })}</p>
        </div>
        <div className="adm-head-actions">
          <button className="adm-btn-ghost adm-csv-btn" onClick={downloadCsv} disabled={responseCount === 0}>
            <Icon name="download" size={15} /> {t('admin.csv')}
          </button>
          <button className="adm-btn-ghost" onClick={() => navigate(`/admin/surveys/${id}/edit`)}>
            <Icon name="edit" size={15} /> {t('admin.edit')}
          </button>
        </div>
      </header>

      {responseCount === 0 ? (
        <EmptyState iconName="chart" title={t('admin.sv.noResponsesTitle')} message={t('admin.sv.noResponsesMsg')} />
      ) : (
        <div className="sr-list">
          {activeQs.map((q, i) => {
            const agg = aggregate(q, answersByQuestion[q.id] || [])
            return (
              <section key={q.id} className="sr-card">
                <div className="sr-q-head">
                  <span className="sr-qnum">Q{i + 1}</span>
                  <h2 className="sr-q-title">{q.title || t('admin.sv.untitled')}</h2>
                  <span className="sr-q-type"><Icon name={getType(q.type).icon} size={13} /> {t(getType(q.type).labelKey)}</span>
                </div>
                <ResultBody agg={agg} t={t} />
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ResultBody({ agg, t }) {
  if (agg.kind === 'rating') {
    const maxCount = Math.max(1, ...agg.dist.map(d => d.count))
    return (
      <div className="sr-body">
        <div className="sr-metric"><b>{agg.avg.toFixed(2)}</b><span>/ {agg.max} · {t('admin.sv.avgScore')}</span></div>
        <div className="sr-bars">
          {agg.dist.map(d => (
            <div key={d.label} className="sr-bar-row">
              <span className="sr-bar-key">{d.label}★</span>
              <div className="sr-bar-track"><div className="sr-bar-fill" style={{ width: `${(d.count / maxCount) * 100}%` }} /></div>
              <span className="sr-bar-val">{d.count}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (agg.kind === 'nps') {
    const maxCount = Math.max(1, ...agg.dist.map(d => d.count))
    return (
      <div className="sr-body">
        <div className="sr-nps-top">
          <div className="sr-metric"><b className={agg.score >= 0 ? 'pos' : 'neg'}>{agg.score > 0 ? '+' : ''}{agg.score}</b><span>NPS</span></div>
          <div className="sr-nps-seg">
            <span className="pro">{t('admin.sv.promoters')} {agg.promoters}</span>
            <span className="pas">{t('admin.sv.passives')} {agg.passives}</span>
            <span className="det">{t('admin.sv.detractors')} {agg.detractors}</span>
          </div>
        </div>
        <div className="sr-bars sr-bars-nps">
          {agg.dist.map(d => (
            <div key={d.label} className="sr-nps-col">
              <div className="sr-nps-bar" style={{ height: `${(d.count / maxCount) * 100}%` }} title={`${d.label}: ${d.count}`} />
              <span className="sr-nps-num">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (agg.kind === 'text') {
    return (
      <div className="sr-body">
        <div className="sr-text-count">{t('admin.sv.textResponses', { n: agg.total })}</div>
        <ul className="sr-text-list">
          {agg.responses.slice(0, 100).map((r, i) => <li key={i}>{r}</li>)}
        </ul>
        {agg.total === 0 && <p className="sr-empty">{t('admin.sv.noText')}</p>}
      </div>
    )
  }

  // choice
  const maxCount = Math.max(1, ...agg.buckets.map(b => b.count))
  return (
    <div className="sr-body">
      <div className="sr-bars">
        {agg.buckets.map(b => {
          const pct = agg.respondents ? Math.round((b.count / agg.respondents) * 100) : 0
          return (
            <div key={b.value} className="sr-bar-row">
              <span className="sr-bar-key wide" title={b.label}>{b.label}{b.other ? ` (${t('admin.sv.other')})` : ''}</span>
              <div className="sr-bar-track"><div className="sr-bar-fill" style={{ width: `${(b.count / maxCount) * 100}%` }} /></div>
              <span className="sr-bar-val">{b.count} · {pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
