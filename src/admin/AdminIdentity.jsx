// FANCLUV — 관리자 본인인증 관측 패널.
//
// admin_identity_status RPC(is_admin 게이트) → 회원별 인증 상태를 조회한다.
// ⚠️ DI/CI 원문은 절대 노출하지 않는다 — 존재여부(boolean)만 표시한다.
import { useState, useEffect } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import Icon from '../components/Icon.jsx'
import Button from '../components/Button.jsx'
import { SkeletonList } from '../components/Skeleton.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Pagination from '../components/Pagination.jsx'
import { usePagination } from '../lib/usePagination.js'
import { adminListIdentityStatus } from '../lib/admin/adminIdentityRepo.js'
import { statusMeta } from '../lib/identity/identityStatus.js'
import { IDENTITY_AGENCY_LABELS } from '../lib/identity/identityAdapter.js'

function fmt(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d)) return '—'
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 존재여부 boolean 표시(원문 없음).
function BoolCell({ on, t }) {
  return on
    ? <span className="idn-bool idn-bool-on"><Icon name="check" size={13} aria-hidden="true" /> {t('common.yes')}</span>
    : <span className="idn-bool idn-bool-off"><Icon name="close" size={13} aria-hidden="true" /> {t('common.no')}</span>
}

// 앞 8자만 표시(전체 식별자 노출 최소화).
function shortId(id) { return id ? `${String(id).slice(0, 8)}…` : '—' }

export default function AdminIdentity() {
  const { t } = useLang()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const { paged, page, total, setPage } = usePagination(rows, 20)

  async function refresh() {
    setLoading(true)
    const data = await adminListIdentityStatus(500)
    setRows(Array.isArray(data) ? data : [])
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  const verifiedCount = rows.filter(r => r.latest_status === 'verified').length
  const blockedCount = rows.filter(r => r.latest_status === 'blocked').length

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-head-row">
        <div>
          <h1 className="adm-h1">{t('admin.identity.title')}</h1>
          <p className="adm-sub">{t('admin.identity.sub')}</p>
        </div>
        <Button variant="secondary" size="lg" leftIcon="refresh" loading={loading} onClick={refresh}>
          {t('admin.identity.refresh')}
        </Button>
      </header>

      <div className="idn-notice" role="note">
        <Icon name="lock" size={14} aria-hidden="true" />
        <span>{t('admin.identity.privacyNote')}</span>
      </div>

      {!loading && rows.length > 0 && (
        <div className="idn-summary" aria-label={t('admin.identity.summary')}>
          <div className="idn-metric"><span className="idn-metric-label">{t('admin.identity.total')}</span><strong className="idn-metric-value">{rows.length}</strong></div>
          <div className="idn-metric"><span className="idn-metric-label">{t('identity.st.verified')}</span><strong className="idn-metric-value is-ok">{verifiedCount}</strong></div>
          <div className="idn-metric"><span className="idn-metric-label">{t('identity.st.blocked')}</span><strong className={`idn-metric-value ${blockedCount ? 'is-bad' : ''}`}>{blockedCount}</strong></div>
        </div>
      )}

      {loading ? (
        <SkeletonList count={6} lines={1} />
      ) : rows.length === 0 ? (
        <EmptyState iconName="userCheck" title={t('admin.identity.emptyTitle')} message={t('admin.identity.emptyMsg')} compact />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table idn-table">
            <thead>
              <tr>
                <th>{t('admin.identity.col.user')}</th>
                <th>{t('admin.identity.col.provider')}</th>
                <th>{t('admin.identity.col.status')}</th>
                <th>{t('admin.identity.col.di')}</th>
                <th>{t('admin.identity.col.ci')}</th>
                <th className="idn-num">{t('admin.identity.col.failures')}</th>
                <th>{t('admin.identity.col.verifiedAt')}</th>
                <th>{t('admin.identity.col.lastAttempt')}</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(r => {
                const meta = statusMeta(r.latest_status || 'unverified')
                return (
                  <tr key={r.user_id}>
                    <td className="idn-uid" title={r.user_id}>{shortId(r.user_id)}</td>
                    <td>{IDENTITY_AGENCY_LABELS[r.provider] || (r.provider || '—')}</td>
                    <td><span className={`idn-badge idn-badge-${meta.tone}`}><Icon name={meta.icon} size={12} aria-hidden="true" /> {t(meta.labelKey)}</span></td>
                    <td><BoolCell on={!!r.di_present} t={t} /></td>
                    <td><BoolCell on={!!r.ci_present} t={t} /></td>
                    <td className={`idn-num ${(r.failure_count || 0) >= 5 ? 'is-bad' : ''}`}>{r.failure_count || 0}</td>
                    <td className="idn-time">{fmt(r.verified_at)}</td>
                    <td className="idn-time">{fmt(r.last_attempt_at)}</td>
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
