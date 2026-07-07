import { useState, useEffect } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { SkeletonList } from '../components/Skeleton.jsx'
import Icon from '../components/Icon.jsx'
import {
  adminListSources, updateSource, setEnabled, testSource, statusOf, FAILURE_THRESHOLD,
} from '../lib/news/newsSourcesRepo.js'

// 상태 코드 → 아이콘/배지 클래스
const STATUS = {
  ok:       { icon: 'check', cls: 'ns-ok' },
  no_rss:   { icon: 'rss', cls: 'ns-warn' },
  failed:   { icon: 'alert', cls: 'ns-fail' },
  disabled: { icon: 'power', cls: 'ns-off' },
}

function fmt(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d)) return '—'
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function AdminNewsSources() {
  const { t } = useLang()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)   // clubId
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(null)    // clubId being tested
  const [results, setResults] = useState({})      // clubId -> { ok, count, error, at }

  useEffect(() => {
    let active = true
    adminListSources().then(list => { if (active) { setRows(list); setLoading(false) } })
    return () => { active = false }
  }, [])

  const failing = rows.filter(r => (r.failureCount || 0) >= FAILURE_THRESHOLD)

  function reloadRow(clubId, next) {
    setRows(list => list.map(r => (r.clubId === clubId ? { ...r, ...next } : r)))
  }

  // ── 사용 여부 토글 ──
  async function onToggle(row) {
    const res = await setEnabled(row.clubId, !(row.enabled !== false))
    if (res.ok) reloadRow(row.clubId, res.source)
  }

  // ── 연결 테스트 ──
  async function onTest(row) {
    setTesting(row.clubId)
    const res = await testSource(row.clubId)
    setResults(r => ({ ...r, [row.clubId]: res }))
    setTesting(null)
    // 상태 반영을 위해 목록 갱신
    const list = await adminListSources()
    setRows(list)
  }

  // ── 수정 ──
  function openEdit(row) {
    setError('')
    setForm({
      clubId: row.clubId,
      clubName: row.clubName,
      officialWebsite: row.officialWebsite || '',
      rssUrl: row.rssUrl || '',
      enabled: row.enabled !== false,
      sources: (row.sources && row.sources.length ? row.sources : [{ label: '뉴스', url: '' }]).map(s => ({ ...s })),
    })
    setEditing(row.clubId)
  }
  function closeEdit() { setEditing(null); setForm(null); setError('') }
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setSource = (i, k, v) => setForm(f => ({ ...f, sources: f.sources.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }))
  const addSource = () => setForm(f => ({ ...f, sources: [...f.sources, { label: '', url: '' }] }))
  const removeSource = i => setForm(f => ({ ...f, sources: f.sources.filter((_, j) => j !== i) }))

  async function save(e) {
    e.preventDefault()
    const sources = form.sources.map(s => ({ label: (s.label || '').trim() || '뉴스', url: (s.url || '').trim() })).filter(s => s.url)
    const res = await updateSource(form.clubId, {
      officialWebsite: form.officialWebsite.trim(),
      rssUrl: form.rssUrl.trim() || null,
      enabled: form.enabled,
      sources,
    })
    if (!res.ok) { setError(res.error || t('admin.ns.errSave')); return }
    reloadRow(form.clubId, res.source)
    closeEdit()
  }

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <h1 className="adm-h1">{t('admin.ns.title')}</h1>
        <p className="adm-sub">{t('admin.ns.sub', { n: rows.length })}</p>
      </header>

      {/* 실패 임계 알림 배너 */}
      {failing.length > 0 && (
        <div className="ns-banner" role="alert">
          <Icon name="alert" size={18} />
          <span>{t('admin.ns.alertBanner', { clubs: failing.map(f => f.clubName).join(', '), n: FAILURE_THRESHOLD })}</span>
        </div>
      )}

      {loading ? (
        <SkeletonList count={6} lines={1} />
      ) : rows.length === 0 ? (
        <EmptyState iconName="rss" title={t('admin.ns.emptyTitle')} message={t('admin.ns.emptyMsg')} />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table ns-table">
            <thead>
              <tr>
                <th>{t('admin.ns.club')}</th>
                <th>{t('admin.ns.status')}</th>
                <th>{t('admin.ns.sources')}</th>
                <th>{t('admin.ns.rss')}</th>
                <th>{t('admin.ns.lastSuccess')}</th>
                <th>{t('admin.ns.lastFailure')}</th>
                <th>{t('admin.ns.enabled')}</th>
                <th className="ns-actions-col">{t('admin.ns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const code = statusOf(row)
                const st = STATUS[code]
                const res = results[row.clubId]
                return (
                  <tr key={row.clubId}>
                    <td>
                      <div className="ns-club">{row.clubName}</div>
                      {row.officialWebsite && (
                        <a className="ns-link" href={row.officialWebsite} target="_blank" rel="noopener noreferrer">
                          <Icon name="globe" size={12} /> {t('admin.ns.official')}
                        </a>
                      )}
                    </td>
                    <td>
                      <span className={`ns-badge ${st.cls}`}><Icon name={st.icon} size={13} /> {t(`admin.ns.st.${code}`)}</span>
                      {res && (
                        <div className={`ns-testres ${res.ok ? 'ok' : 'fail'}`}>
                          {res.ok
                            ? t('admin.ns.testOk', { n: res.count })
                            : t('admin.ns.testFail', { reason: t(`admin.ns.reason.${res.error || 'error'}`) })}
                          <span className="ns-testat">{fmt(res.at)}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      {(row.sources || []).map((s, i) => (
                        <a key={i} className="ns-link ns-src" href={s.url} target="_blank" rel="noopener noreferrer" title={s.url}>
                          <Icon name="external" size={11} /> {s.label}
                        </a>
                      ))}
                    </td>
                    <td>{row.rssUrl
                      ? <a className="ns-link" href={row.rssUrl} target="_blank" rel="noopener noreferrer"><Icon name="rss" size={12} /> RSS</a>
                      : <span className="ns-muted">{t('admin.ns.noRss')}</span>}</td>
                    <td className="ns-time">{fmt(row.lastSuccessAt)}</td>
                    <td className="ns-time">{fmt(row.lastFailureAt)}{(row.failureCount || 0) > 0 && <span className="ns-fcount"> ({row.failureCount})</span>}</td>
                    <td>
                      <button className={`ns-toggle${row.enabled !== false ? ' on' : ''}`} onClick={() => onToggle(row)}
                        role="switch" aria-checked={row.enabled !== false} aria-label={t('admin.ns.enabled')}>
                        <span className="ns-toggle-dot" />
                      </button>
                    </td>
                    <td className="ns-actions-col">
                      <button className="adm-btn-sm" onClick={() => onTest(row)} disabled={testing === row.clubId}>
                        <Icon name="link" size={13} /> {testing === row.clubId ? t('admin.ns.testing') : t('admin.ns.test')}
                      </button>
                      <button className="adm-btn-sm" onClick={() => openEdit(row)}>
                        <Icon name="edit" size={13} /> {t('admin.ns.edit')}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 수정 폼 (모달) */}
      {editing && form && (
        <div className="ns-modal-backdrop" onClick={closeEdit}>
          <form className="ns-modal adm-form" onClick={e => e.stopPropagation()} onSubmit={save}>
            <h2 className="ns-modal-title">{form.clubName} — {t('admin.ns.editTitle')}</h2>

            <label className="adm-field">
              <span>{t('admin.ns.official')}</span>
              <input value={form.officialWebsite} onChange={e => setField('officialWebsite', e.target.value)} placeholder="https://" />
            </label>

            <div className="adm-field">
              <span>{t('admin.ns.sources')}</span>
              {form.sources.map((s, i) => (
                <div key={i} className="ns-src-row">
                  <input className="ns-src-label" value={s.label} onChange={e => setSource(i, 'label', e.target.value)} placeholder={t('admin.ns.label')} />
                  <input className="ns-src-url" value={s.url} onChange={e => setSource(i, 'url', e.target.value)} placeholder="https://" />
                  <button type="button" className="ns-src-del" onClick={() => removeSource(i)} aria-label={t('admin.ns.remove')}>×</button>
                </div>
              ))}
              <button type="button" className="adm-btn-sm ns-add" onClick={addSource}>+ {t('admin.ns.addSource')}</button>
            </div>

            <label className="adm-field">
              <span>{t('admin.ns.rss')}</span>
              <input value={form.rssUrl} onChange={e => setField('rssUrl', e.target.value)} placeholder={t('admin.ns.rssPh')} />
            </label>

            <label className="ns-check">
              <input type="checkbox" checked={form.enabled} onChange={e => setField('enabled', e.target.checked)} />
              <span>{t('admin.ns.useSource')}</span>
            </label>

            {error && <div className="adm-error" role="alert">{error}</div>}
            <div className="ns-modal-actions">
              <button type="button" className="adm-btn" onClick={closeEdit}>{t('common.cancel')}</button>
              <button type="submit" className="adm-btn-primary">{t('admin.save')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
