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
  adminList, create, setStatus, remove, dashboard, getResults, listContextTargets,
} from '../lib/quickpoll/quickPollRepo.js'
import { QP_STATUS_META, QP_TRANSITIONS, QP_CONTEXT_TYPES, optionsFromLabels, validateOptions, contextNeedsId } from '../lib/quickpoll/quickPollStatus.js'

const PAGE = 20
const EMPTY = { question: '', labels: ['', ''], contextType: 'home', contextId: '', team: '', endsAt: '', resultVisibility: 'after_vote', allowResultBeforeVote: false }

function Badge({ status, t }) { const m = QP_STATUS_META[status] || QP_STATUS_META.active; return <span className={`pl-badge pl-badge-${m.tone}`}>{t(m.labelKey)}</span> }

export default function AdminQuickPoll() {
  const { t, lang } = useLang()
  const toast = useToast()
  const [list, setList] = useState({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState(null)
  const [page, setPage] = useState(1)
  const [statusF, setStatusF] = useState('')
  const [contextF, setContextF] = useState('')
  const [q, setQ] = useState('')
  const [form, setForm] = useState(null)
  const [targets, setTargets] = useState([])
  const [error, setError] = useState('')
  const [statsFor, setStatsFor] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [res, c] = await Promise.all([
      adminList({ status: statusF || null, context: contextF || null, q: q || null, page, pageSize: PAGE }),
      dashboard(),
    ])
    setList(res); setCounts(c && c.ok !== false ? c : null); setLoading(false)
  }, [statusF, contextF, q, page])
  useEffect(() => { refresh() }, [refresh])

  function openCreate() { setError(''); setTargets([]); setForm({ ...EMPTY, labels: ['', ''] }) }
  function close() { setForm(null); setError('') }
  useEscapeKey(close, !!form)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setLabel = (i, v) => setForm(f => { const labels = [...f.labels]; labels[i] = v; return { ...f, labels } })

  // context type 변경 시 대상 목록 로드
  useEffect(() => {
    if (!form) return
    if (contextNeedsId(form.contextType)) listContextTargets(form.contextType).then(setTargets)
    else setTargets([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.contextType])

  async function save(e) {
    e.preventDefault()
    if (!form.question.trim()) { setError(t('admin.qp.errQuestion')); return }
    const options = optionsFromLabels(form.labels)
    if (!validateOptions(options).ok) { setError(t('admin.qp.errOptions')); return }
    if (form.contextType === 'match') { setError(t('admin.qp.errMatch')); return }
    if (contextNeedsId(form.contextType) && !form.contextId) { setError(t('admin.qp.errTarget')); return }
    const res = await create({
      question: form.question, options, contextType: form.contextType,
      contextId: contextNeedsId(form.contextType) ? form.contextId : null,
      team: form.team || null, endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      resultVisibility: form.resultVisibility, allowResultBeforeVote: form.allowResultBeforeVote,
    })
    if (!res.ok) { const key = `admin.qp.err.${res.code}`; setError(t(key) === key ? t('admin.qp.errCreate') : t(key)); return }
    toast.success(t('admin.qp.created')); close(); refresh()
  }
  async function transition(p, to) { const r = await setStatus(p.id, to); if (!r.ok) { toast.error(t('admin.qp.errStatus')); return } refresh() }
  async function del(p) { if (!window.confirm(t('admin.qp.confirmDelete'))) return; const r = await remove(p.id); if (r.ok) { toast.success(t('admin.qp.deleted')); if (statsFor?.p?.id === p.id) setStatsFor(null); refresh() } }
  async function viewStats(p) { const s = await getResults(p.id); setStatsFor({ p, s: s?.ok === false ? null : s }) }

  const dash = counts || {}
  return (
    <div className="adm-page">
      <header className="adm-page-head adm-head-row">
        <div><h1 className="adm-h1">{t('admin.menu.quickpoll')}</h1><p className="adm-sub">{t('admin.qp.sub', { n: list.total })}</p></div>
        <button className="adm-btn-primary" onClick={openCreate}>+ {t('admin.qp.create')}</button>
      </header>

      {counts && (
        <div className="nw-dash" aria-label={t('admin.qp.dashboard')}>
          {[['active', dash.active], ['closed', dash.closed], ['archived', dash.archived], ['participants', dash.participants], ['total_votes', dash.total_votes], ['today', dash.today_votes]].map(([k, v]) => (
            <div key={k} className="nw-dash-cell"><span className="nw-dash-val">{v ?? 0}</span><span className="nw-dash-lbl">{t(`admin.qp.dash.${k}`)}</span></div>
          ))}
        </div>
      )}

      <div className="nw-toolbar">
        <input className="adm-input nw-search" type="search" value={q} placeholder={t('admin.qp.searchPh')} aria-label={t('admin.qp.searchPh')} onChange={e => { setPage(1); setQ(e.target.value) }} />
        <select className="adm-input" value={statusF} aria-label={t('admin.qp.filterStatus')} onChange={e => { setPage(1); setStatusF(e.target.value) }}>
          <option value="">{t('admin.qp.allStatus')}</option>
          {['active', 'closed', 'archived', 'draft'].map(s => <option key={s} value={s}>{t(QP_STATUS_META[s].labelKey)}</option>)}
        </select>
        <select className="adm-input" value={contextF} aria-label={t('admin.qp.filterContext')} onChange={e => { setPage(1); setContextF(e.target.value) }}>
          <option value="">{t('admin.qp.allContext')}</option>
          {QP_CONTEXT_TYPES.map(cx => <option key={cx} value={cx}>{t(`admin.qp.ctx.${cx}`)}</option>)}
        </select>
      </div>

      {form && (
        <div className="nw-editor" role="dialog" aria-modal="true" aria-label={t('admin.qp.create')}>
          <div className="nw-editor-head"><h2 className="adm-h2">{t('admin.qp.create')}</h2><button className="adm-btn-sm" onClick={close} aria-label={t('admin.cancel')}><Icon name="close" size={14} /></button></div>
          <form className="adm-form" onSubmit={save}>
            <div className="adm-field"><label htmlFor="qp-q">{t('admin.qp.fQuestion')}</label>
              <input id="qp-q" className="adm-input" value={form.question} onChange={e => set('question', e.target.value)} placeholder={t('admin.qp.fQuestionPh')} autoFocus /></div>
            <div className="adm-field"><label>{t('admin.qp.fOptions')} <span className="nw-hint">(2~4)</span></label>
              {form.labels.map((lb, i) => (
                <div key={i} className="pl-opt-row">
                  <input className="adm-input" value={lb} onChange={e => setLabel(i, e.target.value)} placeholder={`${t('admin.qp.option')} ${i + 1}`} />
                  {form.labels.length > 2 && <button type="button" className="adm-btn-sm danger" onClick={() => set('labels', form.labels.filter((_, j) => j !== i))} aria-label={t('admin.delete')}><Icon name="close" size={12} /></button>}
                </div>
              ))}
              {form.labels.length < 4 && <button type="button" className="adm-btn-sm" onClick={() => set('labels', [...form.labels, ''])}>+ {t('admin.qp.addOption')}</button>}
            </div>
            <div className="adm-field-row">
              <div className="adm-field"><label htmlFor="qp-ctx">{t('admin.qp.fContext')}</label>
                <select id="qp-ctx" className="adm-input" value={form.contextType} onChange={e => { set('contextType', e.target.value); set('contextId', '') }}>
                  {QP_CONTEXT_TYPES.map(cx => <option key={cx} value={cx} disabled={cx === 'match'}>{t(`admin.qp.ctx.${cx}`)}{cx === 'match' ? ` (${t('admin.qp.unavailable')})` : ''}</option>)}
                </select></div>
              <div className="adm-field"><label htmlFor="qp-team">{t('admin.qp.fTeam')}</label>
                <select id="qp-team" className="adm-input" value={form.team} onChange={e => set('team', e.target.value)}>
                  <option value="">{t('admin.qp.allTeams')}</option>{TEAMS.map(tm => <option key={tm.id} value={tm.id}>{teamName(tm, lang)}</option>)}
                </select></div>
            </div>
            {contextNeedsId(form.contextType) && (
              <div className="adm-field"><label htmlFor="qp-target">{t('admin.qp.fTarget')}</label>
                <select id="qp-target" className="adm-input" value={form.contextId} onChange={e => set('contextId', e.target.value)}>
                  <option value="">{t('admin.qp.selectTarget')}</option>{targets.map(tg => <option key={tg.id} value={tg.id}>{tg.label}</option>)}
                </select></div>
            )}
            <div className="adm-field-row">
              <div className="adm-field"><label htmlFor="qp-rv">{t('admin.qp.fResultVis')}</label>
                <select id="qp-rv" className="adm-input" value={form.resultVisibility} onChange={e => set('resultVisibility', e.target.value)}>
                  <option value="after_vote">{t('admin.qp.rv.after_vote')}</option><option value="always">{t('admin.qp.rv.always')}</option><option value="after_close">{t('admin.qp.rv.after_close')}</option>
                </select></div>
              <div className="adm-field"><label htmlFor="qp-ends">{t('admin.qp.fEndsAt')}</label>
                <input id="qp-ends" type="datetime-local" className="adm-input" value={form.endsAt} onChange={e => set('endsAt', e.target.value)} /></div>
            </div>
            {error && <div className="adm-error" role="alert"><Icon name="warningTriangle" size={14} className="fc-inline-ico" />{error}</div>}
            <div className="adm-form-actions"><button type="submit" className="adm-btn-primary">{t('admin.qp.create')}</button><button type="button" className="adm-btn-ghost" onClick={close}>{t('admin.cancel')}</button></div>
          </form>
        </div>
      )}

      {statsFor && (
        <div className="nw-editor" role="dialog" aria-modal="true" aria-label={t('admin.qp.stats')}>
          <div className="nw-editor-head"><h2 className="adm-h2">{statsFor.p.question}</h2><button className="adm-btn-sm" onClick={() => setStatsFor(null)} aria-label={t('admin.cancel')}><Icon name="close" size={14} /></button></div>
          {statsFor.s?.by_option ? (
            <div className="pl-results">{statsFor.s.by_option.map(o => (
              <div key={o.id} className="pl-bar-row"><div className="pl-bar-head"><span className="pl-bar-label">{o.label}</span><span className="pl-bar-pct">{o.ratio}% <span className="pl-bar-n">({o.votes})</span></span></div><div className="pl-bar-track"><div className="pl-bar-fill" style={{ width: `${o.ratio}%` }} /></div></div>
            ))}<div className="pl-results-total">{t('qp.totalVotes', { n: statsFor.s.total })}</div></div>
          ) : <p className="adm-sub">{t('admin.qp.noStats')}</p>}
        </div>
      )}

      {loading ? <SkeletonList count={5} lines={1} /> : list.items.length === 0 ? (
        <EmptyState iconName="vote" title={t('admin.qp.emptyTitle')} message={t('admin.qp.emptyMsg')} />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>{t('admin.qp.colQuestion')}</th><th>{t('admin.qp.colStatus')}</th><th>{t('admin.qp.colContext')}</th><th>{t('admin.qp.colVotes')}</th><th className="adm-col-actions">{t('admin.actions')}</th></tr></thead>
            <tbody>{list.items.map(p => { const tr = QP_TRANSITIONS[p.status] || []; return (
              <tr key={p.id}>
                <td className="adm-cell-strong">{p.question}</td>
                <td><Badge status={p.status} t={t} /></td>
                <td className="adm-cell-muted">{t(`admin.qp.ctx.${p.context_type}`)}</td>
                <td className="adm-cell-muted">{p.votes ?? 0}</td>
                <td className="adm-col-actions"><div className="adm-actions">
                  <button className="adm-btn-sm" onClick={() => viewStats(p)}>{t('admin.qp.stats')}</button>
                  {tr.includes('active') && <button className="adm-btn-sm" onClick={() => transition(p, 'active')}>{t('admin.qp.activate')}</button>}
                  {tr.includes('closed') && <button className="adm-btn-sm" onClick={() => transition(p, 'closed')}>{t('admin.qp.close')}</button>}
                  {tr.includes('archived') && <button className="adm-btn-sm" onClick={() => transition(p, 'archived')}>{t('admin.qp.archive')}</button>}
                  {tr.includes('draft') && <button className="adm-btn-sm" onClick={() => transition(p, 'draft')}>{t('admin.qp.restore')}</button>}
                  <button className="adm-btn-sm danger" onClick={() => del(p)}>{t('admin.delete')}</button>
                </div></td>
              </tr>) })}</tbody>
          </table>
          <Pagination page={page} total={Math.ceil(list.total / PAGE)} onChange={setPage} />
        </div>
      )}
    </div>
  )
}
