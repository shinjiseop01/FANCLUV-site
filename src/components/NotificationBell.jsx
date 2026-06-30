import { useState, useRef, useEffect } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'

// Header notification bell. Notifications aren't wired up yet (MVP), so the
// dropdown just shows an empty state. Self-contained open/close + click-outside.
export default function NotificationBell() {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    <div className="fc-bell" ref={ref}>
      <button
        type="button"
        className="fc-bell-btn"
        aria-label={t('common.notifications')}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M13.7 21a2 2 0 0 1-3.4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="fc-bell-menu" role="menu">
          <div className="fc-bell-head">{t('common.notifications')}</div>
          <div className="fc-bell-empty">
            <span aria-hidden="true">🔔</span>
            <p>{t('common.noNotifications')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
