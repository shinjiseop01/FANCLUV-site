import { useState, useEffect, useMemo } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { SkeletonList } from '../components/Skeleton.jsx'
import Icon from '../components/Icon.jsx'
import AdminNoteBox from './AdminNoteBox.jsx'
import { adminListReports, resolveReport, rejectReport, deleteReport, moderateTarget } from '../lib/reportsRepo.js'
import { exportCsv } from '../lib/admin/csv.js'

const FILTERS = ['all', 'pending', 'resolved', 'rejected']

// 상태별 배지 클래스
function statusCls(s) {
  if (s === 'resolved') return 'active'
  if (s === 'rejected') return 'rejected'
  return 'pending'
}

export default function AdminReports() {
  const { t } = useLang()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
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
  const reasonLabel = code => t(`report.reason.${code}`)
  const statusLabel = s => s === 'resolved' ? t('admin.rp.resolved') : s === 'rejected' ? t('admin.rp.rejected') : t('admin.rp.pending')

  // 검색: 신고자 / 대상 / 사유 / 날짜 (상태는 필터로) 를 텍스트로 검색.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return reports.filter(r => {
      if (filter !== 'all' && r.status !== filter) return false
      if (!q) return true
      return [r.reporter, r.target, reasonLabel(r.reason), r.date, statusLabel(r.status)]
        .some(v => String(v || '').toLowerCase().includes(q))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports, filter, query, t])

  const selected = reports.find(r => r.id === selectedId) || null

  function patchStatus(id, status) {
    setReports(list => list.map(r => (r.id === id ? { ...r, status } : r)))
  }

  async function onResolve(id) { setBusy(true); await resolveReport(id); patchStatus(id, 'resolved'); setBusy(false) }
  async function onReject(id) { setBusy(true); await rejectReport(id); patchStatus(id, 'rejected'); setBusy(false) }
  async function onModerate(report, action) {
    setBusy(true)
    await moderateTarget(report, action)   // 대상 콘텐츠 숨김/삭제 후 처리 완료
    patchStatus(report.id, 'resolved')
    setBusy(false)
  }
  async function onDelete(id) {
    setBusy(true)
    await deleteReport(id)
    setReports(list => list.filter(r => r.id !== id))
    if (selectedId === id) setSelectedId(null)
    setBusy(false)
  }

  function downloadCsv() {
    const cols = [
      { key: 'id', label: 'ID' },
      { key: 'targetType', label: t('admin.rp.colTargetType') },
      { key: 'target', label: t('admin.rp.colTarget') },
      { key: 'reporter', label: t('admin.rp.colReporter') },
      { key: 'reason', label: t('admin.rp.colReason') },
      { key: 'detail', label: t('admin.rp.detailLabel') },
      { key: 'date', label: t('admin.rp.colDate') },
      { key: 'status', label: t('admin.rp.colStatus') },
    ]
    const rows = visible.map(r => ({
      id: r.id, targetType: t(`admin.rp.type.${r.targetType}`), target: r.target,
      reporter: r.reporter, reason: reasonLabel(r.reason), detail: r.detail || '',
      date: r.date, status: statusLabel(r.status),
    }))
    exportCsv('fancluv_reports', cols, rows)
  }

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-head-row">
        <div>
          <h1 className="adm-h1">{t('admin.menu.reports')}</h1>
          <p className="adm-sub">{t('admin.rp.sub', { n: pendingCount })}</p>
        </div>
        <button className="adm-btn-ghost adm-csv-btn" onClick={downloadCsv} disabled={visible.length === 0}>
          <Icon name="external" size={15} /> {t('admin.csv')}
        </button>
      </header>

      {/* 검색 + 상태 필터 */}
      <div className="adm-toolbar">
        <div className="adm-search">
          <Icon name="search" size={18} />
          <input type="search" placeholder={t('admin.rp.searchPh')} value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="adm-filters" role="group" aria-label={t('admin.rp.colStatus')}>
          {FILTERS.map(f => (
            <button key={f} className={`adm-filter${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? t('admin.rp.filterAll') : statusLabel(f)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <SkeletonList count={5} lines={1} />
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
                <tr key={r.id} className={r.status !== 'pending' ? 'is-hidden' : ''}>
                  <td className="adm-cell-content">
                    <span className="adm-badge type">{t(`admin.rp.type.${r.targetType}`)}</span>
                    {r.target}
                  </td>
                  <td><span className="adm-badge reason">{reasonLabel(r.reason)}</span></td>
                  <td className="adm-cell-muted">{r.reporter}</td>
                  <td className="adm-cell-muted">{r.date}</td>
                  <td><span className={`adm-badge ${statusCls(r.status)}`}>{statusLabel(r.status)}</span></td>
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

      {/* 신고 상세 + 처리 + 관리자 메모 */}
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
              <span className={`adm-badge ${statusCls(selected.status)}`}>{statusLabel(selected.status)}</span>
            </dd></div>
          </dl>

          <div className="adm-report-actions">
            {selected.targetType === 'comment' ? (
              <button className="adm-btn-sm" disabled={busy} onClick={() => onModerate(selected, 'hide')}>{t('admin.rp.hideComment')}</button>
            ) : (
              <button className="adm-btn-sm" disabled={busy} onClick={() => onModerate(selected, 'hide')}>{t('admin.rp.hidePost')}</button>
            )}
            <button className="adm-btn-sm primary" disabled={busy || selected.status === 'resolved'} onClick={() => onResolve(selected.id)}>{t('admin.rp.resolve')}</button>
            <button className="adm-btn-sm" disabled={busy || selected.status === 'rejected'} onClick={() => onReject(selected.id)}>{t('admin.rp.reject')}</button>
            <button className="adm-btn-sm danger" disabled={busy} onClick={() => onModerate(selected, 'delete')}>
              {selected.targetType === 'comment' ? t('admin.rp.deleteComment') : t('admin.rp.deletePost')}
            </button>
            <button className="adm-btn-ghost" disabled={busy} onClick={() => onDelete(selected.id)}>{t('admin.rp.deleteReport')}</button>
          </div>

          <AdminNoteBox entityType="report" entityId={selected.id} />
        </section>
      )}
    </div>
  )
}
