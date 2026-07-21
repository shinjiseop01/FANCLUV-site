// FANCLUV Admin — AI 작성 지원 상태/통제(§14).
//
// 비식별 집계와 kill switch 중심. 관리자가 사용자 원문을 열람하는 UI 는 제공하지 않는다.
import { useState, useEffect, useCallback } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { getAiStats, getAiSettings, setAiEnabled } from '../lib/ai/aiWritingRepo.js'
import './AdminAiWriting.css'

const OP_ORDER = ['improve', 'constructive', 'summarize', 'titles', 'structure']

export default function AdminAiWriting() {
  const { t } = useLang()
  const [settings, setSettings] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    const [s, st] = await Promise.all([getAiSettings(), getAiStats(null)])
    if (s?.ok === false || st?.ok === false) setError(t('aiw.admin.loadErr'))
    setSettings(s?.ok === false ? null : s)
    setStats(st?.ok === false ? null : st)
    setLoading(false)
  }, [t])

  useEffect(() => { refresh() }, [refresh])

  async function toggleKill() {
    if (!settings) return
    setBusy(true)
    const next = !settings.enabled
    const res = await setAiEnabled(next)
    setBusy(false)
    if (res?.ok) setSettings(s => ({ ...s, enabled: next }))
    else setError(t('aiw.admin.toggleErr'))
  }

  const stat = (labelKey, value, tone) => (
    <div className={`aia-stat${tone ? ' aia-stat-' + tone : ''}`}>
      <span className="aia-stat-v">{value ?? 0}</span>
      <span className="aia-stat-l">{t(labelKey)}</span>
    </div>
  )

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <h1 className="adm-h1">{t('admin.menu.aiWriting')}</h1>
        <p className="adm-sub">{t('aiw.admin.sub')}</p>
      </header>

      {error && <div className="adm-card aia-error" role="alert">{error}</div>}

      {/* Provider / kill switch */}
      <section className="adm-card">
        <div className="aia-row">
          <div>
            <h2 className="adm-h2">{t('aiw.admin.provider')}</h2>
            <p className="aia-provider">
              <span className="aia-badge">{settings?.provider || 'mock'}</span>
              <span className={`aia-status ${settings?.enabled ? 'on' : 'off'}`}>
                {settings?.enabled ? t('aiw.admin.active') : t('aiw.admin.inactive')}
              </span>
            </p>
          </div>
          <button type="button" className={`aia-kill ${settings?.enabled ? 'is-on' : 'is-off'}`}
            onClick={toggleKill} disabled={busy || !settings} aria-pressed={!settings?.enabled}>
            {settings?.enabled ? t('aiw.admin.killDisable') : t('aiw.admin.killEnable')}
          </button>
        </div>
        <p className="aia-killnote">{t('aiw.admin.killNote')}</p>
      </section>

      {/* 오늘 집계(비식별) */}
      <section className="adm-card">
        <div className="aia-row">
          <h2 className="adm-h2">{t('aiw.admin.today')}</h2>
          <button type="button" className="aia-refresh" onClick={refresh} disabled={loading}>{t('aiw.admin.refresh')}</button>
        </div>
        {loading ? (
          <p className="aia-muted">{t('aiw.admin.loading')}</p>
        ) : (
          <>
            <div className="aia-stats">
              {stat('aiw.admin.total', stats?.total)}
              {stat('aiw.admin.success', stats?.success, 'ok')}
              {stat('aiw.admin.failed', stats?.failed, 'bad')}
              {stat('aiw.admin.rateLimited', stats?.rate_limited, 'warn')}
              {stat('aiw.admin.duplicate', stats?.duplicate)}
              {stat('aiw.admin.avgMs', (stats?.avg_ms ?? 0) + 'ms')}
              {stat('aiw.admin.units', stats?.estimated_units)}
            </div>

            <h3 className="aia-h3">{t('aiw.admin.byOp')}</h3>
            <div className="aia-ops">
              {OP_ORDER.map(op => (
                <div key={op} className="aia-op">
                  <span className="aia-op-l">{t(`aiw.op.${op}`)}</span>
                  <span className="aia-op-v">{stats?.by_operation?.[op] ?? 0}</span>
                </div>
              ))}
            </div>

            <h3 className="aia-h3">{t('aiw.admin.recentErrors')}</h3>
            {stats?.recent_error_codes?.length ? (
              <div className="aia-errs">
                {stats.recent_error_codes.map((c, i) => <span key={i} className="aia-errcode">{c}</span>)}
              </div>
            ) : <p className="aia-muted">{t('aiw.admin.noErrors')}</p>}
          </>
        )}
        <p className="aia-privacy">{t('aiw.admin.privacyNote')}</p>
      </section>
    </div>
  )
}
