// FANCLUV — 뉴스 카드 내부에 펼쳐지는 "AI 뉴스 요약" 카드.
// 페이지 이동/모달 없이 카드 아래에서 확장된다. open 될 때만 요약을 1회 조회(캐시).
import { useState, useEffect } from 'react'
import { useLang } from '../../contexts/LanguageContext.jsx'
import Icon from '../Icon.jsx'
import { getNewsSummary, sendNewsSummaryFeedback } from '../../lib/news/newsSummaryRepo.js'

export default function NewsSummaryCard({ item, teamId, open, onClose }) {
  const { t } = useLang()
  const [status, setStatus] = useState('idle') // idle | loading | ready
  const [data, setData] = useState(null)
  const [feedback, setFeedback] = useState(null) // 'up' | 'down'

  useEffect(() => {
    if (!open || status !== 'idle') return
    let active = true
    setStatus('loading')
    getNewsSummary(teamId, item)
      .then(res => { if (active) { setData(res); setStatus('ready') } })
      .catch(() => { if (active) setStatus('ready') })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function vote(kind) {
    if (feedback) return
    setFeedback(kind)
    if (data?.cacheKey) sendNewsSummaryFeedback(data.cacheKey, kind === 'up')
  }

  return (
    <div className="tn-ai-card" role="region" aria-label={t('news.aiSummary')}>
      <button className="tn-ai-close" onClick={onClose} aria-label={t('common.close')}>
        <Icon name="close" size={16} />
      </button>
      <div className="tn-ai-head"><Icon name="sparkle" size={16} className="tn-ai-spark" /> {t('news.aiSummary')}</div>

      {status !== 'ready' ? (
        <div className="tn-ai-loading" role="status">
          <span className="tn-ai-spinner" aria-hidden="true" />
          <span>{t('news.aiAnalyzing')}</span>
          <div className="tn-ai-skel"><span /><span /><span /></div>
        </div>
      ) : (
        <>
          {data?.oneLiner && <p className="tn-ai-oneliner">{data.oneLiner}</p>}
          <ul className="tn-ai-bullets">
            {(data?.bullets || []).map((b, i) => <li key={i}>{b}</li>)}
          </ul>
          {data?.fanPoint && (
            <p className="tn-ai-fanpoint"><strong>{t('news.aiFanPoint')}</strong> {data.fanPoint}</p>
          )}
          <div className="tn-ai-divider" />
          <p className="tn-ai-note">{t('news.aiNote')}</p>
          <div className="tn-ai-feedback">
            {feedback ? (
              <span className="tn-ai-thanks">{t('news.aiThanks')}</span>
            ) : (
              <>
                <button className="tn-ai-fb" onClick={() => vote('up')}><Icon name="thumbsUp" size={15} /> {t('news.aiHelpful')}</button>
                <button className="tn-ai-fb" onClick={() => vote('down')}><Icon name="thumbsDown" size={15} /> {t('news.aiUnhelpful')}</button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
