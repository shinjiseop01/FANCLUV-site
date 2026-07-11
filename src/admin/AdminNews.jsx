import { useState, useEffect } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { TEAMS, getTeam, teamName } from '../teams.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Pagination from '../components/Pagination.jsx'
import { usePagination } from '../lib/usePagination.js'
import Icon from '../components/Icon.jsx'
import { adminListNews, createNews, updateNews, deleteNews } from '../lib/newsRepo.js'

const EMPTY = { title: '', content: '', team: TEAMS[0].id, image: '' }

export default function AdminNews() {
  const { t, lang } = useLang()
  const [news, setNews] = useState([])
  const { paged, page, total, setPage } = usePagination(news, 20)
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')

  // 뉴스 목록 로드 (Supabase 우선, 아니면 Mock — newsRepo)
  useEffect(() => {
    let active = true
    adminListNews().then(list => { if (active) setNews(list) })
    return () => { active = false }
  }, [])

  function openCreate() { setError(''); setForm({ ...EMPTY }) }
  function openEdit(n) { setError(''); setForm({ ...n }) }
  function close() { setForm(null); setError('') }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError(t('admin.nw.errTitle')); return }
    if (!form.content.trim()) { setError(t('admin.nw.errContent')); return }
    if (form.id) {
      const res = await updateNews(form.id, form)
      if (!res.ok) { setError(res.error || t('admin.nw.errTitle')); return }
      setNews(list => list.map(n => (n.id === form.id ? res.news : n)))
    } else {
      const res = await createNews(form)
      if (!res.ok) { setError(res.error || t('admin.nw.errTitle')); return }
      setNews(list => [res.news, ...list])
    }
    close()
  }

  async function remove(id) {
    const res = await deleteNews(id)
    if (res.ok) setNews(list => list.filter(n => n.id !== id))
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
                {TEAMS.map(tm => <option key={tm.id} value={tm.id}>{teamName(tm, lang)}</option>)}
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
        <EmptyState iconName="news" title={t('empty.newsTitle')} message={t('empty.newsMsg')} />
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
              {paged.map(n => {
                const team = getTeam(n.team)
                return (
                  <tr key={n.id}>
                    <td>
                      <div className="adm-thumb" style={{ backgroundImage: n.image ? `url(${n.image})` : 'none' }}>
                        {!n.image && <Icon name="image" size={18} />}
                      </div>
                    </td>
                    <td className="adm-cell-strong">{n.title}</td>
                    <td className="adm-cell-muted">{team ? teamName(team, lang) : '-'}</td>
                    <td className="adm-cell-muted">{n.date}</td>
                    <td className="adm-col-actions">
                      <div className="adm-actions">
                        <button className="adm-btn-sm" onClick={() => openEdit(n)}>{t('admin.edit')}</button>
                        <button className="adm-btn-sm danger" onClick={() => remove(n.id)}>{t('admin.delete')}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination page={page} total={total} onChange={setPage} />
        </div>
      )}
    </div>
  )
}
