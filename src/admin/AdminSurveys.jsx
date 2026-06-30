import { useState } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { MOCK_SURVEYS } from './adminData.js'

const EMPTY = { title: '', desc: '', question: '', endDate: '' }

export default function AdminSurveys() {
  const { t } = useLang()
  const { toast } = useToast()
  const [surveys, setSurveys] = useState(MOCK_SURVEYS)
  const [form, setForm] = useState(null)   // null=closed, {id?, ...fields}=open
  const [error, setError] = useState('')

  function openCreate() { setError(''); setForm({ ...EMPTY }) }
  function openEdit(s) { setError(''); setForm({ ...s }) }
  function close() { setForm(null); setError('') }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function save(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError(t('admin.sv.errTitle')); return }
    if (!form.question.trim()) { setError(t('admin.sv.errQuestion')); return }
    if (form.id) {
      setSurveys(list => list.map(s => (s.id === form.id ? { ...s, ...form } : s)))
      toast(t('admin.sv.updated'))
    } else {
      const id = 's' + Date.now()
      setSurveys(list => [{ ...form, id, status: 'open', responses: 0 }, ...list])
      toast(t('admin.sv.created'))
    }
    close()
  }

  function closeSurvey(id) {
    setSurveys(list => list.map(s => (s.id === id ? { ...s, status: 'closed' } : s)))
    toast(t('admin.sv.closedToast'))
  }

  function remove(id) {
    setSurveys(list => list.filter(s => s.id !== id))
    toast(t('admin.sv.deleted'))
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
        <EmptyState icon="📊" title={t('empty.surveysTitle')} message={t('empty.surveysMsg')} />
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
                    <button className="adm-btn-sm" onClick={() => openEdit(s)}>{t('admin.edit')}</button>
                    {s.status === 'open' && <button className="adm-btn-sm" onClick={() => closeSurvey(s.id)}>{t('admin.sv.closeBtn')}</button>}
                    <button className="adm-btn-sm danger" onClick={() => remove(s.id)}>{t('admin.delete')}</button>
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
