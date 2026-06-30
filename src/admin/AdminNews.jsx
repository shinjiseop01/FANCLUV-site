import { useState } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { TEAMS, getTeam } from '../teams.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { MOCK_NEWS } from './adminData.js'

const EMPTY = { title: '', content: '', team: TEAMS[0].id, image: '' }

export default function AdminNews() {
  const { t } = useLang()
  const { toast } = useToast()
  const [news, setNews] = useState(MOCK_NEWS)
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')

  function openCreate() { setError(''); setForm({ ...EMPTY }) }
  function openEdit(n) { setError(''); setForm({ ...n }) }
  function close() { setForm(null); setError('') }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function save(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError(t('admin.nw.errTitle')); return }
    if (!form.content.trim()) { setError(t('admin.nw.errContent')); return }
    if (form.id) {
      setNews(list => list.map(n => (n.id === form.id ? { ...n, ...form } : n)))
      toast(t('admin.nw.updated'))
    } else {
      const today = new Date().toISOString().slice(0, 10)
      setNews(list => [{ ...form, id: 'n' + Date.now(), date: today }, ...list])
      toast(t('admin.nw.created'))
    }
    close()
  }

  function remove(id) {
    setNews(list => list.filter(n => n.id !== id))
    toast(t('admin.nw.deleted'))
  }

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-head-row">
        <div>
          <h1 className="adm-h1">{t('admin.menu.news')}</h1>
          <p className="adm-sub">{t('admin.nw.sub', { n: news.length })}</p>
        </div>
        <button className="adm-btn-primary" onClick={openCreate}>+ {t('admin.nw.create')}</button>
      </header>

      {form && (
        <form className="adm-form" onSubmit={save}>
          <h2 className="adm-h2">{form.id ? t('admin.nw.editTitle') : t('admin.nw.createTitle')}</h2>
          <div className="adm-field">
            <label>{t('admin.nw.fTitle')}</label>
            <input className="adm-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder={t('admin.nw.fTitlePh')} />
          </div>
          <div className="adm-field">
            <label>{t('admin.nw.fContent')}</label>
            <textarea className="adm-input" rows={3} value={form.content} onChange={e => set('content', e.target.value)} placeholder={t('admin.nw.fContentPh')} />
          </div>
          <div className="adm-field-row">
            <div className="adm-field">
              <label>{t('admin.nw.fTeam')}</label>
              <select className="adm-input" value={form.team} onChange={e => set('team', e.target.value)}>
                {TEAMS.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </select>
            </div>
            <div className="adm-field">
              <label>{t('admin.nw.fImage')}</label>
              <input className="adm-input" value={form.image} onChange={e => set('image', e.target.value)} placeholder="https://..." />
            </div>
          </div>
          {error && <div className="adm-error" role="alert">⚠ {error}</div>}
          <div className="adm-form-actions">
            <button type="submit" className="adm-btn-primary">{form.id ? t('admin.save') : t('admin.nw.create')}</button>
            <button type="button" className="adm-btn-ghost" onClick={close}>{t('admin.cancel')}</button>
          </div>
        </form>
      )}

      {news.length === 0 ? (
        <EmptyState icon="📰" title={t('empty.newsTitle')} message={t('empty.newsMsg')} />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('admin.nw.colImage')}</th>
                <th>{t('admin.nw.colTitle')}</th>
                <th>{t('admin.nw.colTeam')}</th>
                <th>{t('admin.nw.colDate')}</th>
                <th className="adm-col-actions">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {news.map(n => {
                const team = getTeam(n.team)
                return (
                  <tr key={n.id}>
                    <td>
                      <div className="adm-thumb" style={{ backgroundImage: n.image ? `url(${n.image})` : 'none' }}>
                        {!n.image && '🖼'}
                      </div>
                    </td>
                    <td className="adm-cell-strong">{n.title}</td>
                    <td className="adm-cell-muted">{team ? team.name : '-'}</td>
                    <td className="adm-cell-muted">{n.date}</td>
                    <td className="adm-col-actions">
                      <button className="adm-btn-sm" onClick={() => openEdit(n)}>{t('admin.edit')}</button>
                      <button className="adm-btn-sm danger" onClick={() => remove(n.id)}>{t('admin.delete')}</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
