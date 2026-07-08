import { useState, useEffect, useCallback, Fragment } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { TEAMS, getTeam, teamName } from '../teams.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { SkeletonList } from '../components/Skeleton.jsx'
import Icon from '../components/Icon.jsx'
import {
  ACTION_CATEGORIES, ACTION_STATUSES,
  adminListActions, createAction, updateAction, setStatus, captureAfterKpi, deleteAction,
} from '../lib/admin/clubActionsRepo.js'
import { adminListReports } from '../lib/admin/clubReportsRepo.js'

const EMPTY = { clubId: TEAMS[0].id, title: '', description: '', category: 'match', status: 'planned', actionDate: '', reportId: '', linkLatestInsight: true }

const STATUS_CLS = { planned: 'ca-st-planned', in_progress: 'ca-st-progress', done: 'ca-st-done', closed: 'ca-st-closed' }

export default function AdminClubActions() {
  const { t, lang } = useLang()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState([])
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)   // action id (KPI 상세)
  // 검색 필터
  const [fClub, setFClub] = useState('all')
  const [fStatus, setFStatus] = useState('all')
  const [fCat, setFCat] = useState('all')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const list = await adminListActions({ clubId: fClub, status: fStatus, category: fCat, from: fFrom || null, to: fTo || null })
    setRows(list); setLoading(false)
  }, [fClub, fStatus, fCat, fFrom, fTo])
  useEffect(() => { load() }, [load])
  useEffect(() => { adminListReports().then(setReports) }, [])

  const clubReports = form ? reports.filter(r => r.teamId === form.clubId) : []

  function openCreate() { setError(''); setForm({ ...EMPTY }) }
  function openEdit(a) {
    setError('')
    setForm({ id: a.id, clubId: a.clubId, title: a.title, description: a.description, category: a.category, status: a.status, actionDate: a.actionDate || '', reportId: a.reportId || '', aiInsightId: a.aiInsightId || '', linkLatestInsight: false })
  }
  function close() { setForm(null); setError('') }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError(t('admin.action.errTitle')); return }
    if (form.id) {
      const res = await updateAction(form.id, form)
      if (!res.ok) { setError(res.error || t('admin.action.errTitle')); return }
    } else {
      const res = await createAction(form)
      if (!res.ok) { setError(t(`admin.action.err_${res.code}`) || res.error || t('admin.action.errTitle')); return }
    }
    close(); load()
  }

  async function onStatus(a, status) { await setStatus(a.id, status); load() }
  async function onAfter(a) { await captureAfterKpi(a.id, a.clubId); load() }
  async function onDelete(a) { if (await deleteAction(a.id)) load() }

  const clubName = id => teamName(getTeam(id), lang) || id
  const kpiLine = k => k ? t('admin.ca.kpiSummary', { sat: k.satisfaction, nps: k.nps, comp: k.complaintIndex }) : '—'

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-head-row">
        <div>
          <h1 className="adm-h1">{t('admin.action.title')}</h1>
          <p className="adm-sub">{t('admin.action.sub', { n: rows.length })}</p>
        </div>
        <button className="adm-btn-primary" onClick={openCreate}>+ {t('admin.action.create')}</button>
      </header>

      {/* 검색 필터 */}
      <div className="ca-filters">
        <select className="adm-input" value={fClub} onChange={e => setFClub(e.target.value)} aria-label={t('admin.action.club')}>
          <option value="all">{t('admin.action.allClubs')}</option>
          {TEAMS.map(tm => <option key={tm.id} value={tm.id}>{teamName(tm, lang)}</option>)}
        </select>
        <select className="adm-input" value={fStatus} onChange={e => setFStatus(e.target.value)} aria-label={t('admin.action.status')}>
          <option value="all">{t('admin.action.allStatus')}</option>
          {ACTION_STATUSES.map(s => <option key={s} value={s}>{t(`admin.action.st.${s}`)}</option>)}
        </select>
        <select className="adm-input" value={fCat} onChange={e => setFCat(e.target.value)} aria-label={t('admin.action.category')}>
          <option value="all">{t('admin.action.allCat')}</option>
          {ACTION_CATEGORIES.map(c => <option key={c} value={c}>{t(`admin.action.cat.${c}`)}</option>)}
        </select>
        <input type="date" className="adm-input" value={fFrom} onChange={e => setFFrom(e.target.value)} aria-label={t('admin.action.from')} />
        <span className="ca-dash">~</span>
        <input type="date" className="adm-input" value={fTo} onChange={e => setFTo(e.target.value)} aria-label={t('admin.action.to')} />
      </div>

      {loading ? (
        <SkeletonList count={5} lines={1} />
      ) : rows.length === 0 ? (
        <EmptyState iconName="check" title={t('admin.action.emptyTitle')} message={t('admin.action.emptyMsg')} ctaLabel={t('admin.action.create')} onCta={openCreate} />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table ca-table">
            <thead>
              <tr>
                <th>{t('admin.action.club')}</th>
                <th>{t('admin.action.titleCol')}</th>
                <th>{t('admin.action.category')}</th>
                <th>{t('admin.action.status')}</th>
                <th>{t('admin.action.date')}</th>
                <th>{t('admin.action.kpi')}</th>
                <th className="ca-actions-col">{t('admin.action.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <Fragment key={a.id}>
                  <tr>
                    <td>{clubName(a.clubId)}</td>
                    <td className="ca-title-cell">
                      <button className="ca-title-btn" onClick={() => setExpanded(expanded === a.id ? null : a.id)}>{a.title}</button>
                    </td>
                    <td>{t(`admin.action.cat.${a.category}`)}</td>
                    <td>
                      <select className={`ca-status ${STATUS_CLS[a.status]}`} value={a.status} onChange={e => onStatus(a, e.target.value)} aria-label={t('admin.action.status')}>
                        {ACTION_STATUSES.map(s => <option key={s} value={s}>{t(`admin.action.st.${s}`)}</option>)}
                      </select>
                    </td>
                    <td className="ca-date">{a.actionDate || '—'}</td>
                    <td className="ca-kpi-cell">
                      <span className="ca-kpi-b">B: {kpiLine(a.beforeKpi)}</span>
                      <span className="ca-kpi-a">A: {kpiLine(a.afterKpi)}</span>
                    </td>
                    <td className="ca-actions-col">
                      {(a.status === 'done' || a.status === 'closed') && !a.afterKpi && (
                        <button className="adm-btn-sm" onClick={() => onAfter(a)} title={t('admin.action.captureAfter')}><Icon name="chart" size={13} /> {t('admin.action.after')}</button>
                      )}
                      <button className="adm-btn-sm" onClick={() => openEdit(a)}><Icon name="edit" size={13} /> {t('admin.action.edit')}</button>
                      <button className="adm-btn-sm ca-del" onClick={() => onDelete(a)} aria-label={t('admin.action.delete')}><Icon name="flag" size={13} /></button>
                    </td>
                  </tr>
                  {expanded === a.id && (
                    <tr className="ca-detail-row">
                      <td colSpan={7}>
                        <div className="ca-detail">
                          {a.description && <p className="ca-desc">{a.description}</p>}
                          <div className="ca-kpi-compare">
                            <KpiSnapshot title={t('admin.action.beforeKpi')} k={a.beforeKpi} t={t} />
                            <span className="ca-arrow" aria-hidden="true">→</span>
                            <KpiSnapshot title={t('admin.action.afterKpi')} k={a.afterKpi} t={t} placeholder={t('admin.action.afterEmpty')} />
                          </div>
                          <div className="ca-links">
                            {a.week && <span className="ca-link-chip"><Icon name="chart" size={12} /> {t('admin.action.linkWeek')}: {a.week}</span>}
                            {a.aiInsightId && <span className="ca-link-chip"><Icon name="sparkle" size={12} /> {t('admin.action.linkInsight')}</span>}
                            {a.reportId && <span className="ca-link-chip"><Icon name="news" size={12} /> {t('admin.action.linkReport')}: {reports.find(r => String(r.id) === String(a.reportId))?.title || a.reportId}</span>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 등록/수정 모달 */}
      {form && (
        <div className="ns-modal-backdrop" onClick={close}>
          <form className="ns-modal adm-form" onClick={e => e.stopPropagation()} onSubmit={save}>
            <h2 className="ns-modal-title">{form.id ? t('admin.action.editTitle') : t('admin.action.create')}</h2>

            <label className="adm-field">
              <span>{t('admin.action.club')}</span>
              <select className="adm-input" value={form.clubId} onChange={e => set('clubId', e.target.value)} disabled={!!form.id}>
                {TEAMS.map(tm => <option key={tm.id} value={tm.id}>{teamName(tm, lang)}</option>)}
              </select>
            </label>
            <label className="adm-field">
              <span>{t('admin.action.titleCol')}</span>
              <input value={form.title} onChange={e => set('title', e.target.value)} placeholder={t('admin.action.titlePh')} />
            </label>
            <label className="adm-field">
              <span>{t('admin.action.desc')}</span>
              <textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder={t('admin.action.descPh')} />
            </label>
            <div className="ca-form-row">
              <label className="adm-field">
                <span>{t('admin.action.category')}</span>
                <select className="adm-input" value={form.category} onChange={e => set('category', e.target.value)}>
                  {ACTION_CATEGORIES.map(c => <option key={c} value={c}>{t(`admin.action.cat.${c}`)}</option>)}
                </select>
              </label>
              <label className="adm-field">
                <span>{t('admin.action.status')}</span>
                <select className="adm-input" value={form.status} onChange={e => set('status', e.target.value)}>
                  {ACTION_STATUSES.map(s => <option key={s} value={s}>{t(`admin.action.st.${s}`)}</option>)}
                </select>
              </label>
              <label className="adm-field">
                <span>{t('admin.action.date')}</span>
                <input type="date" value={form.actionDate} onChange={e => set('actionDate', e.target.value)} />
              </label>
            </div>
            <label className="adm-field">
              <span>{t('admin.action.linkReport')}</span>
              <select className="adm-input" value={form.reportId} onChange={e => set('reportId', e.target.value)}>
                <option value="">{t('admin.action.noLink')}</option>
                {clubReports.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            </label>
            {!form.id && (
              <label className="ns-check">
                <input type="checkbox" checked={form.linkLatestInsight} onChange={e => set('linkLatestInsight', e.target.checked)} />
                <span>{t('admin.action.linkLatestInsight')}</span>
              </label>
            )}
            {!form.id && <p className="ca-hint"><Icon name="chart" size={13} /> {t('admin.action.snapshotHint')}</p>}

            {error && <div className="adm-error" role="alert">{error}</div>}
            <div className="ns-modal-actions">
              <button type="button" className="adm-btn" onClick={close}>{t('common.cancel')}</button>
              <button type="submit" className="adm-btn-primary">{t('admin.save')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function KpiSnapshot({ title, k, t, placeholder }) {
  return (
    <div className="ca-snap">
      <div className="ca-snap-title">{title}{k?.week && <span className="ca-snap-week"> ({k.week})</span>}</div>
      {k ? (
        <div className="ca-snap-grid">
          <div><b>{k.satisfaction}</b><span>{t('admin.kpi.satisfaction')}</span></div>
          <div><b>{k.nps}</b><span>NPS</span></div>
          <div><b>{k.complaintIndex}</b><span>{t('admin.kpi.complaint')}</span></div>
          <div><b>{k.engagement}</b><span>{t('admin.kpi.engagement')}</span></div>
        </div>
      ) : <div className="ca-snap-empty">{placeholder || '—'}</div>}
    </div>
  )
}
