import { useState } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { REPORT_REASONS } from '../lib/reportsRepo.js'

// 신고 모달 — 사유 선택 + '기타' 선택 시 직접 입력.
// onSubmit(reason, detail) 은 상위에서 reportsRepo.submitReport 로 위임한다.
export default function ReportModal({ open, onClose, onSubmit, submitting = false }) {
  const { t } = useLang()
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')

  if (!open) return null

  const canSubmit = !!reason && (reason !== 'other' || detail.trim().length > 0)

  function handleSubmit() {
    if (!canSubmit || submitting) return
    onSubmit(reason, detail.trim())
  }

  return (
    <div
      className="rpt-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('report.title')}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="rpt-modal">
        <h2 className="rpt-title">{t('report.title')}</h2>
        <p className="rpt-desc">{t('report.desc')}</p>

        <div className="rpt-reasons" role="radiogroup" aria-label={t('report.reasonLabel')}>
          {REPORT_REASONS.map(code => (
            <label key={code} className={`rpt-reason${reason === code ? ' on' : ''}`}>
              <input
                type="radio"
                name="report-reason"
                value={code}
                checked={reason === code}
                onChange={() => setReason(code)}
              />
              <span>{t(`report.reason.${code}`)}</span>
            </label>
          ))}
        </div>

        {reason === 'other' && (
          <textarea
            className="rpt-detail"
            rows={3}
            placeholder={t('report.detailPh')}
            value={detail}
            onChange={e => setDetail(e.target.value)}
            maxLength={300}
            autoFocus
          />
        )}

        <div className="rpt-actions">
          <button type="button" className="rpt-cancel" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </button>
          <button type="button" className="rpt-submit" onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {t('report.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
