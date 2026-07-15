// FANCLUV — Fan Pulse(팬 여론 흐름) 페이지.
//
// 팬이 진행중/종료 Pulse 를 보고, 본인인증 시 1인1표 투표한다. 투표는 서버 성공 후에만
// 결과를 반영한다(낙관적 업데이트 금지). 결과는 막대그래프/퍼센트/연령·성별/시간별.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang } from './contexts/LanguageContext.jsx'
import { useToast } from './contexts/ToastContext.jsx'
import { useEscapeKey } from './lib/useEscapeKey.js'
import { getCurrentUser, isIdentityVerified } from './lib/auth.js'
import Icon from './components/Icon.jsx'
import EmptyState from './components/EmptyState.jsx'
import { SkeletonList } from './components/Skeleton.jsx'
import { listPulses, getPulse, getStats, getMyVote, vote } from './lib/pulse/pulseRepo.js'
import { PULSE_STATUS_META } from './lib/pulse/pulseStatus.js'
import './FanPulsePage.css'

const REFRESH_MS = 10000 // 실시간 결과 갱신 주기

function remaining(endsAt, t) {
  if (!endsAt) return null
  const ms = new Date(endsAt).getTime() - Date.now()
  if (ms <= 0) return t('pulse.ended')
  const h = Math.floor(ms / 3600000), d = Math.floor(h / 24)
  if (d > 0) return t('pulse.dleft', { n: d })
  if (h > 0) return t('pulse.hleft', { n: h })
  return t('pulse.mleft', { n: Math.max(1, Math.floor(ms / 60000)) })
}

function StatusBadge({ status, t }) {
  const m = PULSE_STATUS_META[status] || PULSE_STATUS_META.active
  return <span className={`pl-badge pl-badge-${m.tone}`}>{t(m.labelKey)}</span>
}

// 결과 막대그래프
function Results({ stats, myOption, t }) {
  if (!stats) return null
  const max = Math.max(1, ...(stats.by_option || []).map(o => o.votes || 0))
  return (
    <div className="pl-results" aria-label={t('pulse.results')}>
      {(stats.by_option || []).map(o => (
        <div key={o.id} className={`pl-bar-row${o.id === myOption ? ' is-mine' : ''}`}>
          <div className="pl-bar-head">
            <span className="pl-bar-label">{o.label}{o.id === myOption && <Icon name="check" size={13} className="pl-mine-ico" />}</span>
            <span className="pl-bar-pct">{o.ratio}% <span className="pl-bar-n">({o.votes})</span></span>
          </div>
          <div className="pl-bar-track" role="progressbar" aria-valuenow={o.ratio} aria-valuemin={0} aria-valuemax={100} aria-label={o.label}>
            <div className="pl-bar-fill" style={{ width: `${max ? (o.votes / max) * 100 : 0}%` }} />
          </div>
        </div>
      ))}
      <div className="pl-results-total">{t('pulse.totalVotes', { n: stats.total })}</div>
      {/* 연령/성별 분포 */}
      {(Object.keys(stats.by_age || {}).length > 0 || Object.keys(stats.by_gender || {}).length > 0) && (
        <div className="pl-demo">
          {Object.keys(stats.by_age || {}).length > 0 && (
            <div className="pl-demo-block"><span className="pl-demo-title">{t('pulse.byAge')}</span>
              {Object.entries(stats.by_age).map(([k, v]) => <span key={k} className="pl-demo-chip">{k === 'na' ? t('pulse.na') : k} {v}</span>)}
            </div>
          )}
          {Object.keys(stats.by_gender || {}).length > 0 && (
            <div className="pl-demo-block"><span className="pl-demo-title">{t('pulse.byGender')}</span>
              {Object.entries(stats.by_gender).map(([k, v]) => <span key={k} className="pl-demo-chip">{t(`pulse.g.${k}`) === `pulse.g.${k}` ? k : t(`pulse.g.${k}`)} {v}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function FanPulsePage() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const { t } = useLang()
  const toast = useToast()
  const me = getCurrentUser()
  const verified = isIdentityVerified(me)

  const [tab, setTab] = useState('active')       // active | closed
  const [q, setQ] = useState('')
  const [list, setList] = useState(null)          // null=loading
  const [error, setError] = useState(false)
  const [sel, setSel] = useState(null)            // 선택된 topic (detail)
  const [stats, setStats] = useState(null)
  const [myVote, setMyVote] = useState({ voted: false, optionId: null })
  const [confirm, setConfirm] = useState(null)    // 확인 모달: {optionId,label}
  const [voting, setVoting] = useState(false)
  const pollRef = useRef(null)

  const loadList = useCallback(async () => {
    setError(false); setList(null)
    try { setList(await listPulses({ teamId, status: tab })) }
    catch { setError(true); setList([]) }
  }, [teamId, tab])
  useEffect(() => { loadList() }, [loadList])

  // 상세 진입: topic + stats + 내 투표 로드 + (active 면) 실시간 폴링.
  const openDetail = useCallback(async (topicId) => {
    setConfirm(null)
    const [topic, s, mv] = await Promise.all([getPulse(topicId), getStats(topicId), getMyVote(topicId)])
    setSel(topic); setStats(s?.ok === false ? null : s); setMyVote(mv)
  }, [])

  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (sel && sel.status === 'active') {
      pollRef.current = setInterval(async () => {
        const s = await getStats(sel.id)
        if (s?.ok !== false) setStats(s)
      }, REFRESH_MS)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [sel])

  function closeDetail() { setSel(null); setStats(null); setConfirm(null) }
  useEscapeKey(() => (confirm ? setConfirm(null) : closeDetail()), !!sel)

  async function doVote() {
    if (!confirm || voting) return
    setVoting(true)
    const res = await vote(sel.id, confirm.optionId)
    setVoting(false); setConfirm(null)
    if (res.ok) {
      toast.success(t('pulse.voteOk'))
      // 서버 성공 후에만 반영(낙관적 업데이트 금지) — 최신 결과 재조회.
      const [s, mv] = await Promise.all([getStats(sel.id), getMyVote(sel.id)])
      setStats(s?.ok === false ? null : s); setMyVote(mv)
    } else if (res.code === 'already_voted') {
      toast.info(t('pulse.err.already_voted'))
      const [s, mv] = await Promise.all([getStats(sel.id), getMyVote(sel.id)])
      setStats(s?.ok === false ? null : s); setMyVote(mv)
    } else if (res.code === 'not_verified') {
      toast.error(t('pulse.err.not_verified'))
    } else {
      const key = `pulse.err.${res.code}`
      toast.error(t(key) === key ? t('pulse.err.generic') : t(key))
    }
  }

  const filtered = useMemo(() => {
    const items = list || []
    const needle = q.trim().toLowerCase()
    return needle ? items.filter(p => (p.question || '').toLowerCase().includes(needle)) : items
  }, [list, q])

  const showResults = sel && (sel.status === 'closed' || myVote.voted)
  const canVote = sel && sel.status === 'active' && !myVote.voted

  return (
    <div className="pl-root">
      <header className="pl-head">
        <button className="pl-back" onClick={() => navigate(`/club/${teamId}`)} aria-label={t('common.back')}><Icon name="chevronLeft" size={18} /></button>
        <h1 className="pl-title">{t('pulse.title')}</h1>
      </header>

      {!sel && (
        <>
          <div className="pl-tabs" role="tablist" aria-label={t('pulse.title')}>
            {['active', 'closed'].map(s => (
              <button key={s} role="tab" aria-selected={tab === s} className={`pl-tab${tab === s ? ' on' : ''}`}
                onClick={() => setTab(s)}>{t(s === 'active' ? 'pulse.tabActive' : 'pulse.tabClosed')}</button>
            ))}
          </div>
          <input className="pl-search" type="search" value={q} onChange={e => setQ(e.target.value)}
            placeholder={t('pulse.searchPh')} aria-label={t('pulse.searchPh')} />

          {list === null ? (
            <SkeletonList count={4} lines={2} />
          ) : error ? (
            <div className="pl-error" role="alert">
              <Icon name="warningTriangle" size={18} /> {t('pulse.loadError')}
              <button className="pl-retry" onClick={loadList}>{t('common.retry') === 'common.retry' ? t('pulse.retry') : t('common.retry')}</button>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState iconName="vote" title={t('pulse.emptyTitle')} message={t('pulse.emptyMsg')} />
          ) : (
            <ul className="pl-list">
              {filtered.map(p => (
                <li key={p.id}>
                  <button className="pl-card" onClick={() => openDetail(p.id)}>
                    <div className="pl-card-top"><StatusBadge status={p.status} t={t} />
                      {p.ends_at && p.status === 'active' && <span className="pl-remain">{remaining(p.ends_at, t)}</span>}
                    </div>
                    <h3 className="pl-card-q">{p.question}</h3>
                    <div className="pl-card-meta">
                      <span>{t('pulse.options', { n: (p.options || []).length })}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* 상세 + 투표/결과 */}
      {sel && (
        <div className="pl-detail">
          <button className="pl-back-inline" onClick={closeDetail}><Icon name="chevronLeft" size={16} /> {t('pulse.backList')}</button>
          <div className="pl-detail-head">
            <StatusBadge status={sel.status} t={t} />
            {sel.ends_at && <span className="pl-remain">{remaining(sel.ends_at, t)}</span>}
          </div>
          <h2 className="pl-detail-q">{sel.question}</h2>
          <div className="pl-detail-meta">
            <span>{t('pulse.participants', { n: stats?.total ?? 0 })}</span>
          </div>

          {!verified && sel.status === 'active' && !myVote.voted && (
            <div className="pl-notice" role="note"><Icon name="userCheck" size={15} /> {t('pulse.verifyNotice')}</div>
          )}

          {canVote && verified ? (
            <div className="pl-options" role="group" aria-label={t('pulse.chooseOption')}>
              {(sel.options || []).map(o => (
                <button key={o.id} className="pl-option" onClick={() => setConfirm({ optionId: o.id, label: o.label })}>
                  <span>{o.label}</span><Icon name="chevronRight" size={16} />
                </button>
              ))}
            </div>
          ) : showResults ? (
            <Results stats={stats} myOption={myVote.optionId} t={t} />
          ) : (
            <div className="pl-notice" role="note">{t('pulse.closedNoVote')}</div>
          )}

          {myVote.voted && sel.status === 'active' && <p className="pl-voted-note">{t('pulse.alreadyVotedNote')}</p>}
        </div>
      )}

      {/* 확인 모달 */}
      {confirm && (
        <div className="pl-modal-overlay" onClick={() => setConfirm(null)}>
          <div className="pl-modal" role="dialog" aria-modal="true" aria-label={t('pulse.confirmTitle')} onClick={e => e.stopPropagation()}>
            <h3>{t('pulse.confirmTitle')}</h3>
            <p>{t('pulse.confirmBody', { option: confirm.label })}</p>
            <p className="pl-modal-warn">{t('pulse.confirmWarn')}</p>
            <div className="pl-modal-actions">
              <button className="pl-btn-primary" disabled={voting} onClick={doVote}>{voting ? t('pulse.voting') : t('pulse.confirmVote')}</button>
              <button className="pl-btn-ghost" disabled={voting} onClick={() => setConfirm(null)}>{t('common.cancel') === 'common.cancel' ? t('pulse.cancel') : t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
