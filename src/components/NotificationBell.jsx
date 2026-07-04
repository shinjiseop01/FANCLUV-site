import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext.jsx'
import { relativeTime } from '../lib/relativeTime.js'
import Icon from './Icon.jsx'
import { listNotifications, unreadCount, markRead, markAllRead } from '../lib/notificationsRepo.js'

// Header notification bell. Loads notifications from notificationsRepo
// (Supabase when configured, otherwise mock). Shows an unread badge, a list,
// per-item read-on-click, and a "mark all read" action.
export default function NotificationBell() {
  const { lang, t } = useLang()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [notice, setNotice] = useState(null) // 공지 알림 클릭 시 표시할 모달 내용
  const ref = useRef(null)

  async function refresh() {
    const [list, count] = await Promise.all([listNotifications(), unreadCount()])
    setItems(list)
    setUnread(count)
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    if (!open) return
    refresh()
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  async function onItemClick(n) {
    if (!n.isRead) {
      await markRead(n.id)
      setItems(prev => prev.map(x => (x.id === n.id ? { ...x, isRead: true } : x)))
      setUnread(c => Math.max(0, c - 1))
    }
    // 관리자 공지는 이동할 상세 페이지가 없어 모달로 본문을 표시, 그 외는 관련 페이지로 이동
    if (n.type === 'notice') {
      setOpen(false)
      setNotice(n)
    } else if (n.url) {
      setOpen(false)
      navigate(n.url)
    }
  }

  async function onMarkAll() {
    await markAllRead()
    setItems(prev => prev.map(x => ({ ...x, isRead: true })))
    setUnread(0)
  }

  const hoursSince = iso => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000))

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
        {unread > 0 && <span className="fc-bell-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="fc-bell-menu" role="menu">
          <div className="fc-bell-head">
            <span>{t('common.notifications')}</span>
            {unread > 0 && (
              <button type="button" className="fc-bell-allread" onClick={onMarkAll}>{t('common.markAllRead')}</button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="fc-bell-empty">
              <span aria-hidden="true"><Icon name="bell" size={26} strokeWidth={1.5} /></span>
              <p>{t('common.noNotifications')}</p>
            </div>
          ) : (
            <ul className="fc-bell-list">
              {items.map(n => (
                <li key={n.id}>
                  <button type="button" className={`fc-bell-item${n.isRead ? '' : ' unread'}`} onClick={() => onItemClick(n)}>
                    {!n.isRead && <span className="fc-bell-dot" aria-hidden="true" />}
                    <span className="fc-bell-item-body">
                      <span className="fc-bell-item-title">{n.title}</span>
                      {n.body && <span className="fc-bell-item-text">{n.body}</span>}
                      <span className="fc-bell-item-time">{relativeTime(hoursSince(n.createdAt), lang)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {notice && (
        <div
          className="ntc-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={notice.title}
          onMouseDown={e => { if (e.target === e.currentTarget) setNotice(null) }}
        >
          <div className="ntc-modal">
            <span className="ntc-tag">{t('notice.tag')}</span>
            <h2 className="ntc-title">{notice.title}</h2>
            <p className="ntc-body">{notice.body}</p>
            <span className="ntc-time">{relativeTime(hoursSince(notice.createdAt), lang)}</span>
            <button type="button" className="ntc-close" onClick={() => setNotice(null)}>{t('common.close')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
