import { useState, useEffect } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import Icon from '../components/Icon.jsx'
import { SkeletonList } from '../components/Skeleton.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Pagination from '../components/Pagination.jsx'
import { usePagination } from '../lib/usePagination.js'
import {
  SERVICES, listServices, listLogs, testService, testAll, FAILURE_THRESHOLD,
} from '../lib/admin/integrationHealthRepo.js'

// 상태 코드 → 아이콘/클래스
const STATUS = {
  ok:       { icon: 'check', cls: 'sys-ok' },
  slow:     { icon: 'clock', cls: 'sys-slow' },
  error:    { icon: 'alert', cls: 'sys-error' },
  disabled: { icon: 'power', cls: 'sys-off' },
  unknown:  { icon: 'refresh', cls: 'sys-unknown' },
}

// 알려진 사유 코드는 번역, 아니면 원문 메시지 그대로 표시.
const KNOWN_REASONS = ['not_configured', 'supabase_not_configured', 'network', 'empty', 'denied', 'not_requested', 'unsupported', 'openai_error', 'no_result', 'forbidden', 'unauthorized', 'error', 'timeout']
function reasonText(t, code) {
  if (!code) return t('admin.sys.reason.error')
  return KNOWN_REASONS.includes(code) ? t(`admin.sys.reason.${code}`) : code
}

function fmt(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d)) return '—'
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function AdminSystemStatus() {
  const { t } = useLang()
  const [rows, setRows] = useState([])
  const [logs, setLogs] = useState([])
  const { paged, page, total, setPage } = usePagination(logs, 20)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(null)   // key or 'all'
  const [results, setResults] = useState({})      // key -> { ok, ms, error }

  async function refresh() {
    const [svcs, lg] = await Promise.all([listServices(), listLogs()])
    setRows(svcs); setLogs(lg); setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  async function onTest(key) {
    setTesting(key)
    const res = await testService(key)
    setResults(r => ({ ...r, [key]: res }))
    setTesting(null)
    refresh()
  }
  async function onTestAll() {
    setTesting('all')
    await testAll()
    setTesting(null)
    setResults({})
    refresh()
  }

  const failing = rows.filter(r => (r.consecutiveFailures || 0) >= FAILURE_THRESHOLD)
  const labelOf = key => t(SERVICES.find(s => s.key === key)?.labelKey || key)

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-head-row">
        <div>
          <h1 className="adm-h1">{t('admin.sys.title')}</h1>
          <p className="adm-sub">{t('admin.sys.sub')}</p>
        </div>
        <button className="adm-btn-primary" onClick={onTestAll} disabled={testing === 'all'}>
          <Icon name="refresh" size={14} /> {testing === 'all' ? t('admin.sys.testingAll') : t('admin.sys.testAll')}
        </button>
      </header>

      {failing.length > 0 && (
        <div className="ns-banner" role="alert">
          <Icon name="alert" size={18} />
          <span>{t('admin.sys.alertBanner', { services: failing.map(f => labelOf(f.key)).join(', '), n: FAILURE_THRESHOLD })}</span>
        </div>
      )}

      {loading ? (
        <SkeletonList count={4} lines={1} />
      ) : (
        <>
          {/* 서비스 상태 카드 그리드 */}
          <div className="sys-grid">
            {rows.map(row => {
              const st = STATUS[row.status] || STATUS.unknown
              const res = results[row.key]
              return (
                <div key={row.key} className={`sys-card ${st.cls}`}>
                  <div className="sys-card-head">
                    <span className={`sys-badge ${st.cls}`}><Icon name={st.icon} size={13} /> {t(`admin.sys.st.${row.status}`)}</span>
                    {row.responseMs != null && <span className="sys-ms">{row.responseMs}ms</span>}
                  </div>
                  <div className="sys-name">{labelOf(row.key)}</div>
                  <dl className="sys-meta">
                    <div><dt>{t('admin.sys.lastSuccess')}</dt><dd>{fmt(row.lastSuccessAt)}</dd></div>
                    <div><dt>{t('admin.sys.lastFailure')}</dt><dd>{fmt(row.lastFailureAt)}{(row.consecutiveFailures || 0) > 0 && <span className="sys-fcount"> ×{row.consecutiveFailures}</span>}</dd></div>
                  </dl>
                  {res && (
                    <div className={`sys-testres ${res.ok ? 'ok' : 'fail'}`}>
                      {res.ok
                        ? t('admin.sys.testOk', { ms: res.ms ?? 0 })
                        : t('admin.sys.testFail', { reason: reasonText(t, res.error) })}
                    </div>
                  )}
                  <button className="adm-btn-sm sys-test-btn" onClick={() => onTest(row.key)} disabled={testing === row.key}>
                    <Icon name="link" size={13} /> {testing === row.key ? t('admin.sys.testing') : t('admin.sys.test')}
                  </button>
                </div>
              )
            })}
          </div>

          {/* 시스템 로그 */}
          <section className="sys-logs">
            <h2 className="adm-h2 sys-logs-title">{t('admin.sys.logsTitle')} <span className="sys-logs-count">({logs.length})</span></h2>
            {logs.length === 0 ? (
              <EmptyState iconName="check" title={t('admin.sys.logsEmptyTitle')} message={t('admin.sys.logsEmptyMsg')} compact />
            ) : (
              <div className="adm-table-wrap">
                <table className="adm-table sys-log-table">
                  <thead>
                    <tr>
                      <th>{t('admin.sys.log.time')}</th>
                      <th>{t('admin.sys.log.service')}</th>
                      <th>{t('admin.sys.log.status')}</th>
                      <th>{t('admin.sys.log.message')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map(l => {
                      const st = STATUS[l.status] || STATUS.unknown
                      return (
                        <tr key={l.id}>
                          <td className="sys-time">{fmt(l.createdAt)}</td>
                          <td>{labelOf(l.service)}</td>
                          <td><span className={`sys-badge ${st.cls}`}><Icon name={st.icon} size={12} /> {t(`admin.sys.st.${l.status}`)}</span></td>
                          <td className="sys-msg">{l.message ? reasonText(t, l.message) : '—'}{l.responseMs != null && <span className="sys-ms-inline"> · {l.responseMs}ms</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <Pagination page={page} total={total} onChange={setPage} />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
