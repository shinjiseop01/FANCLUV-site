import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLang } from './contexts/LanguageContext.jsx'
import { listMyInquiries, getMyInquiry } from './lib/supportRepo.js'
import { categoryKey, statusKey, statusBadgeClass } from './lib/supportPolicy.js'
import './SupportPage.css'

function fmt(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

// 내 문의 내역(목록) + 상세. /support/my, /support/my/:id
export default function MySupportPage() {
  const { t } = useLang()
  const navigate = useNavigate()
  const { id } = useParams()
  const [rows, setRows] = useState(null)
  const [detail, setDetail] = useState(undefined)   // undefined=loading, null=not found

  useEffect(() => {
    let active = true
    if (id) { setDetail(undefined); getMyInquiry(id).then(d => { if (active) setDetail(d) }) }
    else { listMyInquiries().then(l => { if (active) setRows(l) }) }
    return () => { active = false }
  }, [id])

  // ── 상세 ──
  if (id) {
    if (detail === undefined) return <div className="sp-root"><div className="sp-container"><p className="sp-muted">…</p></div></div>
    if (detail === null) {
      return (
        <div className="sp-root"><div className="sp-container">
          <header className="sp-head"><button className="sp-back" onClick={() => navigate('/support/my')}>{t('support.backList')}</button>
            <h1 className="sp-title">{t('support.notFoundTitle')}</h1><p className="sp-sub">{t('support.notFoundMsg')}</p></header>
        </div></div>
      )
    }
    return (
      <div className="sp-root"><div className="sp-container">
        <header className="sp-head">
          <button className="sp-back" onClick={() => navigate('/support/my')}>{t('support.backList')}</button>
          <div className="sp-detail-top">
            <span className="sp-cat-chip">{t(categoryKey(detail.category))}</span>
            <span className={`sp-badge ${statusBadgeClass(detail.status)}`}>{t(statusKey(detail.status))}</span>
          </div>
          <h1 className="sp-title">{detail.subject}</h1>
          <p className="sp-sub">{fmt(detail.createdAt)}</p>
        </header>

        <section className="sp-block">
          <h2 className="sp-block-title">{t('support.contentLabel')}</h2>
          <p className="sp-text">{detail.content}</p>
        </section>

        <section className="sp-block sp-reply">
          <h2 className="sp-block-title">{t('support.replyLabel')}</h2>
          {detail.adminReply
            ? <><p className="sp-text">{detail.adminReply}</p><p className="sp-muted">{fmt(detail.repliedAt)}</p></>
            : <p className="sp-muted">{t('support.noReplyYet')}</p>}
        </section>
      </div></div>
    )
  }

  // ── 목록 ──
  return (
    <div className="sp-root"><div className="sp-container">
      <header className="sp-head">
        <button className="sp-back" onClick={() => navigate(-1)}>{t('common.back')}</button>
        <h1 className="sp-title">{t('support.myTitle')}</h1>
        <button className="sp-link" onClick={() => navigate('/support')}>{t('support.newInquiry')}</button>
      </header>
      {rows === null ? <p className="sp-muted">…</p>
        : rows.length === 0 ? <p className="sp-empty">{t('support.myEmpty')}</p>
          : (
            <ul className="sp-list">
              {rows.map(q => (
                <li key={q.id} className="sp-item" role="button" tabIndex={0}
                  onClick={() => navigate(`/support/my/${q.id}`)}
                  onKeyDown={e => { if (e.key === 'Enter') navigate(`/support/my/${q.id}`) }}>
                  <div className="sp-item-top">
                    <span className="sp-cat-chip">{t(categoryKey(q.category))}</span>
                    <span className={`sp-badge ${statusBadgeClass(q.status)}`}>{t(statusKey(q.status))}</span>
                  </div>
                  <div className="sp-item-subj">{q.subject}</div>
                  <div className="sp-muted">{fmt(q.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
    </div></div>
  )
}
