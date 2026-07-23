import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { SkeletonList } from '../components/Skeleton.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Pagination from '../components/Pagination.jsx'
import { adminListInquiries, adminGetInquiry, adminReplyInquiry, adminSetInquiryStatus } from '../lib/supportRepo.js'
import { INQUIRY_CATEGORIES, INQUIRY_STATUSES, categoryKey, statusKey, statusBadgeClass, inquiryErrorKey } from '../lib/supportPolicy.js'

const PAGE_SIZE = 20
function fmt(ts) { if (!ts) return '-'; const d = new Date(ts); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` }

export default function AdminSupport() {
  const { t } = useLang()
  const toast = useToast()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState(null)          // 상세 문의
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await adminListInquiries({ status, category, q, page, pageSize: PAGE_SIZE })
    setRows(r.items); setTotal(r.total); setLoading(false)
  }, [status, category, q, page])
  useEffect(() => { load() }, [load])

  async function openDetail(id) {
    const d = await adminGetInquiry(id)
    setSel(d); setReply(d?.adminReply || '')
  }

  async function doReply(nextStatus) {
    if (!sel || busy) return
    setBusy(true)
    const r = await adminReplyInquiry(sel.id, reply, nextStatus)
    setBusy(false)
    if (!r.ok) { toast.error(t(inquiryErrorKey(r.code))); return }
    toast.info(t('admin.sup.saved'))
    await openDetail(sel.id); await load()
  }
  async function doStatus(nextStatus) {
    if (!sel || busy) return
    setBusy(true)
    const r = await adminSetInquiryStatus(sel.id, nextStatus)
    setBusy(false)
    if (!r.ok) { toast.error(t(inquiryErrorKey(r.code))); return }
    toast.info(t('admin.sup.statusChanged'))
    await openDetail(sel.id); await load()
  }

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <h1 className="adm-h1">{t('admin.menu.support')}</h1>
        <p className="adm-sub">{t('admin.sup.sub', { n: total })}</p>
      </header>

      <div className="adm-filters" role="group" aria-label={t('admin.sup.filterStatus')}>
        <button className={`adm-filter${status === '' ? ' on' : ''}`} onClick={() => { setStatus(''); setPage(1) }}>{t('admin.sup.fAll')}</button>
        {INQUIRY_STATUSES.map(s => (
          <button key={s} className={`adm-filter${status === s ? ' on' : ''}`} onClick={() => { setStatus(s); setPage(1) }}>{t(statusKey(s))}</button>
        ))}
      </div>
      <div className="adm-filters" role="group" aria-label={t('admin.sup.filterCategory')}>
        <button className={`adm-filter${category === '' ? ' on' : ''}`} onClick={() => { setCategory(''); setPage(1) }}>{t('admin.sup.catAll')}</button>
        {INQUIRY_CATEGORIES.map(c => (
          <button key={c} className={`adm-filter${category === c ? ' on' : ''}`} onClick={() => { setCategory(c); setPage(1) }}>{t(categoryKey(c))}</button>
        ))}
      </div>
      <input className="adm-search" type="search" value={q} placeholder={t('admin.sup.searchPh')}
        onChange={e => { setQ(e.target.value); setPage(1) }} />

      {loading ? <SkeletonList count={6} lines={2} />
        : rows.length === 0 ? <EmptyState iconName="comment" title={t('admin.sup.emptyTitle')} message={t('admin.sup.emptyMsg')} />
          : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead><tr>
                  <th>{t('admin.sup.colCategory')}</th><th>{t('admin.sup.colSubject')}</th>
                  <th>{t('admin.sup.colMember')}</th><th>{t('admin.sup.colStatus')}</th>
                  <th>{t('admin.sup.colDate')}</th><th></th>
                </tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td>{t(categoryKey(r.category))}</td>
                      <td className="adm-cell-strong">{r.subject}</td>
                      <td>{r.nickname || '-'}</td>
                      <td><span className={`adm-badge ${statusBadgeClass(r.status)}`}>{t(statusKey(r.status))}</span></td>
                      <td className="adm-mono">{fmt(r.createdAt)}</td>
                      <td><button className="adm-btn-sm" onClick={() => openDetail(r.id)}>{t('admin.sup.view')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      <Pagination page={page} total={Math.ceil(total / PAGE_SIZE)} onChange={setPage} />

      {sel && (
        <div className="adm-modal-overlay" role="dialog" aria-modal="true" aria-label={sel.subject}
          onClick={e => { if (e.target === e.currentTarget) setSel(null) }}>
          <div className="adm-modal adm-sup-modal">
            <div className="adm-panel-head">
              <h2 className="adm-h2 adm-panel-title">{t('admin.sup.detailTitle')}</h2>
              <button className="adm-btn-sm" onClick={() => setSel(null)}>{t('admin.mem.close')}</button>
            </div>
            <dl className="adm-report-dl">
              <div><dt>{t('admin.sup.colCategory')}</dt><dd>{t(categoryKey(sel.category))}</dd></div>
              <div><dt>{t('admin.sup.colStatus')}</dt><dd><span className={`adm-badge ${statusBadgeClass(sel.status)}`}>{t(statusKey(sel.status))}</span></dd></div>
              <div><dt>{t('admin.sup.colDate')}</dt><dd>{fmt(sel.createdAt)}</dd></div>
              <div><dt>{t('admin.sup.colMember')}</dt><dd>{sel.nickname || '-'}
                <button className="adm-text-link" onClick={() => navigate('/admin/members')}>{t('admin.sup.memberLink')}</button></dd></div>
              <div><dt>{t('admin.sup.colSubject')}</dt><dd className="adm-cell-strong">{sel.subject}</dd></div>
            </dl>
            <div className="adm-sup-content"><h3 className="adm-h3">{t('support.contentLabel')}</h3><p className="adm-sup-text">{sel.content}</p></div>

            <div className="adm-sup-reply">
              <h3 className="adm-h3">{t('admin.sup.replyTitle')}</h3>
              <textarea rows={5} value={reply} maxLength={5000} placeholder={t('admin.sup.replyPh')}
                onChange={e => setReply(e.target.value)} />
              <div className="adm-sup-actions">
                <button className="adm-btn-sm" disabled={busy || sel.status === 'in_progress'} onClick={() => doStatus('in_progress')}>{t('admin.sup.markInProgress')}</button>
                <button className="adm-btn-sm primary" disabled={busy || !reply.trim()} onClick={() => doReply('resolved')}>{t('admin.sup.replyResolve')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
