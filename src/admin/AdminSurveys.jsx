import { useState, useEffect } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import EmptyState from '../components/EmptyState.jsx'
import {
  adminListSurveys, createSurvey, updateSurvey,
  closeSurvey as closeSurveyApi, deleteSurvey,
} from '../lib/surveysRepo.js'

const EMPTY = { title: '', desc: '', question: '', endDate: '' }

export default function AdminSurveys() {
  const { t } = useLang()
  const [surveys, setSurveys] = useState([])
  const [form, setForm] = useState(null)   // null=closed, {id?, ...fields}=open
  const [error, setError] = useState('')

  // 설문 목록 로드 (Supabase 우선, 아니면 Mock — surveysRepo)
  useEffect(() => {
    let active = true
    adminListSurveys().then(list => { if (active) setSurveys(list) })
    return () => { active = false }
  }, [])

  function openCreate() { setError(''); setForm({ ...EMPTY }) }
  function openEdit(s) { setError(''); setForm({ ...s }) }
  function close() { setForm(null); setError('') }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError(t('admin.sv.errTitle')); return }
    if (!form.question.trim()) { setError(t('admin.sv.errQuestion')); return }
    if (form.id) {
      const res = await updateSurvey(form.id, form)
      if (!res.ok) { setError(res.error || t('admin.sv.errTitle')); return }
      setSurveys(list => list.map(s => (s.id === form.id ? res.survey : s)))
    } else {
      const res = await createSurvey(form)
      if (!res.ok) { setError(res.error || t('admin.sv.errTitle')); return }
      setSurveys(list => [res.survey, ...list])
    }
    close()
  }

  async function closeSurvey(id) {
    const res = await closeSurveyApi(id)
    if (res.ok) setSurveys(list => list.map(s => (s.id === id ? { ...s, status: 'closed' } : s)))
  }

  async function remove(id) {
    const res = await deleteSurvey(id)
    if (res.ok) setSurveys(list => list.filter(s => s.id !== id))
  }

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-head-row">
        <div>
          <h1 className="adm-h1">{t('admin.menu.surveys')}</h1>
          <p className="adm-sub">{t('admin.sv.sub', { n: surveys.length })}</p>
        </div>
        <button className="adm-btn-primary" onClick={openCreate}>+ {t('admin.sv.create')}</button>
      </header>

      {form && (
        <form className="adm-form" onSubmit={save}>
          <h2 className="adm-h2">{form.id ? t('admin.sv.editTitle') : t('admin.sv.createTitle')}</h2>
          <div className="adm-field">
            <label>{t('admin.sv.fTitle')}</label>
            <input className="adm-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder={t('admin.sv.fTitlePh')} />
          </div>
          <div className="adm-field">
            <label>{t('admin.sv.fDesc')}</label>
            <textarea className="adm-input" rows={2} value={form.desc} onChange={e => set('desc', e.target.value)} placeholder={t('admin.sv.fDescPh')} />
          </div>
          <div className="adm-field">
            <label>{t('admin.sv.fQuestion')}</label>
            <input className="adm-input" value={form.question} onChange={e => set('question', e.target.value)} placeholder={t('admin.sv.fQuestionPh')} />
          </div>
          <div className="adm-field">
            <label>{t('admin.sv.fEnd')}</label>
            <input className="adm-input" type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
          </div>
          {error && <div className="adm-error" role="alert">⚠ {error}</div>}
          <div className="adm-form-actions">
            <button type="submit" className="adm-btn-primary">{form.id ? t('admin.save') : t('admin.sv.create')}</button>
            <button type="button" className="adm-btn-ghost" onClick={close}>{t('admin.cancel')}</button>
          </div>
        </form>
      )}

      {surveys.length === 0 ? (
        <EmptyState iconName="survey" title={t('empty.surveysTitle')} message={t('empty.surveysMsg')} />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('admin.sv.colTitle')}</th>
                <th>{t('admin.sv.colEnd')}</th>
                <th>{t('admin.sv.colResponses')}</th>
                <th>{t('admin.sv.colStatus')}</th>
                <th className="adm-col-actions">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {surveys.map(s => (
                <tr key={s.id}>
                  <td className="adm-cell-strong">{s.title}</td>
                  <td className="adm-cell-muted">{s.endDate || '-'}</td>
                  <td>{s.responses.toLocaleString()}</td>
                  <td>
                    <span className={`adm-badge ${s.status === 'open' ? 'active' : 'hidden'}`}>
                      {s.status === 'open' ? t('admin.sv.open') : t('admin.sv.closed')}
                    </span>
                  </td>
                  <td className="adm-col-actions">
                    <div className="adm-actions">
                      <button className="adm-btn-sm" onClick={() => openEdit(s)}>{t('admin.edit')}</button>
                      {s.status === 'open' && <button className="adm-btn-sm" onClick={() => closeSurvey(s.id)}>{t('admin.sv.closeBtn')}</button>}
                      <button className="adm-btn-sm danger" onClick={() => remove(s.id)}>{t('admin.delete')}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
