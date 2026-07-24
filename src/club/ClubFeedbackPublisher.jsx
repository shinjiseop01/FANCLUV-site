import { useState, useEffect, useCallback } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import Icon from '../components/Icon.jsx'
import { listOwnActions, publishAction, unpublishAction } from '../lib/feedback/clubFeedbackRepo.js'

// 구단(Club) 계정이 완료(done)한 조치를 팬에게 「구단 피드백」으로 공개/취소하는 패널.
// 내부 필드(메모/비용/담당)는 다루지 않고, 공개 제목/설명만 입력한다. 서버 RPC 가 tenant·완료상태를 강제.
export default function ClubFeedbackPublisher() {
  const { t } = useLang()
  const toast = useToast()
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState({}) // { [id]: { title, summary } }
  const [busy, setBusy] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    listOwnActions(50).then(list => {
      const done = (list || []).filter(a => a.status === 'done')
      setActions(done)
      setDrafts(Object.fromEntries(done.map(a => [a.id, { title: a.public_title || '', summary: a.public_summary || '' }])))
      setLoading(false)
    })
  }, [])
  useEffect(() => load(), [load])

  const setDraft = (id, k, v) => setDrafts(d => ({ ...d, [id]: { ...d[id], [k]: v } }))

  async function onPublish(a) {
    const dr = drafts[a.id] || {}
    if (!dr.title?.trim() || !dr.summary?.trim()) { toast?.error?.(t('feedback.needFields')); return }
    setBusy(a.id)
    const res = await publishAction(a.id, { title: dr.title.trim(), summary: dr.summary.trim(), category: a.category })
    setBusy(null)
    if (res.ok) { toast?.success?.(t('feedback.publishOk')); load() }
    else toast?.error?.(t('feedback.publishFail'))
  }
  async function onUnpublish(a) {
    setBusy(a.id)
    const res = await unpublishAction(a.id)
    setBusy(null)
    if (res.ok) { toast?.success?.(t('feedback.unpublishOk')); load() }
    else toast?.error?.(t('feedback.publishFail'))
  }

  return (
    <section className="exec-panel cfp">
      <h2 className="exec-panel-title"><Icon name="check" size={16} className="fc-inline-ico" /> {t('feedback.publishPanelTitle')}</h2>
      <p className="cfp-sub">{t('feedback.publishPanelSub')}</p>
      {loading ? (
        <p className="cfp-empty">…</p>
      ) : actions.length === 0 ? (
        <p className="cfp-empty">{t('feedback.noCompleted')}</p>
      ) : (
        <ul className="cfp-list">
          {actions.map(a => {
            const dr = drafts[a.id] || { title: '', summary: '' }
            return (
              <li key={a.id} className="cfp-item">
                <div className="cfp-item-head">
                  <span className="cfp-action-title">{a.title}</span>
                  <span className={`cfp-badge ${a.is_published ? 'on' : ''}`}>
                    {a.is_published ? t('feedback.published') : t('feedback.private')}
                  </span>
                </div>
                <label className="cfp-field">
                  <span>{t('feedback.publicTitleLabel')}</span>
                  <input className="cfp-input" type="text" value={dr.title}
                    placeholder={t('feedback.publicTitlePh')} maxLength={80}
                    onChange={e => setDraft(a.id, 'title', e.target.value)} />
                </label>
                <label className="cfp-field">
                  <span>{t('feedback.publicSummaryLabel')}</span>
                  <textarea className="cfp-input cfp-textarea" value={dr.summary} rows={3}
                    placeholder={t('feedback.publicSummaryPh')} maxLength={600}
                    onChange={e => setDraft(a.id, 'summary', e.target.value)} />
                </label>
                <div className="cfp-actions">
                  <button className="cfp-btn cfp-btn-primary" disabled={busy === a.id} onClick={() => onPublish(a)}>
                    {t('feedback.publishBtn')}
                  </button>
                  {a.is_published && (
                    <button className="cfp-btn cfp-btn-ghost" disabled={busy === a.id} onClick={() => onUnpublish(a)}>
                      {t('feedback.unpublishBtn')}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
