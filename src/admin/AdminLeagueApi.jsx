import { useState, useEffect } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import Icon from '../components/Icon.jsx'
import { SkeletonList } from '../components/Skeleton.jsx'
import {
  getLeagueStatus, testLeagueApi, resetLeagueOps,
  STANDING_FIELDS, MATCH_FIELDS, FAILURE_THRESHOLD,
} from '../lib/admin/leagueOpsRepo.js'

// 데이터 출처(fallback 단계) → 표시 라벨 키.
const SOURCE_KEY = {
  edge: 'admin.lg.srcApi', api: 'admin.lg.srcApi',
  cache: 'admin.lg.srcCache', mock: 'admin.lg.srcMock',
}

function fmt(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d)) return '—'
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 테스트 항목 카드(순위표/일정/결과).
function TestCard({ t, labelKey, icon, res }) {
  const ok = res?.ok
  return (
    <div className={`sys-card ${res ? (ok ? 'sys-ok' : 'sys-error') : 'sys-unknown'}`}>
      <div className="sys-card-head">
        <span className="lg-test-name"><Icon name={icon} size={15} /> {t(labelKey)}</span>
        {res && <span className={`sys-badge ${ok ? 'sys-ok' : 'sys-error'}`}>
          <Icon name={ok ? 'check' : 'alert'} size={12} /> {ok ? t('admin.lg.ok') : t('admin.lg.fail')}
        </span>}
      </div>
      {res ? (
        <dl className="sys-meta">
          <div><dt>{t('admin.lg.count')}</dt><dd><strong>{res.count}</strong></dd></div>
          <div><dt>{t('admin.lg.responseMs')}</dt><dd>{res.ms}ms</dd></div>
          <div><dt>{t('admin.lg.source')}</dt><dd>{t(SOURCE_KEY[res.source] || 'admin.lg.srcMock')}</dd></div>
          {!ok && <div><dt>{t('admin.lg.reason')}</dt><dd className="lg-reason">{t(`admin.lg.reason.${res.error || 'error'}`)}</dd></div>}
        </dl>
      ) : (
        <p className="lg-hint">{t('admin.lg.notTested')}</p>
      )}
    </div>
  )
}

// normalize 검증 블록.
function NormalizeBlock({ t, titleKey, fields, chk }) {
  return (
    <div className={`lg-norm ${chk?.ok ? 'ok' : chk ? 'warn' : ''}`}>
      <div className="lg-norm-head">
        <span className="lg-norm-title">{t(titleKey)}</span>
        {chk && <span className={`sys-badge ${chk.ok ? 'sys-ok' : 'sys-error'}`}>
          <Icon name={chk.ok ? 'check' : 'alert'} size={12} /> {chk.ok ? t('admin.lg.normOk') : t('admin.lg.normMissing', { n: chk.missing.length })}
        </span>}
      </div>
      <div className="lg-fields">
        {fields.map(f => {
          const present = !chk || !chk.missing.includes(f)
          const val = chk?.sample ? chk.sample[f] : undefined
          return (
            <div key={f} className={`lg-field ${present ? 'has' : 'miss'}`}>
              <code className="lg-field-key">{f}</code>
              <span className="lg-field-val">{val === undefined || val === null ? (present ? '—' : '✕') : String(val)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AdminLeagueApi() {
  const { t } = useLang()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [simulate, setSimulate] = useState(false)
  const [test, setTest] = useState(null)

  async function refresh() {
    const s = await getLeagueStatus()
    setStatus(s); setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  async function onTest() {
    setTesting(true)
    const res = await testLeagueApi({ simulateFail: simulate })
    setTest(res)
    setTesting(false)
    refresh()
  }
  async function onReset() {
    resetLeagueOps()
    setTest(null)
    refresh()
  }

  if (loading) return <div className="adm-page"><SkeletonList count={4} lines={1} /></div>

  const modeKey = { edge: 'admin.lg.modeEdge', api: 'admin.lg.modeApi', mock: 'admin.lg.modeMock' }[status.mode] || 'admin.lg.modeMock'

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-head-row">
        <div>
          <h1 className="adm-h1">{t('admin.lg.title')}</h1>
          <p className="adm-sub">{t('admin.lg.sub')}</p>
        </div>
        <div className="lg-head-actions">
          <label className="lg-sim">
            <input type="checkbox" checked={simulate} onChange={e => setSimulate(e.target.checked)} />
            <span>{t('admin.lg.simulate')}</span>
          </label>
          <button className="adm-btn-primary" onClick={onTest} disabled={testing}>
            <Icon name="refresh" size={14} /> {testing ? t('admin.lg.testing') : t('admin.lg.testBtn')}
          </button>
        </div>
      </header>

      {/* 연속 실패 임계 알림 배너 */}
      {status.alerting && (
        <div className="ns-banner" role="alert">
          <Icon name="alert" size={18} />
          <span>{t('admin.lg.alertBanner', { n: status.consecutiveFailures })}</span>
          <button className="adm-btn-sm lg-reset" onClick={onReset}>{t('admin.lg.reset')}</button>
        </div>
      )}

      {/* Provider 상태 */}
      <section className="lg-status-card">
        <h2 className="adm-h2 lg-section-title">{t('admin.lg.providerTitle')}</h2>
        <dl className="lg-status-grid">
          <div><dt>{t('admin.lg.provider')}</dt><dd><span className="lg-mode-badge">{status.mode.toUpperCase()}</span></dd></div>
          <div><dt>{t('admin.lg.mode')}</dt><dd>{t(modeKey)}</dd></div>
          <div><dt>{t('admin.lg.baseUrl')}</dt><dd className="lg-url">
            {status.mode === 'api' ? (status.baseUrl || t('admin.lg.notSet'))
              : status.mode === 'edge' ? t('admin.lg.serverSecret')
                : t('admin.lg.na')}
          </dd></div>
          <div><dt>{t('admin.lg.lastSuccess')}</dt><dd>{fmt(status.lastSuccessAt)}</dd></div>
          <div><dt>{t('admin.lg.lastFailure')}</dt><dd>{fmt(status.lastFailureAt)}{status.consecutiveFailures > 0 && <span className="sys-fcount"> ×{status.consecutiveFailures}</span>}</dd></div>
          <div><dt>{t('admin.lg.lastData')}</dt><dd>
            {status.lastSource
              ? <span className={`lg-src-badge lg-src-${status.lastSource === 'cache' ? 'cache' : status.lastSource === 'mock' ? 'mock' : 'api'}`}>{t(SOURCE_KEY[status.lastSource] || 'admin.lg.srcMock')}</span>
              : '—'}
          </dd></div>
        </dl>

        {/* 캐시 상태 */}
        <div className="lg-cache">
          <span className="lg-cache-label">{t('admin.lg.cache')}</span>
          {status.cache.length === 0 ? (
            <span className="lg-cache-empty">{t('admin.lg.cacheEmpty')}</span>
          ) : (
            <ul className="lg-cache-list">
              {status.cache.map(c => (
                <li key={c.key} className={c.fresh ? 'fresh' : 'stale'}>
                  <code>{c.key}</code>
                  <span>{c.ageSec}s · {c.fresh ? t('admin.lg.cacheFresh') : t('admin.lg.cacheStale')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* fallback 순서 안내 */}
        <div className="lg-fallback">
          <span className="lg-fallback-label">{t('admin.lg.fallbackTitle')}</span>
          <div className="lg-fallback-flow">
            <span className={status.lastSource === 'edge' || status.lastSource === 'api' ? 'on' : ''}>{t('admin.lg.srcApi')}</span>
            <Icon name="external" size={12} />
            <span className={status.lastSource === 'cache' ? 'on' : ''}>{t('admin.lg.srcCache')}</span>
            <Icon name="external" size={12} />
            <span className={status.lastSource === 'mock' ? 'on' : ''}>{t('admin.lg.srcMock')}</span>
          </div>
          <p className="lg-fallback-note">{t('admin.lg.fallbackNote')}</p>
        </div>
      </section>

      {/* 연결 테스트 결과 */}
      <section className="lg-tests">
        <h2 className="adm-h2 lg-section-title">
          {t('admin.lg.testTitle')}
          {test && <span className="lg-test-at"> · {fmt(test.at)}</span>}
        </h2>
        <div className="sys-grid">
          <TestCard t={t} labelKey="admin.lg.standings" icon="trophy" res={test?.standings} />
          <TestCard t={t} labelKey="admin.lg.schedule" icon="calendar" res={test?.schedule} />
          <TestCard t={t} labelKey="admin.lg.results" icon="chart" res={test?.results} />
        </div>
      </section>

      {/* normalize 검증 */}
      <section className="lg-normalize">
        <h2 className="adm-h2 lg-section-title">{t('admin.lg.normTitle')}</h2>
        <p className="adm-sub lg-norm-sub">{t('admin.lg.normSub')}</p>
        <div className="lg-norm-grid">
          <NormalizeBlock t={t} titleKey="admin.lg.normStanding" fields={STANDING_FIELDS} chk={test?.normalize?.standing} />
          <NormalizeBlock t={t} titleKey="admin.lg.normMatch" fields={MATCH_FIELDS} chk={test?.normalize?.match} />
        </div>
      </section>

      <p className="lg-foot-note">{t('admin.lg.footNote', { n: FAILURE_THRESHOLD })}</p>
    </div>
  )
}
