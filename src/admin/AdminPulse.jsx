import { useState, useEffect, useCallback } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { TEAMS, teamName } from '../teams.jsx'
import Icon from '../components/Icon.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Pagination from '../components/Pagination.jsx'
import { SkeletonList } from '../components/Skeleton.jsx'
import { useEscapeKey } from '../lib/useEscapeKey.js'
import {
  adminListPulses, createPulse, setPulseStatus, deletePulse, pulseDashboard, getStats,
} from '../lib/pulse/pulseRepo.js'
import { PULSE_STATUS_META, PULSE_TRANSITIONS, optionsFromLabels, validateOptions } from '../lib/pulse/pulseStatus.js'

const PAGE = 20
const EMPTY = { question: '', labels: ['', ''], team: '', visibility: 'public', endsAt: '' }

function StatusBadge({ status, t }) {
  const m = PULSE_STATUS_META[status] || PULSE_STATUS_META.active
  return <span className={`pl-badge pl-badge-${m.tone}`}>{t(m.labelKey)}</span>
}

export default function AdminPulse() {
  const { t, lang } = useLang()
  const toast = useToast()
  const [list, setList] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState(null)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [statsFor, setStatsFor] = useState(null) // {topic, stats}

  const refresh = useCallback(async () => {
    setLoading(true)
    const [res, c] = await Promise.all([
      adminListPulses({ status: statusFilter || null, page, pageSize: PAGE }),
      pulseDashboard(),
    ])
    setList(res); setCounts(c && c.ok !== false ? c : null); setLoading(false)
  }, [statusFilter, page])
  useEffect(() => { refresh() }, [refresh])

  function openCreate() { setError(''); setForm({ ...EMPTY, labels: ['', ''] }) }
  function close() { setForm(null); setError('') }
  useEscapeKey(close, !!form)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setLabel = (i, v) => setForm(f => { const labels = [...f.labels]; labels[i] = v; return { ...f, labels } })
  const addLabel = () => setForm(f => (f.labels.length >= 6 ? f : { ...f, labels: [...f.labels, ''] }))
  const removeLabel = (i) => setForm(f => (f.labels.length <= 2 ? f : { ...f, labels: f.labels.filter((_, j) => j !== i) }))

  async function save(e) {
    e.preventDefault()
    if (!form.question.trim()) { setError(t('admin.pl.errQuestion')); return }
    const options = optionsFromLabels(form.labels)
    const v = validateOptions(options)
    if (!v.ok) { setError(t('admin.pl.errOptions')); return }
    const res = await createPulse({
      question: form.question, options, team: form.team || null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null, visibility: form.visibility,
    })
    if (!res.ok) { setError(t(`admin.pl.err.${res.code}`) === `admin.pl.err.${res.code}` ? t('admin.pl.errCreate') : t(`admin.pl.err.${res.code}`)); return }
    toast.success(t('admin.pl.created'))
    close(); refresh()
  }

  async function transition(topic, to) {
    const res = await setPulseStatus(topic.id, to)
    if (!res.ok) { toast.error(t('admin.pl.errStatus')); return }
    refresh()
  }
  async function remove(topic) {
    if (!window.confirm(t('admin.pl.confirmDelete'))) return
    const res = await deletePulse(topic.id)
    if (res.ok) { toast.success(t('admin.pl.deleted')); if (statsFor?.topic?.id === topic.id) setStatsFor(null); refresh() }
  }
  async function viewStats(topic) {
    const s = await getStats(topic.id)
    setStatsFor({ topic, stats: s?.ok === false ? null : s })
  }

  const dash = counts || {}

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-head-row">
        <div>
          <h1 className="adm-h1">{t('admin.menu.pulse')}</h1>
          <p className="adm-sub">{t('admin.pl.sub', { n: list.total })}</p>
        </div>
        <button className="adm-btn-primary" onClick={openCreate}>+ {t('admin.pl.create')}</button>
      </header>

      {counts && (
        <div className="nw-dash" aria-label={t('admin.pl.dashboard')}>
          {[['active', dash.active], ['closed', dash.closed], ['archived', dash.archived],
            ['participants', dash.participants], ['total_votes', dash.total_votes], ['today', dash.today_votes]].map(([k, v]) => (
            <div key={k} className="nw-dash-cell"><span className="nw-dash-val">{v ?? 0}</span><span className="nw-dash-lbl">{t(`admin.pl.dash.${k}`)}</span></div>
          ))}
        </div>
      )}

      <div className="nw-toolbar">
        <select className="adm-input" value={statusFilter} aria-label={t('admin.pl.filterStatus')}
          onChange={e => { setPage(1); setStatusFilter(e.target.value) }}>
          <option value="">{t('admin.pl.allStatus')}</option>
          {['active', 'closed', 'archived'].map(s => <option key={s} value={s}>{t(PULSE_STATUS_META[s].labelKey)}</option>)}
        </select>
      </div>

      {form && (
        <div className="nw-editor" role="dialog" aria-modal="true" aria-label={t('admin.pl.create')}>
          <div className="nw-editor-head"><h2 className="adm-h2">{t('admin.pl.create')}</h2>
            <button className="adm-btn-sm" onClick={close} aria-label={t('admin.cancel')}><Icon name="close" size={14} /></button></div>
          <form className="adm-form" onSubmit={save}>
            <div className="adm-field"><label htmlFor="pl-q">{t('admin.pl.fQuestion')}</label>
              <input id="pl-q" className="adm-input" value={form.question} onChange={e => set('question', e.target.value)} placeholder={t('admin.pl.fQuestionPh')} autoFocus /></div>
            <div className="adm-field">
              <label>{t('admin.pl.fOptions')} <span className="nw-hint">(2~6)</span></label>
              {form.labels.map((lb, i) => (
                <div key={i} className="pl-opt-row">
                  <input className="adm-input" value={lb} onChange={e => setLabel(i, e.target.value)} placeholder={`${t('admin.pl.option')} ${i + 1}`} />
                  {form.labels.length > 2 && <button type="button" className="adm-btn-sm danger" onClick={() => removeLabel(i)} aria-label={t('admin.delete')}><Icon name="close" size={12} /></button>}
                </div>
              ))}
              {form.labels.length < 6 && <button type="button" className="adm-btn-sm" onClick={addLabel}>+ {t('admin.pl.addOption')}</button>}
            </div>
            <div className="adm-field-row">
              <div className="adm-field"><label htmlFor="pl-team">{t('admin.pl.fTeam')}</label>
                <select id="pl-team" className="adm-input" value={form.team} onChange={e => set('team', e.target.value)}>
                  <option value="">{t('admin.pl.allTeams')}</option>
                  {TEAMS.map(tm => <option key={tm.id} value={tm.id}>{teamName(tm, lang)}</option>)}
                </select></div>
              <div className="adm-field"><label htmlFor="pl-vis">{t('admin.pl.fVisibility')}</label>
                <select id="pl-vis" className="adm-input" value={form.visibility} onChange={e => set('visibility', e.target.value)}>
                  <option value="public">{t('admin.pl.public')}</option><option value="private">{t('admin.pl.private')}</option>
                </select></div>
            </div>
            <div className="adm-field"><label htmlFor="pl-ends">{t('admin.pl.fEndsAt')}</label>
              <input id="pl-ends" type="datetime-local" className="adm-input" value={form.endsAt} onChange={e => set('endsAt', e.target.value)} /></div>
            {error && <div className="adm-error" role="alert"><Icon name="warningTriangle" size={14} className="fc-inline-ico" />{error}</div>}
            <div className="adm-form-actions"><button type="submit" className="adm-btn-primary">{t('admin.pl.create')}</button>
              <button type="button" className="adm-btn-ghost" onClick={close}>{t('admin.cancel')}</button></div>
          </form>
        </div>
      )}

      {statsFor && (
        <div className="nw-editor" role="dialog" aria-modal="true" aria-label={t('admin.pl.stats')}>
          <div className="nw-editor-head"><h2 className="adm-h2">{statsFor.topic.question}</h2>
            <button className="adm-btn-sm" onClick={() => setStatsFor(null)} aria-label={t('admin.cancel')}><Icon name="close" size={14} /></button></div>
          {statsFor.stats ? (
            <div className="pl-results">
              {(statsFor.stats.by_option || []).map(o => (
                <div key={o.id} className="pl-bar-row">
                  <div className="pl-bar-head"><span className="pl-bar-label">{o.label}</span><span className="pl-bar-pct">{o.ratio}% <span className="pl-bar-n">({o.votes})</span></span></div>
                  <div className="pl-bar-track"><div className="pl-bar-fill" style={{ width: `${o.ratio}%` }} /></div>
                </div>
              ))}
              <div className="pl-results-total">{t('pulse.totalVotes', { n: statsFor.stats.total })}</div>
            </div>
          ) : <p className="adm-sub">{t('admin.pl.noStats')}</p>}
        </div>
      )}

      {loading ? <SkeletonList count={5} lines={1} /> : list.items.length === 0 ? (
        <EmptyState iconName="vote" title={t('admin.pl.emptyTitle')} message={t('admin.pl.emptyMsg')} />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>{t('admin.pl.colQuestion')}</th><th>{t('admin.pl.colStatus')}</th><th>{t('admin.pl.colTeam')}</th><th className="adm-col-actions">{t('admin.actions')}</th></tr></thead>
            <tbody>
              {list.items.map(p => {
                const team = TEAMS.find(x => x.id === p.team_id)
                const trans = PULSE_TRANSITIONS[p.status] || []
                return (
                  <tr key={p.id}>
                    <td className="adm-cell-strong">{p.question}</td>
                    <td><StatusBadge status={p.status} t={t} /></td>
                    <td className="adm-cell-muted">{team ? teamName(team, lang) : t('admin.pl.allTeams')}</td>
                    <td className="adm-col-actions"><div className="adm-actions">
                      <button className="adm-btn-sm" onClick={() => viewStats(p)}>{t('admin.pl.stats')}</button>
                      {trans.includes('closed') && <button className="adm-btn-sm" onClick={() => transition(p, 'closed')}>{t('admin.pl.close')}</button>}
                      {trans.includes('active') && <button className="adm-btn-sm" onClick={() => transition(p, 'active')}>{t('admin.pl.reopen')}</button>}
                      {trans.includes('archived') && <button className="adm-btn-sm" onClick={() => transition(p, 'archived')}>{t('admin.pl.archive')}</button>}
                      <button className="adm-btn-sm danger" onClick={() => remove(p)}>{t('admin.delete')}</button>
                    </div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination page={page} total={Math.ceil(list.total / PAGE)} onChange={setPage} />
        </div>
      )}
    </div>
  )
}
