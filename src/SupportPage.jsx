import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from './contexts/LanguageContext.jsx'
import { useToast } from './contexts/ToastContext.jsx'
import { createInquiry } from './lib/supportRepo.js'
import { INQUIRY_CATEGORIES, SUBJECT_MAX, CONTENT_MAX, validateInquiry, inquiryErrorKey, categoryKey } from './lib/supportPolicy.js'
import './SupportPage.css'

// 고객 문의 작성 — 독립 페이지(/support). 로그인 사용자 전용.
export default function SupportPage() {
  const { t } = useLang()
  const navigate = useNavigate()
  const toast = useToast()
  const [category, setCategory] = useState('service')
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function onSubmit(e) {
    e.preventDefault()
    if (busy) return                                   // double submit 잠금
    setErr(null)
    const vKey = validateInquiry({ category, subject, content })
    if (vKey) { setErr(t(vKey)); return }
    setBusy(true)
    const r = await createInquiry({ category, subject, content })
    if (!r.ok) { setBusy(false); setErr(t(inquiryErrorKey(r.code))); return }
    toast.info(t('support.submitted'))
    navigate('/support/my', { replace: true })         // 내 문의 내역으로
  }

  return (
    <div className="sp-root">
      <div className="sp-container">
        <header className="sp-head">
          <button type="button" className="sp-back" onClick={() => navigate(-1)}>{t('common.back')}</button>
          <h1 className="sp-title">{t('support.title')}</h1>
          <p className="sp-sub">{t('support.intro')}</p>
        </header>

        <form className="sp-form" onSubmit={onSubmit}>
          <div className="sp-field">
            <label htmlFor="sp-cat">{t('support.category')}</label>
            <select id="sp-cat" value={category} onChange={e => setCategory(e.target.value)}>
              {INQUIRY_CATEGORIES.map(c => <option key={c} value={c}>{t(categoryKey(c))}</option>)}
            </select>
          </div>
          <div className="sp-field">
            <label htmlFor="sp-subj">{t('support.subject')}</label>
            <input id="sp-subj" type="text" value={subject} maxLength={SUBJECT_MAX}
              placeholder={t('support.subjectPh')} onChange={e => { setSubject(e.target.value); setErr(null) }} />
          </div>
          <div className="sp-field">
            <label htmlFor="sp-content">{t('support.content')}</label>
            <textarea id="sp-content" rows={8} value={content} maxLength={CONTENT_MAX}
              placeholder={t('support.contentPh')} onChange={e => { setContent(e.target.value); setErr(null) }} />
            <span className="sp-count">{content.length} / {CONTENT_MAX}</span>
          </div>

          {err && <p className="sp-err" role="alert">{err}</p>}

          <button type="submit" className="sp-submit" disabled={busy}>
            {busy ? t('common.processing') : t('support.submit')}
          </button>
          <button type="button" className="sp-link" onClick={() => navigate('/support/my')}>{t('support.myList')}</button>
        </form>
      </div>
    </div>
  )
}
