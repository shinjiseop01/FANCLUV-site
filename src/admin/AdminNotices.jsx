import { useState, useEffect } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { TEAMS, getTeam, teamName } from '../teams.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Icon from '../components/Icon.jsx'
import {
  adminListNotices, createNotice, updateNotice, deleteNotice,
  setNoticeHidden, setNoticePinned,
} from '../lib/noticesRepo.js'

const EMPTY = { title: '', body: '', teamId: 'all', isImportant: false, startAt: '', endAt: '' }

export default function AdminNotices() {
  const { t, lang } = useLang()
  const [notices, setNotices] = useState([])
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    adminListNotices().then(list => { if (active) setNotices(list) })
    return () => { active = false }
  }, [])

  function openCreate() { setError(''); setForm({ ...EMPTY }) }
  function openEdit(n) {
    setError('')
    setForm({ id: n.id, title: n.title, body: n.body, teamId: n.teamId || 'all', isImportant: n.isImportant, startAt: n.startAt || '', endAt: n.endAt || '' })
  }
  function close() { setForm(null); setError('') }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError(t('admin.nt.errTitle')); return }
    if (!form.body.trim()) { setError(t('admin.nt.errBody')); return }
    if (form.startAt && form.endAt && form.endAt < form.startAt) { setError(t('admin.nt.errRange')); return }
    const payload = {
      title: form.title, body: form.body,
      teamId: form.teamId === 'all' ? null : form.teamId,
      isImportant: form.isImportant, startAt: form.startAt || null, endAt: form.endAt || null,
    }
    if (form.id) {
      const res = await updateNotice(form.id, payload)
      if (!res.ok) { setError(res.error || t('admin.nt.errTitle')); return }
      setNotices(list => list.map(n => (n.id === form.id ? res.notice : n)))
    } else {
      const res = await createNotice(payload)
      if (!res.ok) { setError(res.error || t('admin.nt.errTitle')); return }
      setNotices(list => [res.notice, ...list])
    }
    close()
  }

  async function togglePin(n) {
    const res = await setNoticePinned(n.id, !n.pinned)
    if (res.ok) setNotices(list => list.map(x => (x.id === n.id ? { ...x, pinned: !n.pinned } : x)))
  }
  async function toggleHide(n) {
    const res = await setNoticeHidden(n.id, !n.hidden)
    if (res.ok) setNotices(list => list.map(x => (x.id === n.id ? { ...x, hidden: !n.hidden } : x)))
  }
  async function remove(id) {
    const res = await deleteNotice(id)
    if (res.ok) setNotices(list => list.filter(n => n.id !== id))
  }

  const period = n => (n.startAt || n.endAt) ? `${n.startAt || '~'} → ${n.endAt || '~'}` : t('admin.nt.always')

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-head-row">
        <div>
          <h1 className="adm-h1">{t('admin.menu.notices')}</h1>
          <p className="adm-sub">{t('admin.nt.sub', { n: notices.length })}</p>
        </div>
        <button className="adm-btn-primary" onClick={openCreate}>+ {t('admin.nt.create')}</button>
      </header>

      {form && (
        <form className="adm-form" onSubmit={save}>
          <h2 className="adm-h2">{form.id ? t('admin.nt.editTitle') : t('admin.nt.createTitle')}</h2>
          <div className="adm-field">
            <label>{t('admin.nt.fTitle')}</label>
            <input className="adm-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder={t('admin.nt.fTitlePh')} maxLength={100} />
          </div>
          <div className="adm-field">
            <label>{t('admin.nt.fBody')}</label>
            <textarea className="adm-input" rows={4} value={form.body} onChange={e => set('body', e.target.value)} placeholder={t('admin.nt.fBodyPh')} maxLength={1000} />
          </div>
          <div className="adm-field-row">
            <div className="adm-field">
              <label>{t('admin.nt.fTarget')}</label>
              <select className="adm-input" value={form.teamId} onChange={e => set('teamId', e.target.value)}>
                <option value="all">{t('admin.nt.allTeams')}</option>
                {TEAMS.map(tm => <option key={tm.id} value={tm.id}>{teamName(tm, lang)}</option>)}
              </select>
            </div>
            <div className="adm-field adm-field-check">
              <label className="adm-check">
                <input type="checkbox" checked={form.isImportant} onChange={e => set('isImportant', e.target.checked)} />
                <span>{t('admin.nt.fImportant')}</span>
              </label>
            </div>
          </div>
          <div className="adm-field-row">
            <div className="adm-field">
              <label>{t('admin.nt.fStart')}</label>
              <input className="adm-input" type="date" value={form.startAt} onChange={e => set('startAt', e.target.value)} />
            </div>
            <div className="adm-field">
              <label>{t('admin.nt.fEnd')}</label>
              <input className="adm-input" type="date" value={form.endAt} onChange={e => set('endAt', e.target.value)} />
            </div>
          </div>
          {error && <div className="adm-error" role="alert"><Icon name="warningTriangle" size={14} className="fc-inline-ico" />{error}</div>}
          <div className="adm-form-actions">
            <button type="submit" className="adm-btn-primary">{form.id ? t('admin.save') : t('admin.nt.create')}</button>
            <button type="button" className="adm-btn-ghost" onClick={close}>{t('admin.cancel')}</button>
          </div>
        </form>
      )}

      {notices.length === 0 ? (
        <EmptyState iconName="megaphone" title={t('admin.nt.emptyTitle')} message={t('admin.nt.emptyMsg')} />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('admin.nt.colTitle')}</th>
                <th>{t('admin.nt.colTarget')}</th>
                <th>{t('admin.nt.colPeriod')}</th>
                <th>{t('admin.nt.colState')}</th>
                <th className="adm-col-actions">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {notices.map(n => (
                <tr key={n.id} className={n.hidden ? 'is-hidden' : ''}>
                  <td className="adm-cell-content">
                    {n.pinned && <span className="adm-badge pin"><Icon name="pin" size={12} /> {t('admin.nt.pinned')}</span>}
                    {n.isImportant && <span className="adm-badge important">{t('admin.nt.important')}</span>}
                    <span className="adm-cell-strong">{n.title}</span>
                  </td>
                  <td className="adm-cell-muted">{n.teamId ? (teamName(getTeam(n.teamId), lang) || n.teamId) : t('admin.nt.allTeams')}</td>
                  <td className="adm-cell-muted">{period(n)}</td>
                  <td>
                    <span className={`adm-badge ${n.hidden ? 'hidden' : 'active'}`}>
                      {n.hidden ? t('admin.nt.stHidden') : t('admin.nt.stVisible')}
                    </span>
                  </td>
                  <td className="adm-col-actions">
                    <div className="adm-actions">
                      <button className={`adm-btn-sm${n.pinned ? ' on' : ''}`} onClick={() => togglePin(n)}>
                        {n.pinned ? t('admin.nt.unpin') : t('admin.nt.pin')}
                      </button>
                      <button className="adm-btn-sm" onClick={() => toggleHide(n)}>
                        {n.hidden ? t('admin.show') : t('admin.hide')}
                      </button>
                      <button className="adm-btn-sm" onClick={() => openEdit(n)}>{t('admin.edit')}</button>
                      <button className="adm-btn-sm danger" onClick={() => remove(n.id)}>{t('admin.delete')}</button>
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
