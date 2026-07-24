import { useState, useEffect, useCallback } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import Icon from '../components/Icon.jsx'
import { ACTION_CATEGORIES } from '../lib/admin/clubActionsRepo.js'
import { getLatestInsight } from '../lib/ai/analyzeFanInsights.js'
import { getClubId } from '../lib/auth.js'
import {
  listOwnActions, createAction, setActionStatus, deleteActionSelf,
  publishAction, unpublishAction,
} from '../lib/feedback/clubFeedbackRepo.js'

const EMPTY_FORM = { title: '', description: '', category: 'etc', actionDate: '', linkInsight: false }

// Club 계정이 자기 구단 개선 조치를 직접 생성/상태관리/완료/공개하는 패널(Feedback Loop ACT 단계).
// 모든 mutation 은 서버 gated RPC(club_create_action 등)로만 — tenant/상태/공개 invariant 는 서버가 강제.
export default function ClubFeedbackPublisher() {
  const { t } = useLang()
  const toast = useToast()
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState({})      // { [id]: { title, summary } } — 공개 입력
  const [busy, setBusy] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [insightId, setInsightId] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    listOwnActions(100).then(list => {
      const rows = list || []
      setActions(rows)
      setDrafts(Object.fromEntries(rows.map(a => [a.id, { title: a.public_title || '', summary: a.public_summary || '' }])))
      setLoading(false)
    })
  }, [])
  useEffect(() => load(), [load])
  // 자기 구단 최신 AI 인사이트 id(있으면 생성 시 연결 옵션 제공, §5/§13).
  useEffect(() => { getLatestInsight(getClubId()).then(ins => setInsightId(ins?.id || null)).catch(() => setInsightId(null)) }, [])

  const setDraft = (id, k, v) => setDrafts(d => ({ ...d, [id]: { ...d[id], [k]: v } }))
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function onCreate(e) {
    e.preventDefault()
    if (!form.title.trim()) { toast.error(t('feedback.needTitle')); return }
    setBusy('create')
    const res = await createAction({
      title: form.title, description: form.description, category: form.category,
      actionDate: form.actionDate || null, aiInsightId: form.linkInsight ? insightId : null,
    })
    setBusy(null)
    if (res.ok) { toast.success(t('feedback.actionCreated')); setForm(EMPTY_FORM); setCreating(false); load() }
    else toast.error(t('feedback.actionFail'))
  }
  async function onStatus(a, status) {
    setBusy(a.id)
    const res = await setActionStatus(a.id, status)
    setBusy(null)
    if (res.ok) { toast.success(t('feedback.statusChanged')); load() } else toast.error(t('feedback.actionFail'))
  }
  async function onDelete(a) {
    setBusy(a.id)
    const res = await deleteActionSelf(a.id)
    setBusy(null)
    if (res.ok) { toast.success(t('feedback.actionDeleted')); load() } else toast.error(t('feedback.actionFail'))
  }
  async function onPublish(a) {
    const dr = drafts[a.id] || {}
    if (!dr.title?.trim() || !dr.summary?.trim()) { toast.error(t('feedback.needFields')); return }
    setBusy(a.id)
    const res = await publishAction(a.id, { title: dr.title.trim(), summary: dr.summary.trim(), category: a.category })
    setBusy(null)
    if (res.ok) { toast.success(t('feedback.publishOk')); load() } else toast.error(t('feedback.publishFail'))
  }
  async function onUnpublish(a) {
    setBusy(a.id)
    const res = await unpublishAction(a.id)
    setBusy(null)
    if (res.ok) { toast.success(t('feedback.unpublishOk')); load() } else toast.error(t('feedback.publishFail'))
  }

  return (
    <section className="exec-panel cfp">
      <div className="cfp-head-row">
        <h2 className="exec-panel-title"><Icon name="check" size={16} className="fc-inline-ico" /> {t('feedback.actionsTitle')}</h2>
        {!creating && <button className="cfp-btn cfp-btn-primary cfp-add" onClick={() => setCreating(true)}>+ {t('feedback.newAction')}</button>}
      </div>
      <p className="cfp-sub">{t('feedback.actionsSub')}</p>

      {creating && (
        <form className="cfp-create" onSubmit={onCreate}>
          <label className="cfp-field"><span>{t('feedback.actionTitle')}</span>
            <input className="cfp-input" type="text" value={form.title} maxLength={200}
              placeholder={t('feedback.actionTitlePh')} onChange={e => setF('title', e.target.value)} /></label>
          <div className="cfp-field-row">
            <label className="cfp-field"><span>{t('admin.action.category')}</span>
              <select className="cfp-input" value={form.category} onChange={e => setF('category', e.target.value)}>
                {ACTION_CATEGORIES.map(c => <option key={c} value={c}>{t(`admin.action.cat.${c}`)}</option>)}
              </select></label>
            <label className="cfp-field"><span>{t('feedback.actionDate')}</span>
              <input className="cfp-input" type="date" value={form.actionDate} onChange={e => setF('actionDate', e.target.value)} /></label>
          </div>
          <label className="cfp-field"><span>{t('feedback.actionDesc')}</span>
            <textarea className="cfp-input cfp-textarea" rows={2} value={form.description} maxLength={2000}
              placeholder={t('feedback.actionDescPh')} onChange={e => setF('description', e.target.value)} /></label>
          {insightId && (
            <label className="cfp-check"><input type="checkbox" checked={form.linkInsight} onChange={e => setF('linkInsight', e.target.checked)} />
              <span>{t('feedback.linkInsight')}</span></label>
          )}
          <div className="cfp-actions">
            <button type="submit" className="cfp-btn cfp-btn-primary" disabled={busy === 'create'}>{t('feedback.createBtn')}</button>
            <button type="button" className="cfp-btn cfp-btn-ghost" onClick={() => { setCreating(false); setForm(EMPTY_FORM) }}>{t('common.cancel')}</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="cfp-empty">…</p>
      ) : actions.length === 0 && !creating ? (
        <div className="cfp-emptybox">
          <p className="cfp-empty-title">{t('feedback.actionsEmptyTitle')}</p>
          <p className="cfp-empty-msg">{t('feedback.actionsEmptyMsg')}</p>
        </div>
      ) : (
        <ul className="cfp-list">
          {actions.map(a => {
            const dr = drafts[a.id] || { title: '', summary: '' }
            return (
              <li key={a.id} className="cfp-item">
                <div className="cfp-item-head">
                  <span className="cfp-action-title">{a.title}</span>
                  <span className={`cfp-status st-${a.status}`}>{t(`admin.action.st.${a.status}`)}</span>
                </div>
                <div className="cfp-item-meta">
                  <span className="cfp-cat">{t(`admin.action.cat.${a.category}`)}</span>
                  {a.is_published && <span className="cfp-badge on">{t('feedback.published')}</span>}
                </div>

                {/* 상태 전이 버튼 */}
                <div className="cfp-actions">
                  {a.status === 'planned' && (
                    <>
                      <button className="cfp-btn cfp-btn-primary" disabled={busy === a.id} onClick={() => onStatus(a, 'in_progress')}>{t('feedback.startBtn')}</button>
                      <button className="cfp-btn cfp-btn-ghost" disabled={busy === a.id} onClick={() => onDelete(a)}>{t('feedback.deleteBtn')}</button>
                    </>
                  )}
                  {a.status === 'in_progress' && (
                    <button className="cfp-btn cfp-btn-primary" disabled={busy === a.id} onClick={() => onStatus(a, 'done')}>{t('feedback.completeBtn')}</button>
                  )}
                </div>

                {/* 완료(done) 조치: 팬 공개 폼 */}
                {a.status === 'done' && (
                  <div className="cfp-publish">
                    <label className="cfp-field"><span>{t('feedback.publicTitleLabel')}</span>
                      <input className="cfp-input" type="text" value={dr.title} maxLength={80}
                        placeholder={t('feedback.publicTitlePh')} onChange={e => setDraft(a.id, 'title', e.target.value)} /></label>
                    <label className="cfp-field"><span>{t('feedback.publicSummaryLabel')}</span>
                      <textarea className="cfp-input cfp-textarea" rows={2} value={dr.summary} maxLength={600}
                        placeholder={t('feedback.publicSummaryPh')} onChange={e => setDraft(a.id, 'summary', e.target.value)} /></label>
                    <div className="cfp-actions">
                      <button className="cfp-btn cfp-btn-primary" disabled={busy === a.id} onClick={() => onPublish(a)}>{t('feedback.publishBtn')}</button>
                      {a.is_published && <button className="cfp-btn cfp-btn-ghost" disabled={busy === a.id} onClick={() => onUnpublish(a)}>{t('feedback.unpublishBtn')}</button>}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
