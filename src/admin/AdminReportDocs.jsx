import { useState, useEffect } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { TEAMS, getTeam } from '../teams.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Icon from '../components/Icon.jsx'
import {
  REPORT_STATUSES, adminListReports, createReport, updateReport,
  setStatus, deleteReport, listDeliveries,
} from '../lib/admin/clubReportsRepo.js'
import { REPORT_PERIODS } from '../lib/ai/report/index.js'
import { generateReportPdfFromDoc } from '../lib/ai/report/index.js'

// 상태 배지 클래스
const STATUS_CLS = { draft: 'inactive', review: 'pending', approved: 'active', delivered: 'delivered' }

// content 배열 ↔ 편집용 텍스트 변환
const kwToText = arr => (arr || []).map(k => `${k.tag}, ${k.count ?? 0}`).join('\n')
const catToText = arr => (arr || []).map(c => `${c.name} | ${c.note || ''}`).join('\n')
const sugToText = arr => (arr || []).map(s => `${s.title} | ${s.desc || ''}`).join('\n')
const parseKw = txt => txt.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  const i = l.lastIndexOf(',')
  if (i < 0) return { tag: l, count: 0 }
  return { tag: l.slice(0, i).trim(), count: Number(l.slice(i + 1).trim()) || 0 }
})
const parsePipe = txt => txt.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  const [a, ...rest] = l.split('|')
  return { a: a.trim(), b: rest.join('|').trim() }
})

const EMPTY_CREATE = { teamId: TEAMS[0].id, periodType: 'monthly', title: '' }

export default function AdminReportDocs() {
  const { t } = useLang()
  const [reports, setReports] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(null)   // 생성 폼 상태 or null
  const [createErr, setCreateErr] = useState('')
  const [edit, setEdit] = useState(null)           // 편집 중인 리포트 편집상태 or null
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function reload() {
    const [list, dl] = await Promise.all([adminListReports(), listDeliveries()])
    setReports(list); setDeliveries(dl); setLoading(false)
  }
  useEffect(() => { reload() }, [])

  const statusLabel = s => t(`admin.rpt.status.${s}`)
  const teamName = id => getTeam(id)?.name || id
  const fmt = iso => String(iso || '').slice(0, 10)

  // ── 생성 ──
  function openCreate() { setCreateErr(''); setEdit(null); setCreating({ ...EMPTY_CREATE }) }
  const setC = (k, v) => setCreating(c => ({ ...c, [k]: v }))
  async function submitCreate(e) {
    e.preventDefault()
    setCreateErr(''); setBusy(true)
    const res = await createReport(creating)
    setBusy(false)
    if (!res.ok) {
      setCreateErr(res.code === 'no_insight' ? t('admin.rpt.errNoInsight')
        : res.code === 'no_title' ? t('admin.rpt.errTitle') : t('admin.rpt.errCreate'))
      return
    }
    setCreating(null)
    setReports(list => [res.report, ...list])
    openEdit(res.report)
  }

  // ── 편집 ──
  function openEdit(r) {
    setCreating(null); setMsg('')
    const c = r.content || {}
    setEdit({
      id: r.id, title: r.title,
      finalSummary: c.finalSummary || '', summary: c.summary || '', operatorComment: c.operatorComment || '',
      pos: c.sentiment?.positive ?? 0, neu: c.sentiment?.neutral ?? 0, neg: c.sentiment?.negative ?? 0,
      satisfaction: c.satisfaction ?? 0,
      keywordsText: kwToText(c.keywords), categoriesText: catToText(c.categories), suggestionsText: sugToText(c.suggestions),
      kpi: c.kpi || {},
    })
  }
  const setE = (k, v) => setEdit(s => ({ ...s, [k]: v }))
  const editing = edit && reports.find(r => r.id === edit.id)

  async function saveEdit() {
    setBusy(true); setMsg('')
    const content = {
      summary: edit.summary, finalSummary: edit.finalSummary, operatorComment: edit.operatorComment,
      sentiment: { positive: Number(edit.pos) || 0, neutral: Number(edit.neu) || 0, negative: Number(edit.neg) || 0 },
      satisfaction: Number(edit.satisfaction) || 0,
      keywords: parseKw(edit.keywordsText),
      categories: parsePipe(edit.categoriesText).map(x => ({ name: x.a, note: x.b })),
      suggestions: parsePipe(edit.suggestionsText).map((x, i) => ({ rank: i + 1, title: x.a, desc: x.b })),
      kpi: edit.kpi,
    }
    const res = await updateReport(edit.id, { title: edit.title, content })
    setBusy(false)
    if (res.ok) { setReports(list => list.map(r => (r.id === edit.id ? res.report : r))); setMsg(t('admin.rpt.saved')) }
    else setMsg(res.error || t('admin.rpt.errCreate'))
  }

  async function changeStatus(id, status) {
    setBusy(true)
    const res = await setStatus(id, status)
    setBusy(false)
    if (res.ok) {
      setReports(list => list.map(r => (r.id === id ? res.report : r)))
      if (status === 'delivered') listDeliveries().then(setDeliveries)
    }
  }

  async function remove(id) {
    const res = await deleteReport(id)
    if (res.ok) { setReports(list => list.filter(r => r.id !== id)); if (edit?.id === id) setEdit(null) }
  }

  async function downloadPdf(r) {
    setBusy(true); setMsg('')
    try {
      await generateReportPdfFromDoc(r, t)
      setMsg(t('admin.rpt.pdfDone'))
    } catch { setMsg(t('admin.rpt.pdfFail')) }
    setBusy(false)
  }

  const canDownload = r => r && (r.status === 'approved' || r.status === 'delivered')

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-head-row">
        <div>
          <h1 className="adm-h1">{t('admin.menu.reportDocs')}</h1>
          <p className="adm-sub">{t('admin.rpt.sub', { n: reports.length })}</p>
        </div>
        <button className="adm-btn-primary" onClick={openCreate}>+ {t('admin.rpt.create')}</button>
      </header>

      {/* 생성 폼 */}
      {creating && (
        <form className="adm-form" onSubmit={submitCreate}>
          <h2 className="adm-h2">{t('admin.rpt.createTitle')}</h2>
          <p className="adm-sub adm-notice-sub">{t('admin.rpt.createHint')}</p>
          <div className="adm-field-row">
            <div className="adm-field">
              <label>{t('admin.rpt.fTeam')}</label>
              <select className="adm-input" value={creating.teamId} onChange={e => setC('teamId', e.target.value)}>
                {TEAMS.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </select>
            </div>
            <div className="adm-field">
              <label>{t('admin.rpt.fPeriod')}</label>
              <select className="adm-input" value={creating.periodType} onChange={e => setC('periodType', e.target.value)}>
                {REPORT_PERIODS.map(p => <option key={p.key} value={p.key}>{t(p.labelKey)}</option>)}
              </select>
            </div>
          </div>
          <div className="adm-field">
            <label>{t('admin.rpt.fTitle')}</label>
            <input className="adm-input" value={creating.title} onChange={e => setC('title', e.target.value)} placeholder={t('admin.rpt.fTitlePh')} maxLength={100} />
          </div>
          {createErr && <div className="adm-error" role="alert">⚠ {createErr}</div>}
          <div className="adm-form-actions">
            <button type="submit" className="adm-btn-primary" disabled={busy}>{t('admin.rpt.createDraft')}</button>
            <button type="button" className="adm-btn-ghost" onClick={() => setCreating(null)}>{t('admin.cancel')}</button>
          </div>
        </form>
      )}

      {/* 목록 */}
      {loading ? (
        <p className="adm-loading" role="status">{t('common.loading')}</p>
      ) : reports.length === 0 ? (
        <EmptyState iconName="clipboard" title={t('admin.rpt.emptyTitle')} message={t('admin.rpt.emptyMsg')} />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('admin.rpt.colTitle')}</th>
                <th>{t('admin.rpt.colTeam')}</th>
                <th>{t('admin.rpt.colPeriod')}</th>
                <th>{t('admin.rpt.colStatus')}</th>
                <th>{t('admin.rpt.colCreated')}</th>
                <th>{t('admin.rpt.colUpdated')}</th>
                <th className="adm-col-actions">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id} className={edit?.id === r.id ? 'is-selected' : ''}>
                  <td className="adm-cell-strong">{r.title}</td>
                  <td className="adm-cell-muted">{teamName(r.teamId)}</td>
                  <td className="adm-cell-muted">{r.periodLabel}</td>
                  <td><span className={`adm-badge ${STATUS_CLS[r.status]}`}>{statusLabel(r.status)}</span></td>
                  <td className="adm-cell-muted">{fmt(r.createdAt)}</td>
                  <td className="adm-cell-muted">{fmt(r.updatedAt)}</td>
                  <td className="adm-col-actions">
                    <div className="adm-actions">
                      <button className={`adm-btn-sm${edit?.id === r.id ? ' on' : ''}`} onClick={() => (edit?.id === r.id ? setEdit(null) : openEdit(r))}>{t('admin.rpt.editBtn')}</button>
                      <button className="adm-btn-sm danger" onClick={() => remove(r.id)}>{t('admin.delete')}</button>
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
            <h2 className="adm-panel-title">{t('admin.rpt.detailTitle')} · {teamName(editing.teamId)}</h2>
            <button className="adm-btn-sm" onClick={() => setEdit(null)}>{t('common.close')}</button>
          </div>

          {/* 상태 + PDF */}
          <div className="adm-rpt-statusbar">
            <div className="adm-rpt-statuses" role="group" aria-label={t('admin.rpt.colStatus')}>
              {REPORT_STATUSES.map(s => (
                <button key={s} className={`adm-filter${editing.status === s ? ' on' : ''}`} disabled={busy} onClick={() => changeStatus(editing.id, s)}>
                  {statusLabel(s)}
                </button>
              ))}
            </div>
            <button
              className="adm-btn-primary adm-rpt-pdf"
              disabled={!canDownload(editing) || busy}
              title={canDownload(editing) ? '' : t('admin.rpt.pdfLocked')}
              onClick={() => downloadPdf(editing)}>
              <Icon name="news" size={16} /> {t('admin.rpt.downloadPdf')}
            </button>
          </div>
          {!canDownload(editing) && <p className="adm-rpt-lockhint">{t('admin.rpt.pdfLocked')}</p>}

          {/* 전달 기록 */}
          {editing.status === 'delivered' && editing.deliveredAt && (
            <div className="adm-rpt-delivery">
              <Icon name="check" size={14} /> {t('admin.rpt.deliveredInfo', { date: fmt(editing.deliveredAt), by: editing.deliveredBy || '-' })}
            </div>
          )}

          <div className="adm-field"><label>{t('admin.rpt.fTitle')}</label>
            <input className="adm-input" value={edit.title} onChange={e => setE('title', e.target.value)} maxLength={100} /></div>

          <div className="adm-field"><label>{t('admin.rpt.finalSummary')} <span className="adm-rpt-tolabel">→ {t('admin.rpt.toClub')}</span></label>
            <textarea className="adm-input" rows={3} value={edit.finalSummary} onChange={e => setE('finalSummary', e.target.value)} placeholder={t('admin.rpt.finalSummaryPh')} /></div>

          <div className="adm-field"><label>{t('aiReport.summary')}</label>
            <textarea className="adm-input" rows={3} value={edit.summary} onChange={e => setE('summary', e.target.value)} /></div>

          <div className="adm-field">
            <label>{t('aiReport.sentiment')} (%)</label>
            <div className="adm-rpt-sentiment">
              <label>{t('aiReport.pos')}<input className="adm-input" type="number" min="0" max="100" value={edit.pos} onChange={e => setE('pos', e.target.value)} /></label>
              <label>{t('aiReport.neu')}<input className="adm-input" type="number" min="0" max="100" value={edit.neu} onChange={e => setE('neu', e.target.value)} /></label>
              <label>{t('aiReport.neg')}<input className="adm-input" type="number" min="0" max="100" value={edit.neg} onChange={e => setE('neg', e.target.value)} /></label>
            </div>
          </div>

          <div className="adm-field-row">
            <div className="adm-field"><label>{t('aiReport.keywords')} <span className="adm-rpt-tolabel">({t('admin.rpt.kwHint')})</span></label>
              <textarea className="adm-input adm-mono-area" rows={5} value={edit.keywordsText} onChange={e => setE('keywordsText', e.target.value)} placeholder={'티켓, 12\nMD, 9'} /></div>
            <div className="adm-field"><label>{t('aiReport.satisfaction')} (/100)</label>
              <input className="adm-input" type="number" min="0" max="100" value={edit.satisfaction} onChange={e => setE('satisfaction', e.target.value)} /></div>
          </div>

          <div className="adm-field"><label>{t('aiReport.complaints')} <span className="adm-rpt-tolabel">({t('admin.rpt.pipeHint')})</span></label>
            <textarea className="adm-input adm-mono-area" rows={4} value={edit.categoriesText} onChange={e => setE('categoriesText', e.target.value)} placeholder={'경기장 | 좌석 시야 개선 필요\n티켓 | 예매 안정성 개선'} /></div>

          <div className="adm-field"><label>{t('aiReport.suggestions')} <span className="adm-rpt-tolabel">({t('admin.rpt.pipeHint')})</span></label>
            <textarea className="adm-input adm-mono-area" rows={4} value={edit.suggestionsText} onChange={e => setE('suggestionsText', e.target.value)} placeholder={'좌석 개선 | 시야 방해 구역 우선 정비\n예매 안정화 | 대기열 시스템 도입'} /></div>

          <div className="adm-field"><label>{t('admin.rpt.operatorComment')} <span className="adm-rpt-tolabel">→ {t('admin.rpt.toClub')}</span></label>
            <textarea className="adm-input" rows={3} value={edit.operatorComment} onChange={e => setE('operatorComment', e.target.value)} placeholder={t('admin.rpt.operatorCommentPh')} /></div>

          {/* KPI (읽기 전용 집계) */}
          <div className="adm-field">
            <label>{t('aiReport.kpi')}</label>
            <div className="adm-rpt-kpi">
              <span>{t('aiReport.kpiOpinions')}: <b>{Number(edit.kpi.opinions || 0).toLocaleString()}</b></span>
              <span>{t('aiReport.kpiComments')}: <b>{Number(edit.kpi.comments || 0).toLocaleString()}</b></span>
              <span>{t('aiReport.kpiFans')}: <b>{Number(edit.kpi.members || 0).toLocaleString()}</b></span>
              <span>{t('aiReport.kpiResponses')}: <b>{Number(edit.kpi.responses || 0).toLocaleString()}</b></span>
              <span>{t('aiReport.kpiAiDate')}: <b>{edit.kpi.aiRunDate || '-'}</b></span>
            </div>
          </div>

          <div className="adm-form-actions">
            <button className="adm-btn-primary" onClick={saveEdit} disabled={busy}>{t('admin.save')}</button>
            {msg && <span className="adm-ai-msg" role="status">{msg}</span>}
          </div>
        </section>
      )}

      {/* 전달 기록 목록 */}
      {deliveries.length > 0 && (
        <section className="adm-panel adm-dash-section">
          <div className="adm-panel-head"><h2 className="adm-panel-title">{t('admin.rpt.deliveryLog')}</h2></div>
          <ul className="adm-recent">
            {deliveries.map(d => (
              <li key={d.id} className="adm-recent-item">
                <span className="adm-recent-ic" aria-hidden="true"><Icon name="check" size={16} /></span>
                <div className="adm-recent-body">
                  <span className="adm-recent-title">{teamName(d.teamId)}</span>
                  <span className="adm-recent-meta">{t('admin.rpt.deliveredBy', { by: d.operator || '-' })} · {t('admin.rpt.reportId')}: {String(d.reportId).slice(0, 10)}</span>
                </div>
                <span className="adm-recent-date">{fmt(d.deliveredAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
