import { useState, useEffect, useCallback } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { TEAMS, getTeam } from '../teams.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { SkeletonList } from '../components/Skeleton.jsx'
import Icon from '../components/Icon.jsx'
import { getActionEffects, TRACKER_PERIODS } from '../lib/admin/actionTracker.js'
import { ACTION_CATEGORIES, saveResultNote } from '../lib/admin/clubActionsRepo.js'

const RATING_CLS = { excellent: 'tr-r-excellent', effective: 'tr-r-effective', no_change: 'tr-r-nochange', monitor: 'tr-r-monitor' }

// 변화량 카드에 표시할 핵심 지표(요구사항 3/4)
const DELTA_METRICS = [
  { key: 'satisfaction', labelKey: 'admin.kpi.satisfaction' },
  { key: 'complaintIndex', labelKey: 'admin.kpi.complaint', invert: true },
  { key: 'engagement', labelKey: 'admin.kpi.engagement' },
]

export default function AdminActionTracker() {
  const { t } = useLang()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('3m')
  const [club, setClub] = useState('all')
  const [category, setCategory] = useState('all')
  const [memoDraft, setMemoDraft] = useState({})   // actionId -> text

  const load = useCallback(async () => {
    setLoading(true)
    const days = TRACKER_PERIODS.find(p => p.key === period)?.days
    const list = await getActionEffects({ clubId: club, category, periodDays: days })
    setRows(list)
    setMemoDraft(Object.fromEntries(list.map(r => [r.action.id, r.action.resultNote || ''])))
    setLoading(false)
  }, [period, club, category])
  useEffect(() => { load() }, [load])

  async function saveMemo(actionId) {
    await saveResultNote(actionId, memoDraft[actionId] || '')
    load()
  }

  const clubName = id => getTeam(id)?.name || id
  const deltaStr = (v, invert) => {
    if (v == null || v === 0) return { txt: '±0', cls: 'flat', arrow: '' }
    const good = invert ? v < 0 : v > 0
    return { txt: `${v > 0 ? '+' : ''}${v}`, cls: good ? 'up' : 'down', arrow: v > 0 ? '▲' : '▼' }
  }

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-head-row">
        <div>
          <h1 className="adm-h1">{t('admin.tracker.title')}</h1>
          <p className="adm-sub">{t('admin.tracker.sub')}</p>
        </div>
      </header>

      {/* 핵심 흐름 안내 (요구사항 14) */}
      <div className="tr-flow">
        {['flowOpinion', 'flowAi', 'flowAction', 'flowKpi', 'flowEffect'].map((k, i) => (
          <span key={k} className="tr-flow-step">
            {i > 0 && <span className="tr-flow-arrow" aria-hidden="true">→</span>}
            <span className="tr-flow-label">{t(`admin.tracker.${k}`)}</span>
          </span>
        ))}
      </div>

      {/* 필터 + 기간 비교 */}
      <div className="ca-filters">
        <select className="adm-input" value={club} onChange={e => setClub(e.target.value)} aria-label={t('admin.action.club')}>
          <option value="all">{t('admin.action.allClubs')}</option>
          {TEAMS.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
        </select>
        <select className="adm-input" value={category} onChange={e => setCategory(e.target.value)} aria-label={t('admin.action.category')}>
          <option value="all">{t('admin.action.allCat')}</option>
          {ACTION_CATEGORIES.map(c => <option key={c} value={c}>{t(`admin.action.cat.${c}`)}</option>)}
        </select>
        <div className="tr-period" role="tablist" aria-label={t('admin.tracker.period')}>
          {TRACKER_PERIODS.map(p => (
            <button key={p.key} role="tab" aria-selected={period === p.key}
              className={`tr-period-btn${period === p.key ? ' on' : ''}`} onClick={() => setPeriod(p.key)}>
              {t(p.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <SkeletonList count={3} lines={3} />
      ) : rows.length === 0 ? (
        <EmptyState iconName="chart" title={t('admin.tracker.emptyTitle')} message={t('admin.tracker.emptyMsg')} />
      ) : (
        <div className="tr-timeline">
          {rows.map(r => {
            const a = r.action
            return (
              <div key={a.id} className="tr-item">
                <div className="tr-dot" aria-hidden="true"><Icon name="check" size={12} /></div>
                <div className="tr-card">
                  <div className="tr-card-head">
                    <div>
                      <span className="tr-date">{a.actionDate || String(a.createdAt).slice(0, 10)}</span>
                      <span className="tr-club">{clubName(a.clubId)}</span>
                      <span className="tr-cat">{t(`admin.action.cat.${a.category}`)}</span>
                    </div>
                    <span className={`tr-rating ${RATING_CLS[r.rating]}`}>{t(`admin.tracker.rating.${r.rating}`)}</span>
                  </div>
                  <h3 className="tr-title">{a.title}</h3>
                  {a.description && <p className="tr-desc">{a.description}</p>}

                  {/* Before / After KPI 변화량 카드 (요구사항 3/4) */}
                  <div className="tr-deltas">
                    {DELTA_METRICS.map(m => {
                      const b = r.before?.[m.key], af = r.after?.[m.key]
                      const d = deltaStr(r.deltas[m.key], m.invert)
                      return (
                        <div key={m.key} className="tr-delta-card">
                          <div className="tr-delta-label">{t(m.labelKey)}</div>
                          <div className="tr-delta-flow">
                            <span className="tr-delta-b">{b ?? '—'}</span>
                            <span className="tr-delta-arrow" aria-hidden="true">→</span>
                            <span className="tr-delta-a">{af ?? '—'}</span>
                            <span className={`tr-delta-chg ${d.cls}`}>{d.arrow}{d.txt}</span>
                          </div>
                        </div>
                      )
                    })}
                    {/* Club Intelligence Score (요구사항 11) */}
                    <div className="tr-delta-card tr-score">
                      <div className="tr-delta-label">{t('admin.tracker.score')}</div>
                      <div className="tr-score-val">{r.intelligenceScore ?? '—'}<span> / 100</span></div>
                    </div>
                  </div>

                  {/* AI 효과 분석 (요구사항 5) */}
                  <div className="tr-ai">
                    <div className="tr-ai-head"><Icon name="sparkle" size={14} /> {t('admin.tracker.aiEffect')}</div>
                    {r.aiEffect.map((line, i) => <p key={i} className="tr-ai-line">{line}</p>)}
                    {r.usingCurrent && <p className="tr-ai-note">{t('admin.tracker.usingCurrent')}</p>}
                  </div>

                  {/* 영향 카테고리 (요구사항 6) */}
                  {r.impacted.length > 0 && (
                    <div className="tr-impact">
                      <span className="tr-impact-title">{t('admin.tracker.impacted')}:</span>
                      {r.impacted.map(c => {
                        const d = deltaStr(c.scoreDelta)
                        return <span key={c.key} className={`tr-impact-chip ${d.cls}`}>{c.name} {d.arrow}{Math.abs(c.scoreDelta)}</span>
                      })}
                    </div>
                  )}

                  {/* 관련 데이터 연결 (요구사항 7) */}
                  <div className="tr-links">
                    {r.related.aiInsight && <span className="ca-link-chip"><Icon name="sparkle" size={11} /> {t('admin.action.linkInsight')}</span>}
                    {r.related.week && <span className="ca-link-chip"><Icon name="chart" size={11} /> {t('admin.action.linkWeek')}: {r.related.week}</span>}
                    {r.related.report && <span className="ca-link-chip"><Icon name="news" size={11} /> {t('admin.action.linkReport')}</span>}
                    <span className="ca-link-chip"><Icon name="chart" size={11} /> {t('admin.tracker.kpiHistory')} {r.related.kpiHistory}</span>
                    <span className="ca-link-chip"><Icon name="comment" size={11} /> {t('admin.tracker.opinions')} {r.related.opinions}</span>
                    <span className="ca-link-chip"><Icon name="vote" size={11} /> {t('admin.tracker.surveys')} {r.related.surveys}</span>
                  </div>

                  {/* 운영자 메모 (요구사항 10) */}
                  <div className="tr-memo">
                    <label className="tr-memo-label">{t('admin.tracker.memo')}</label>
                    <div className="tr-memo-row">
                      <input value={memoDraft[a.id] ?? ''} onChange={e => setMemoDraft(m => ({ ...m, [a.id]: e.target.value }))}
                        placeholder={t('admin.tracker.memoPh')} />
                      <button className="adm-btn-sm" onClick={() => saveMemo(a.id)}>{t('admin.save')}</button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
