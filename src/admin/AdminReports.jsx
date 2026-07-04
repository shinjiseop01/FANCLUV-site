import { useState, useEffect } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { adminListReports, resolveReport, deleteReport, moderateTarget } from '../lib/reportsRepo.js'

const FILTERS = ['all', 'pending', 'resolved']

export default function AdminReports() {
  const { t } = useLang()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    adminListReports().then(list => {
      if (!active) return
      setReports(list)
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  const pendingCount = reports.filter(r => r.status === 'pending').length
  const visible = reports.filter(r => (filter === 'all' ? true : r.status === filter))
  const selected = reports.find(r => r.id === selectedId) || null

  const reasonLabel = code => t(`report.reason.${code}`)

  async function onResolve(id) {
    setBusy(true)
    await resolveReport(id)
    setReports(list => list.map(r => (r.id === id ? { ...r, status: 'resolved' } : r)))
    setBusy(false)
  }

  async function onModerate(report, action) {
    setBusy(true)
    // 대상 콘텐츠를 숨김/삭제하고 신고를 처리 완료 처리한다.
    await moderateTarget(report, action)
    setReports(list => list.map(r => (r.id === report.id ? { ...r, status: 'resolved' } : r)))
    setBusy(false)
  }

  async function onDelete(id) {
    setBusy(true)
    await deleteReport(id)
    setReports(list => list.filter(r => r.id !== id))
    if (selectedId === id) setSelectedId(null)
    setBusy(false)
  }

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <h1 className="adm-h1">{t('admin.menu.reports')}</h1>
        <p className="adm-sub">{t('admin.rp.sub', { n: pendingCount })}</p>
      </header>

      {/* 상태 필터 */}
      <div className="adm-toolbar">
        <div className="adm-filters" role="group" aria-label={t('admin.rp.colStatus')}>
          {FILTERS.map(f => (
            <button key={f} className={`adm-filter${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? t('admin.rp.filterAll') : f === 'pending' ? t('admin.rp.pending') : t('admin.rp.resolved')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="adm-loading" role="status">{t('common.loading')}</p>
      ) : visible.length === 0 ? (
        <EmptyState iconName="flag" title={t('admin.rp.emptyTitle')} message={t('admin.rp.emptyMsg')} />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('admin.rp.colTarget')}</th>
                <th>{t('admin.rp.colReason')}</th>
                <th>{t('admin.rp.colReporter')}</th>
                <th>{t('admin.rp.colDate')}</th>
                <th>{t('admin.rp.colStatus')}</th>
                <th className="adm-col-actions">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id} className={r.status === 'resolved' ? 'is-hidden' : ''}>
                  <td className="adm-cell-content">
                    <span className="adm-badge type">{t(`admin.rp.type.${r.targetType}`)}</span>
                    {r.target}
                  </td>
                  <td><span className="adm-badge reason">{reasonLabel(r.reason)}</span></td>
                  <td className="adm-cell-muted">{r.reporter}</td>
                  <td className="adm-cell-muted">{r.date}</td>
                  <td>
                    <span className={`adm-badge ${r.status === 'pending' ? 'pending' : 'active'}`}>
                      {r.status === 'pending' ? t('admin.rp.pending') : t('admin.rp.resolved')}
                    </span>
                  </td>
                  <td className="adm-col-actions">
                    <div className="adm-actions">
                      <button className={`adm-btn-sm${selectedId === r.id ? ' on' : ''}`} onClick={() => setSelectedId(id => (id === r.id ? null : r.id))}>
                        {t('admin.rp.view')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 신고 상세 + 처리 */}
      {selected && (
        <section className="adm-comments adm-report-detail">
          <div className="adm-comments-head">
            <h2 className="adm-h2">{t('admin.rp.detailTitle')}</h2>
            <button className="adm-btn-ghost" onClick={() => setSelectedId(null)}>{t('common.close')}</button>
          </div>

          <dl className="adm-report-dl">
            <div><dt>{t('admin.rp.colTarget')}</dt><dd><span className="adm-badge type">{t(`admin.rp.type.${selected.targetType}`)}</span> {selected.target}</dd></div>
            <div><dt>{t('admin.rp.colReporter')}</dt><dd>{selected.reporter}</dd></div>
            <div><dt>{t('admin.rp.colReason')}</dt><dd>{reasonLabel(selected.reason)}</dd></div>
            {selected.reason === 'other' && selected.detail && (
              <div><dt>{t('admin.rp.detailLabel')}</dt><dd className="adm-report-detail-text">{selected.detail}</dd></div>
            )}
            <div><dt>{t('admin.rp.colDate')}</dt><dd>{selected.date}</dd></div>
            <div><dt>{t('admin.rp.colStatus')}</dt><dd>
              <span className={`adm-badge ${selected.status === 'pending' ? 'pending' : 'active'}`}>
                {selected.status === 'pending' ? t('admin.rp.pending') : t('admin.rp.resolved')}
              </span>
            </dd></div>
          </dl>

          <div className="adm-report-actions">
            {selected.targetType === 'comment' ? (
              <>
                <button className="adm-btn-sm" disabled={busy} onClick={() => onModerate(selected, 'hide')}>{t('admin.rp.hideComment')}</button>
                <button className="adm-btn-sm danger" disabled={busy} onClick={() => onModerate(selected, 'delete')}>{t('admin.rp.deleteComment')}</button>
              </>
            ) : (
              <>
                <button className="adm-btn-sm" disabled={busy} onClick={() => onModerate(selected, 'hide')}>{t('admin.rp.hidePost')}</button>
                <button className="adm-btn-sm danger" disabled={busy} onClick={() => onModerate(selected, 'delete')}>{t('admin.rp.deletePost')}</button>
              </>
            )}
            <button className="adm-btn-sm primary" disabled={busy || selected.status === 'resolved'} onClick={() => onResolve(selected.id)}>{t('admin.rp.resolve')}</button>
            <button className="adm-btn-ghost" disabled={busy} onClick={() => onDelete(selected.id)}>{t('admin.rp.deleteReport')}</button>
          </div>
        </section>
      )}
    </div>
  )
}
