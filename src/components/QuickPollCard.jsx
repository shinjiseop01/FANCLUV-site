// FANCLUV — Quick Poll 임베드 카드(홈/뉴스/의견/경기 등 콘텐츠 안에 삽입).
//
// context 로 active Poll 을 조회해 있을 때만 렌더(없으면 null). 로그인 사용자가 1인1표 투표하고,
// 서버 성공 후에만 결과를 표시한다(낙관적 업데이트 금지). 결과는 막대그래프/퍼센트.
import { useState, useEffect, useCallback } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { getCurrentUser } from '../lib/auth.js'
import { getForContext, getResults, vote } from '../lib/quickpoll/quickPollRepo.js'
import { remainingLabel, voteErrorKey } from '../lib/quickpoll/quickPollStatus.js'
import Icon from './Icon.jsx'
import './QuickPollCard.css'

export default function QuickPollCard({ contextType, contextId = null, teamId = null }) {
  const { t } = useLang()
  const toast = useToast()
  const me = getCurrentUser()
  const [state, setState] = useState('loading') // loading | none | ready | error
  const [poll, setPoll] = useState(null)
  const [results, setResults] = useState(null)
  const [confirm, setConfirm] = useState(null)   // {optionId,label}
  const [voting, setVoting] = useState(false)

  const load = useCallback(async () => {
    setState('loading')
    try {
      const p = await getForContext(contextType, contextId, teamId)
      if (!p) { setState('none'); return }
      setPoll(p)
      const r = await getResults(p.id)
      setResults(r?.ok === false ? null : r)
      setState('ready')
    } catch { setState('error') }
  }, [contextType, contextId, teamId])
  useEffect(() => { load() }, [load])

  async function doVote() {
    if (!confirm || voting) return
    setVoting(true)
    const res = await vote(poll.id, confirm.optionId)
    setVoting(false); setConfirm(null)
    if (res.ok) {
      toast.success(t('qp.voteOk'))
      const r = await getResults(poll.id)   // 서버 성공 후에만 결과 반영
      setResults(r?.ok === false ? null : r)
    } else if (res.code === 'already_voted') {
      toast.info(t('qp.err.already_voted'))
      const r = await getResults(poll.id); setResults(r?.ok === false ? null : r)
    } else {
      toast.error(t(voteErrorKey(res.code)))
    }
  }

  if (state === 'loading') return <div className="qp-card qp-skeleton" aria-busy="true"><div className="qp-sk-line" /><div className="qp-sk-line qp-sk-short" /></div>
  if (state === 'none') return null
  if (state === 'error') return (
    <div className="qp-card qp-card-error" role="alert"><Icon name="warningTriangle" size={16} /> {t('qp.loadError')}
      <button className="qp-retry" onClick={load}>{t('qp.retry')}</button></div>
  )

  const showResults = results?.show_results
  const canVote = poll.status === 'active' && !results?.has_voted && me
  const total = results?.total ?? 0

  return (
    <section className="qp-card" aria-label={t('qp.title')}>
      <div className="qp-card-head">
        <span className="qp-tag"><Icon name="vote" size={13} /> {t('qp.title')}</span>
        {poll.ends_at && poll.status === 'active' && <span className="qp-remain">{remainingLabel(poll.ends_at, t)}</span>}
        {poll.status === 'closed' && <span className="qp-remain">{t('qp.st.closed')}</span>}
      </div>
      <h3 className="qp-question">{poll.question}</h3>

      {canVote ? (
        <fieldset className="qp-options">
          <legend className="qp-sr">{poll.question}</legend>
          {(poll.options || []).map(o => (
            <button key={o.id} type="button" className="qp-option" onClick={() => setConfirm({ optionId: o.id, label: o.label })}>
              <span className="qp-radio" aria-hidden="true" /><span>{o.label}</span>
            </button>
          ))}
        </fieldset>
      ) : !me ? (
        <div className="qp-notice"><Icon name="userCheck" size={14} /> {t('qp.err.login')}</div>
      ) : showResults ? (
        <div className="qp-results" aria-live="polite">
          {(results.by_option || []).map(o => (
            <div key={o.id} className={`qp-bar-row${o.id === results.my_option ? ' is-mine' : ''}`}>
              <div className="qp-bar-head">
                <span>{o.label}{o.id === results.my_option && <Icon name="check" size={12} className="qp-mine" />}</span>
                <span className="qp-pct"><span className="qp-sr">{o.label} </span>{o.ratio}% <span className="qp-n">({o.votes})</span></span>
              </div>
              <div className="qp-bar-track" role="progressbar" aria-valuenow={o.ratio} aria-valuemin={0} aria-valuemax={100} aria-label={`${o.label} ${o.ratio}%`}>
                <div className="qp-bar-fill" style={{ width: `${o.ratio}%` }} />
              </div>
            </div>
          ))}
          <div className="qp-total">{t('qp.totalVotes', { n: total })}</div>
        </div>
      ) : (
        <div className="qp-notice">{poll.status === 'closed' ? t('qp.closedNote') : t('qp.resultAfterVote')}</div>
      )}

      {results?.has_voted && poll.status === 'active' && <p className="qp-voted">{t('qp.alreadyVotedNote')}</p>}

      {confirm && (
        <div className="qp-modal-overlay" onClick={() => setConfirm(null)}>
          <div className="qp-modal" role="dialog" aria-modal="true" aria-label={t('qp.confirmTitle')} onClick={e => e.stopPropagation()}>
            <h4>{t('qp.confirmTitle')}</h4>
            <p>{t('qp.confirmBody', { option: confirm.label })}</p>
            <p className="qp-warn">{t('qp.confirmWarn')}</p>
            <div className="qp-modal-actions">
              <button className="qp-btn-primary" disabled={voting} onClick={doVote}>{voting ? t('qp.voting') : t('qp.confirmVote')}</button>
              <button className="qp-btn-ghost" disabled={voting} onClick={() => setConfirm(null)}>{t('qp.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
