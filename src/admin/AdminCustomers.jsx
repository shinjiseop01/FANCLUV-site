import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext.jsx'
import { TEAMS, getTeam } from '../teams.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { SkeletonList } from '../components/Skeleton.jsx'
import Icon from '../components/Icon.jsx'
import AdminNoteBox from './AdminNoteBox.jsx'
import {
  CONTRACT_STATUSES, SERVICE_PLANS,
  adminListCustomers, createCustomer, updateCustomer, deleteCustomer,
  listHistory, addHistory,
} from '../lib/admin/customersRepo.js'
import { adminListReports, listDeliveries } from '../lib/admin/clubReportsRepo.js'

const STATUS_CLS = { pilot: 'pending', negotiating: 'type', active: 'active', ended: 'inactive', terminated: 'rejected' }
const EMPTY = { teamId: TEAMS[0].id, status: 'pilot', plan: 'basic', startDate: '', endDate: '', contactName: '', contactEmail: '', contactTitle: '', contactPhone: '' }

export default function AdminCustomers() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [lastReportMap, setLastReportMap] = useState({})
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(null)
  const [createErr, setCreateErr] = useState('')
  const [edit, setEdit] = useState(null)
  const [history, setHistory] = useState([])
  const [histText, setHistText] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function reload() {
    const [list, deliveries, reps] = await Promise.all([adminListCustomers(), listDeliveries(), adminListReports()])
    const map = {}
    for (const d of deliveries) {
      if (!map[d.teamId] || String(d.deliveredAt) > String(map[d.teamId])) map[d.teamId] = d.deliveredAt
    }
    setCustomers(list); setLastReportMap(map); setReports(reps); setLoading(false)
  }
  useEffect(() => { reload() }, [])

  const statusLabel = s => t(`admin.cust.status.${s}`)
  const planLabel = p => t(`admin.cust.plan.${p}`)
  const fmt = iso => String(iso || '').slice(0, 10) || '-'
  const teamName = id => getTeam(id)?.name || id

  // ── 생성 ──
  function openCreate() { setCreateErr(''); setEdit(null); setCreating({ ...EMPTY }) }
  const setC = (k, v) => setCreating(c => ({ ...c, [k]: v }))
  async function submitCreate(e) {
    e.preventDefault(); setBusy(true); setCreateErr('')
    const res = await createCustomer(creating)
    setBusy(false)
    if (!res.ok) { setCreateErr(t('admin.cust.errCreate')); return }
    setCreating(null)
    setCustomers(list => [res.customer, ...list])
    openEdit(res.customer)
  }

  // ── 편집 ──
  function openEdit(c) {
    setCreating(null); setMsg('')
    setEdit({ ...c })
    listHistory(c.id).then(setHistory)
  }
  const setE = (k, v) => setEdit(s => ({ ...s, [k]: v }))
  const editing = edit && customers.find(c => c.id === edit.id)

  async function save() {
    setBusy(true); setMsg('')
    const res = await updateCustomer(edit.id, {
      status: edit.status, plan: edit.plan, startDate: edit.startDate, endDate: edit.endDate,
      contactName: edit.contactName, contactEmail: edit.contactEmail, contactTitle: edit.contactTitle, contactPhone: edit.contactPhone,
    }, editing)
    setBusy(false)
    if (res.ok) {
      setCustomers(list => list.map(c => (c.id === edit.id ? res.customer : c)))
      listHistory(edit.id).then(setHistory)
      setMsg(t('admin.cust.saved'))
    } else setMsg(res.error || t('admin.cust.errCreate'))
  }

  async function remove(id) {
    const res = await deleteCustomer(id)
    if (res.ok) { setCustomers(list => list.filter(c => c.id !== id)); if (edit?.id === id) setEdit(null) }
  }

  async function submitHistory(e) {
    e.preventDefault()
    if (!histText.trim()) return
    const res = await addHistory(edit.id, { description: histText })
    if (res.ok) { setHistText(''); setHistory(list => [res.entry, ...list]) }
  }

  const clubReports = editing ? reports.filter(r => r.teamId === editing.teamId) : []

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-head-row">
        <div>
          <h1 className="adm-h1">{t('admin.menu.customers')}</h1>
          <p className="adm-sub">{t('admin.cust.sub', { n: customers.length })}</p>
        </div>
        <button className="adm-btn-primary" onClick={openCreate}>+ {t('admin.cust.create')}</button>
      </header>

      {/* 생성 폼 */}
      {creating && (
        <form className="adm-form" onSubmit={submitCreate}>
          <h2 className="adm-h2">{t('admin.cust.createTitle')}</h2>
          <div className="adm-field-row">
            <div className="adm-field"><label>{t('admin.cust.fTeam')}</label>
              <select className="adm-input" value={creating.teamId} onChange={e => setC('teamId', e.target.value)}>
                {TEAMS.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </select>
            </div>
            <div className="adm-field"><label>{t('admin.cust.fStatus')}</label>
              <select className="adm-input" value={creating.status} onChange={e => setC('status', e.target.value)}>
                {CONTRACT_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>
            </div>
            <div className="adm-field"><label>{t('admin.cust.fPlan')}</label>
              <select className="adm-input" value={creating.plan} onChange={e => setC('plan', e.target.value)}>
                {SERVICE_PLANS.map(p => <option key={p} value={p}>{planLabel(p)}</option>)}
              </select>
            </div>
          </div>
          <div className="adm-field-row">
            <div className="adm-field"><label>{t('admin.cust.fStart')}</label>
              <input className="adm-input" type="date" value={creating.startDate} onChange={e => setC('startDate', e.target.value)} /></div>
            <div className="adm-field"><label>{t('admin.cust.fEnd')}</label>
              <input className="adm-input" type="date" value={creating.endDate} onChange={e => setC('endDate', e.target.value)} /></div>
          </div>
          <div className="adm-field-row">
            <div className="adm-field"><label>{t('admin.cust.cName')}</label>
              <input className="adm-input" value={creating.contactName} onChange={e => setC('contactName', e.target.value)} placeholder={t('admin.cust.cNamePh')} /></div>
            <div className="adm-field"><label>{t('admin.cust.cTitle')}</label>
              <input className="adm-input" value={creating.contactTitle} onChange={e => setC('contactTitle', e.target.value)} placeholder={t('admin.cust.cTitlePh')} /></div>
          </div>
          <div className="adm-field-row">
            <div className="adm-field"><label>{t('admin.cust.cEmail')}</label>
              <input className="adm-input" type="email" value={creating.contactEmail} onChange={e => setC('contactEmail', e.target.value)} placeholder="name@club.com" /></div>
            <div className="adm-field"><label>{t('admin.cust.cPhone')}</label>
              <input className="adm-input" value={creating.contactPhone} onChange={e => setC('contactPhone', e.target.value)} placeholder="02-000-0000" /></div>
          </div>
          {createErr && <div className="adm-error" role="alert">⚠ {createErr}</div>}
          <div className="adm-form-actions">
            <button type="submit" className="adm-btn-primary" disabled={busy}>{t('admin.cust.create')}</button>
            <button type="button" className="adm-btn-ghost" onClick={() => setCreating(null)}>{t('admin.cancel')}</button>
          </div>
        </form>
      )}

      {/* 목록 */}
      {loading ? (
        <SkeletonList count={5} lines={1} />
      ) : customers.length === 0 ? (
        <EmptyState iconName="users" title={t('admin.cust.emptyTitle')} message={t('admin.cust.emptyMsg')} />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('admin.cust.colClub')}</th>
                <th>{t('admin.cust.colContact')}</th>
                <th>{t('admin.cust.colStatus')}</th>
                <th>{t('admin.cust.colPlan')}</th>
                <th>{t('admin.cust.colStart')}</th>
                <th>{t('admin.cust.colEnd')}</th>
                <th>{t('admin.cust.colLastReport')}</th>
                <th className="adm-col-actions">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id} className={edit?.id === c.id ? 'is-selected' : ''}>
                  <td className="adm-cell-strong">{c.clubName || teamName(c.teamId)}</td>
                  <td className="adm-cell-muted">{c.contactName || '-'}</td>
                  <td><span className={`adm-badge ${STATUS_CLS[c.status]}`}>{statusLabel(c.status)}</span></td>
                  <td><span className="adm-badge type">{planLabel(c.plan)}</span></td>
                  <td className="adm-cell-muted">{fmt(c.startDate)}</td>
                  <td className="adm-cell-muted">{fmt(c.endDate)}</td>
                  <td className="adm-cell-muted">{fmt(lastReportMap[c.teamId])}</td>
                  <td className="adm-col-actions">
                    <div className="adm-actions">
                      <button className={`adm-btn-sm${edit?.id === c.id ? ' on' : ''}`} onClick={() => (edit?.id === c.id ? setEdit(null) : openEdit(c))}>{t('admin.cust.editBtn')}</button>
                      <button className="adm-btn-sm danger" onClick={() => remove(c.id)}>{t('admin.delete')}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 상세/편집 */}
      {editing && edit && (
        <section className="adm-panel adm-dash-section adm-report-edit">
          <div className="adm-panel-head">
            <h2 className="adm-panel-title">{t('admin.cust.detailTitle')} · {editing.clubName || teamName(editing.teamId)}</h2>
            <button className="adm-btn-sm" onClick={() => setEdit(null)}>{t('common.close')}</button>
          </div>

          {/* 계약 정보 */}
          <div className="adm-field-row">
            <div className="adm-field"><label>{t('admin.cust.fStatus')}</label>
              <select className="adm-input" value={edit.status} onChange={e => setE('status', e.target.value)}>
                {CONTRACT_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select></div>
            <div className="adm-field"><label>{t('admin.cust.fPlan')}</label>
              <select className="adm-input" value={edit.plan} onChange={e => setE('plan', e.target.value)}>
                {SERVICE_PLANS.map(p => <option key={p} value={p}>{planLabel(p)}</option>)}
              </select></div>
          </div>
          <div className="adm-field-row">
            <div className="adm-field"><label>{t('admin.cust.fStart')}</label>
              <input className="adm-input" type="date" value={edit.startDate || ''} onChange={e => setE('startDate', e.target.value)} /></div>
            <div className="adm-field"><label>{t('admin.cust.fEnd')}</label>
              <input className="adm-input" type="date" value={edit.endDate || ''} onChange={e => setE('endDate', e.target.value)} /></div>
          </div>

          {/* 담당자 */}
          <h3 className="adm-cust-subhead">{t('admin.cust.contact')}</h3>
          <div className="adm-field-row">
            <div className="adm-field"><label>{t('admin.cust.cName')}</label>
              <input className="adm-input" value={edit.contactName} onChange={e => setE('contactName', e.target.value)} /></div>
            <div className="adm-field"><label>{t('admin.cust.cTitle')}</label>
              <input className="adm-input" value={edit.contactTitle} onChange={e => setE('contactTitle', e.target.value)} /></div>
          </div>
          <div className="adm-field-row">
            <div className="adm-field"><label>{t('admin.cust.cEmail')}</label>
              <input className="adm-input" type="email" value={edit.contactEmail} onChange={e => setE('contactEmail', e.target.value)} /></div>
            <div className="adm-field"><label>{t('admin.cust.cPhone')}</label>
              <input className="adm-input" value={edit.contactPhone} onChange={e => setE('contactPhone', e.target.value)} /></div>
          </div>

          <div className="adm-form-actions">
            <button className="adm-btn-primary" onClick={save} disabled={busy}>{t('admin.save')}</button>
            {msg && <span className="adm-ai-msg" role="status">{msg}</span>}
          </div>

          {/* 리포트 연결 */}
          <h3 className="adm-cust-subhead">{t('admin.cust.reports')}</h3>
          <div className="adm-cust-reports">
            {clubReports.length === 0 ? (
              <p className="adm-notes-empty">{t('admin.cust.noReports')}</p>
            ) : (
              <ul className="adm-cust-report-list">
                {clubReports.slice(0, 5).map(r => (
                  <li key={r.id}>
                    <span className="adm-cell-strong">{r.title}</span>
                    <span className="adm-badge type">{r.periodLabel}</span>
                    <span className={`adm-badge ${r.status === 'delivered' ? 'delivered' : r.status === 'approved' ? 'active' : 'inactive'}`}>{t(`admin.rpt.status.${r.status}`)}</span>
                  </li>
                ))}
              </ul>
            )}
            <button className="adm-btn-ghost adm-csv-btn" onClick={() => navigate('/admin/report-docs')}>
              <Icon name="external" size={15} /> {t('admin.cust.goReports')}
            </button>
          </div>

          {/* 계약 이력 */}
          <h3 className="adm-cust-subhead">{t('admin.cust.history')}</h3>
          <form className="adm-notes-form" onSubmit={submitHistory}>
            <input className="adm-input" value={histText} onChange={e => setHistText(e.target.value)} placeholder={t('admin.cust.historyPh')} maxLength={200} />
            <button type="submit" className="adm-btn-sm primary" disabled={!histText.trim()}>{t('admin.cust.addHistory')}</button>
          </form>
          {history.length === 0 ? (
            <p className="adm-notes-empty">{t('admin.cust.noHistory')}</p>
          ) : (
            <ul className="adm-cust-history">
              {history.map(h => (
                <li key={h.id}>
                  <span className="adm-cust-hist-date">{h.date}</span>
                  <span className="adm-cust-hist-desc">{h.description}</span>
                </li>
              ))}
            </ul>
          )}

          {/* 운영자 메모 */}
          <AdminNoteBox entityType="customer" entityId={editing.id} />
        </section>
      )}
    </div>
  )
}
