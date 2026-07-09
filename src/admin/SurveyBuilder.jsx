import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext.jsx'
import Icon from '../components/Icon.jsx'
import QuestionField from '../components/survey/QuestionField.jsx'
import { TEAMS, teamName } from '../teams.jsx'
import {
  QUESTION_TYPES, getType, newQuestion, newOption,
  coerceQuestionType, typeHasOptions, emptyAnswer,
} from '../lib/surveys/questionTypes.js'
import { getSurveyForEdit, saveSurvey } from '../lib/surveysRepo.js'
import './SurveyBuilder.css'

export default function SurveyBuilder() {
  const { t, lang } = useLang()
  const { id } = useParams()
  const navigate = useNavigate()
  const editing = !!id

  const [meta, setMeta] = useState({ title: '', desc: '', teamId: '', isPublic: true, startDate: '', endDate: '' })
  const [status, setStatus] = useState('draft')
  const [responses, setResponses] = useState(0)
  const [questions, setQuestions] = useState([])
  const [collapsed, setCollapsed] = useState(new Set())
  const [preview, setPreview] = useState(false)
  const [previewAns, setPreviewAns] = useState({})
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(editing)

  const locked = responses > 0 // 응답 존재 → 구조 변경 제한

  useEffect(() => {
    if (!editing) { setQuestions([newQuestion('single')]); return }
    let active = true
    getSurveyForEdit(id).then(s => {
      if (!active) return
      if (!s) { setError(t('admin.sv.notFound')); setLoading(false); return }
      setMeta({ title: s.title, desc: s.desc, teamId: s.teamId || '', isPublic: s.isPublic, startDate: s.startDate, endDate: s.endDate })
      setStatus(s.status); setResponses(s.responses)
      setQuestions((s.questions || []).filter(q => q.active !== false))
      setLoading(false)
    })
    return () => { active = false }
  }, [id, editing])

  // ── 질문 조작 ──
  const setM = (k, v) => setMeta(m => ({ ...m, [k]: v }))
  const patchQ = (qid, patch) => setQuestions(qs => qs.map(q => (q.id === qid ? { ...q, ...patch } : q)))
  const isLocked = (q) => locked && q._persisted

  function addQuestion(type = 'single') {
    setQuestions(qs => [...qs, newQuestion(type)])
  }
  function duplicateQuestion(qid) {
    setQuestions(qs => {
      const i = qs.findIndex(q => q.id === qid)
      if (i < 0) return qs
      const src = qs[i]
      const copy = {
        ...src, id: newQuestion(src.type).id, _persisted: false,
        options: (src.options || []).map(o => ({ ...newOption(o.label) })),
      }
      const next = [...qs]; next.splice(i + 1, 0, copy); return next
    })
  }
  function deleteQuestion(qid) {
    setQuestions(qs => (qs.length <= 1 ? qs : qs.filter(q => q.id !== qid)))
  }
  function changeType(qid, type) {
    setQuestions(qs => qs.map(q => (q.id === qid ? coerceQuestionType(q, type) : q)))
  }
  function toggleCollapse(qid) {
    setCollapsed(c => { const n = new Set(c); if (n.has(qid)) n.delete(qid); else n.add(qid); return n })
  }

  // ── 선택지 조작 ──
  const addOption = (qid) => setQuestions(qs => qs.map(q => q.id === qid ? { ...q, options: [...q.options, newOption('')] } : q))
  const updateOption = (qid, oid, label) => setQuestions(qs => qs.map(q => q.id === qid ? { ...q, options: q.options.map(o => o.id === oid ? { ...o, label } : o) } : q))
  const deleteOption = (qid, oid) => setQuestions(qs => qs.map(q => q.id === qid ? { ...q, options: q.options.length <= 1 ? q.options : q.options.filter(o => o.id !== oid) } : q))
  const moveOption = (qid, idx, dir) => setQuestions(qs => qs.map(q => {
    if (q.id !== qid) return q
    const arr = [...q.options]; const j = idx + dir
    if (j < 0 || j >= arr.length) return q
    ;[arr[idx], arr[j]] = [arr[j], arr[idx]]; return { ...q, options: arr }
  }))

  // ── 질문 드래그 정렬 ──
  function onDrop(target) {
    if (dragIdx === null || dragIdx === target) { setDragIdx(null); setOverIdx(null); return }
    setQuestions(qs => {
      const next = [...qs]; const [m] = next.splice(dragIdx, 1); next.splice(target, 0, m); return next
    })
    setDragIdx(null); setOverIdx(null)
  }

  // ── 저장 ──
  function validate() {
    if (!meta.title.trim()) return t('admin.sv.errTitle')
    if (questions.length === 0) return t('admin.sv.errNoQuestion')
    for (const q of questions) {
      if (!q.title.trim()) return t('admin.sv.errQTitle')
      if (typeHasOptions(q.type) && q.options.filter(o => o.label.trim()).length < 1) return t('admin.sv.errQOption')
    }
    return ''
  }
  async function handleSave(nextStatus) {
    const err = validate()
    if (err) { setError(err); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setError(''); setSaving(true)
    const payload = {
      id: editing ? id : undefined, ...meta, teamId: meta.teamId || null,
      status: nextStatus, publishedKeep: status === 'published',
      questions: questions.map((q, i) => ({ ...q, position: i })),
    }
    const res = await saveSurvey(payload)
    setSaving(false)
    if (!res.ok) { setError(res.error || t('admin.sv.errSave')); return }
    navigate('/admin/surveys')
  }

  if (loading) return <div className="adm-page"><div className="adm-loading">{t('common.loading')}</div></div>

  return (
    <div className="adm-page sb-page">
      <header className="adm-page-head adm-head-row">
        <div>
          <button className="sb-back" onClick={() => navigate('/admin/surveys')}>
            <Icon name="chevron" size={15} style={{ transform: 'rotate(90deg)' }} /> {t('admin.sv.backList')}
          </button>
          <h1 className="adm-h1">{editing ? t('admin.sv.editTitle') : t('admin.sv.createTitle')}</h1>
        </div>
        <div className="adm-head-actions">
          <button className="adm-btn-ghost" onClick={() => setPreview(p => !p)}>
            <Icon name="eye" size={15} /> {preview ? t('admin.sv.editMode') : t('admin.sv.preview')}
          </button>
        </div>
      </header>

      {error && <div className="adm-error" role="alert">⚠ {error}</div>}
      {locked && <div className="sb-lock-note"><Icon name="alert" size={15} /> {t('admin.sv.lockNote')}</div>}

      {preview ? (
        <PreviewPane meta={meta} questions={questions} answers={previewAns} setAnswers={setPreviewAns} t={t} />
      ) : (
        <>
          {/* ── 설문 설정 카드 ── */}
          <section className="sb-card sb-meta">
            <div className="adm-field">
              <label>{t('admin.sv.fTitle')}</label>
              <input className="adm-input sb-title-input" value={meta.title} onChange={e => setM('title', e.target.value)} placeholder={t('admin.sv.fTitlePh')} />
            </div>
            <div className="adm-field">
              <label>{t('admin.sv.fDesc')}</label>
              <textarea className="adm-input" rows={2} value={meta.desc} onChange={e => setM('desc', e.target.value)} placeholder={t('admin.sv.fDescPh')} />
            </div>
            <div className="sb-meta-grid">
              <div className="adm-field">
                <label>{t('admin.sv.fTeam')}</label>
                <select className="adm-input" value={meta.teamId} onChange={e => setM('teamId', e.target.value)}>
                  <option value="">{t('admin.sv.allTeams')}</option>
                  {TEAMS.map(tm => <option key={tm.id} value={tm.id}>{teamName(tm, lang)}</option>)}
                </select>
              </div>
              <div className="adm-field">
                <label>{t('admin.sv.fStart')}</label>
                <input className="adm-input" type="date" value={meta.startDate} onChange={e => setM('startDate', e.target.value)} />
              </div>
              <div className="adm-field">
                <label>{t('admin.sv.fEnd')}</label>
                <input className="adm-input" type="date" value={meta.endDate} onChange={e => setM('endDate', e.target.value)} />
              </div>
            </div>
            <label className="sb-switch">
              <input type="checkbox" checked={meta.isPublic} onChange={e => setM('isPublic', e.target.checked)} />
              <span className="sb-switch-track"><span className="sb-switch-thumb" /></span>
              <span>{t('admin.sv.fPublic')}</span>
            </label>
          </section>

          {/* ── 질문 목록 ── */}
          <div className="sb-questions">
            {questions.map((q, i) => {
              const meta0 = getType(q.type)
              const isC = collapsed.has(q.id)
              const lockQ = isLocked(q)
              return (
                <section
                  key={q.id}
                  className={`sb-card sb-q${dragIdx === i ? ' dragging' : ''}${overIdx === i ? ' over' : ''}`}
                  draggable={!lockQ}
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={e => { e.preventDefault(); setOverIdx(i) }}
                  onDrop={() => onDrop(i)}
                  onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
                >
                  <div className="sb-q-head">
                    <span className="sb-drag" title={t('admin.sv.dragHint')}><Icon name="grip" size={16} /></span>
                    <span className="sb-qnum">Q{i + 1}</span>
                    <input className="sb-q-title" value={q.title} placeholder={t('admin.sv.qTitlePh')}
                      onChange={e => patchQ(q.id, { title: e.target.value })} />
                    <select className="sb-q-type" value={q.type} disabled={lockQ}
                      onChange={e => changeType(q.id, e.target.value)}>
                      {QUESTION_TYPES.map(tp => <option key={tp.type} value={tp.type}>{t(tp.labelKey)}</option>)}
                    </select>
                    <button className="sb-icon-btn" title={isC ? t('admin.sv.expand') : t('admin.sv.collapse')} onClick={() => toggleCollapse(q.id)}>
                      <Icon name={isC ? 'chevron' : 'chevronUp'} size={16} />
                    </button>
                  </div>

                  {!isC && (
                    <div className="sb-q-body">
                      <div className="sb-q-type-hint"><Icon name={meta0.icon} size={14} /> {t(meta0.descKey)}</div>

                      {/* 선택지 편집 */}
                      {typeHasOptions(q.type) && (
                        <div className="sb-options">
                          {q.options.map((o, oi) => (
                            <div key={o.id} className="sb-opt-row">
                              <span className="sb-opt-mark" aria-hidden="true">
                                {q.type === 'multi' ? '☐' : q.type === 'dropdown' ? `${oi + 1}.` : '○'}
                              </span>
                              <input className="sb-opt-input" value={o.label} placeholder={t('admin.sv.optionPh', { n: oi + 1 })}
                                disabled={lockQ} onChange={e => updateOption(q.id, o.id, e.target.value)} />
                              {!lockQ && (
                                <div className="sb-opt-actions">
                                  <button className="sb-icon-btn sm" title={t('admin.sv.moveUp')} disabled={oi === 0} onClick={() => moveOption(q.id, oi, -1)}><Icon name="chevronUp" size={14} /></button>
                                  <button className="sb-icon-btn sm" title={t('admin.sv.moveDown')} disabled={oi === q.options.length - 1} onClick={() => moveOption(q.id, oi, 1)}><Icon name="chevron" size={14} /></button>
                                  <button className="sb-icon-btn sm" title={t('admin.delete')} disabled={q.options.length <= 1} onClick={() => deleteOption(q.id, o.id)}><Icon name="close" size={14} /></button>
                                </div>
                              )}
                            </div>
                          ))}
                          {!lockQ && (
                            <button className="sb-add-opt" onClick={() => addOption(q.id)}><Icon name="plus" size={14} /> {t('admin.sv.addOption')}</button>
                          )}
                        </div>
                      )}

                      {/* 도움말 */}
                      <div className="adm-field sb-help-field">
                        <label>{t('admin.sv.fHelp')}</label>
                        <input className="adm-input" value={q.help_text} placeholder={t('admin.sv.fHelpPh')}
                          onChange={e => patchQ(q.id, { help_text: e.target.value })} />
                      </div>

                      {/* 유형별 설정 */}
                      {q.type === 'rating' && (
                        <div className="adm-field sb-help-field">
                          <label>{t('admin.sv.fMax')}</label>
                          <select className="adm-input sb-max" value={q.config?.max || 5} disabled={lockQ}
                            onChange={e => patchQ(q.id, { config: { ...q.config, max: Number(e.target.value) } })}>
                            {[3, 5, 7, 10].map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                      )}

                      {/* 질문 하단 툴바 */}
                      <div className="sb-q-foot">
                        <label className="sb-switch sm">
                          <input type="checkbox" checked={q.required} onChange={e => patchQ(q.id, { required: e.target.checked })} />
                          <span className="sb-switch-track"><span className="sb-switch-thumb" /></span>
                          <span>{t('admin.sv.required')}</span>
                        </label>
                        {(q.type === 'single' || q.type === 'multi') && (
                          <label className="sb-switch sm">
                            <input type="checkbox" checked={q.allow_other} disabled={lockQ} onChange={e => patchQ(q.id, { allow_other: e.target.checked })} />
                            <span className="sb-switch-track"><span className="sb-switch-thumb" /></span>
                            <span>{t('admin.sv.allowOther')}</span>
                          </label>
                        )}
                        <div className="sb-q-foot-actions">
                          <button className="sb-icon-btn" title={t('admin.sv.duplicate')} onClick={() => duplicateQuestion(q.id)}><Icon name="copy" size={16} /></button>
                          <button className="sb-icon-btn danger" title={t('admin.delete')} disabled={lockQ || questions.length <= 1} onClick={() => deleteQuestion(q.id)}><Icon name="trash" size={16} /></button>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              )
            })}
          </div>

          {/* ── 질문 추가 팔레트 ── */}
          <div className="sb-palette">
            <span className="sb-palette-label">{t('admin.sv.addQuestion')}</span>
            <div className="sb-palette-grid">
              {QUESTION_TYPES.map(tp => (
                <button key={tp.type} className="sb-palette-btn" onClick={() => addQuestion(tp.type)}>
                  <Icon name={tp.icon} size={16} /> {t(tp.labelKey)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── 하단 저장 바 ── */}
      <div className="sb-actionbar">
        <span className="sb-count">{t('admin.sv.qCount', { n: questions.length })}</span>
        <div className="sb-actionbar-btns">
          <button className="adm-btn-ghost" disabled={saving} onClick={() => handleSave('draft')}>{t('admin.sv.saveDraft')}</button>
          {status === 'closed'
            ? <button className="adm-btn-primary" disabled={saving} onClick={() => handleSave('published')}>{t('admin.sv.reopen')}</button>
            : <button className="adm-btn-primary" disabled={saving} onClick={() => handleSave('published')}>{t('admin.sv.publish')}</button>}
          {status === 'published' && (
            <button className="adm-btn-ghost" disabled={saving} onClick={() => handleSave('closed')}>{t('admin.sv.closeBtn')}</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 미리보기(팬 화면과 동일한 렌더러) ──
function PreviewPane({ meta, questions, answers, setAnswers, t }) {
  const set = (qid, v) => setAnswers(a => ({ ...a, [qid]: v }))
  const setOther = (qid, v) => setAnswers(a => ({ ...a, [`${qid}__other`]: v }))
  return (
    <div className="sb-preview">
      <div className="sb-preview-badge">{t('admin.sv.previewBadge')}</div>
      <h2 className="sb-preview-title">{meta.title || t('admin.sv.untitled')}</h2>
      {meta.desc && <p className="sb-preview-desc">{meta.desc}</p>}
      <div className="sb-preview-qs">
        {questions.map((q, i) => (
          <div key={q.id} className="sb-preview-q">
            <div className="sb-preview-q-title">
              <span className="sb-preview-qnum">Q{i + 1}.</span> {q.title || t('admin.sv.qTitlePh')}
              {q.required && <span className="sb-req">*</span>}
            </div>
            {q.help_text && <p className="sb-preview-help">{q.help_text}</p>}
            <QuestionField question={q} value={answers[q.id] ?? emptyAnswer(q.type)}
              otherText={answers[`${q.id}__other`] || ''} onOther={v => setOther(q.id, v)}
              onChange={v => set(q.id, v)} />
          </div>
        ))}
      </div>
    </div>
  )
}
