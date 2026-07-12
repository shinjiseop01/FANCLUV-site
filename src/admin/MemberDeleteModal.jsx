import { useState, useRef, useEffect } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { useEscapeKey } from '../lib/useEscapeKey.js'
import { validateReason } from '../lib/admin/deletePolicy.js'

// 관리자 회원 삭제 확인 모달.
// - 대상 닉네임/역할 표시, 복구 불가 경고, Club/Admin 대상 추가 경고.
// - 삭제 사유 필수(3~500자) + 확인 문구 입력(일치해야 실행).
// - onConfirm(reason) 은 상위에서 서버 삭제(adminDeleteMember)로 위임한다.
export default function MemberDeleteModal({ open, member, onClose, onConfirm, submitting = false }) {
  const { t } = useLang()
  const [reason, setReason] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const reasonRef = useRef(null)

  useEscapeKey(() => { if (!submitting) onClose() }, open)
  useEffect(() => {
    if (open) { setReason(''); setConfirmText(''); setTimeout(() => reasonRef.current?.focus(), 30) }
  }, [open, member?.id])

  if (!open || !member) return null

  const confirmWord = t('admin.del.confirmWord')
  const reasonOk = validateReason(reason).ok
  const confirmOk = confirmText.trim() === confirmWord
  const canSubmit = reasonOk && confirmOk && !submitting
  const isPrivilegedTarget = ['admin', 'staff', 'club', 'club_admin'].includes(member.role)

  return (
    <div
      className="rpt-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mdel-title"
      aria-describedby="mdel-desc"
      onMouseDown={e => { if (e.target === e.currentTarget && !submitting) onClose() }}
    >
      <div className="rpt-modal mdel-modal">
        <h2 className="rpt-title" id="mdel-title">{t('admin.del.title')}</h2>
        <p className="rpt-desc" id="mdel-desc">
          {t('admin.del.desc', { nickname: member.nickname, role: t(`admin.del.role.${member.role}`) })}
        </p>

        <div className="mdel-warn" role="alert">
          <strong>{t('admin.del.irreversible')}</strong>
          {isPrivilegedTarget && <div className="mdel-warn-extra">{t('admin.del.privilegedWarn')}</div>}
        </div>

        <label className="mdel-field">
          <span>{t('admin.del.reasonLabel')}</span>
          <textarea
            ref={reasonRef}
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={t('admin.del.reasonPh')}
            maxLength={500}
            disabled={submitting}
          />
        </label>

        <label className="mdel-field">
          <span>{t('admin.del.confirmLabel', { word: confirmWord })}</span>
          <input
            type="text"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={confirmWord}
            disabled={submitting}
            autoComplete="off"
          />
        </label>

        <div className="rpt-actions">
          <button type="button" className="rpt-cancel" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </button>
          <button type="button" className="adm-btn-ghost danger mdel-confirm" onClick={() => canSubmit && onConfirm(reason.trim())} disabled={!canSubmit}>
            {submitting ? t('admin.del.processing') : t('admin.del.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
