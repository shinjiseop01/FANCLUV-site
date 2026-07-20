// FANCLUV — 알림센터 (/club/:teamId/notifications).
// 필터(전체/안읽음/댓글/공감/설문/뉴스/공지) · 읽음/전체읽음 · 삭제/전체삭제 · 페이지네이션 · Realtime.
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLang, NAV_KEYS } from './contexts/LanguageContext.jsx'
import { useToast } from './contexts/ToastContext.jsx'
import NotificationBell from './components/NotificationBell.jsx'
import EmptyState from './components/EmptyState.jsx'
import Pagination from './components/Pagination.jsx'
import Button from './components/Button.jsx'
import Icon from './components/Icon.jsx'
import { usePagination } from './lib/usePagination.js'
import { relativeTime } from './lib/relativeTime.js'
import { logout, getCurrentUser } from './lib/auth.js'
import { getTeam, teamName, TeamEmblem, menuPath } from './teams.jsx'
import {
  listNotifications, markRead, markAllRead, deleteNotification, deleteAll, subscribeNotifications,
} from './lib/notificationsRepo.js'
import './ClubHomePage.css'
import './NotificationCenterPage.css'

const MENU = ['홈', '설문', '팬 의견', '팀 뉴스', '경기센터', 'AI 인사이트', '팬 랭킹', '내 활동']
const FILTERS = ['all', 'unread', 'comment', 'like', 'survey', 'news', 'notice']
const TYPE_ICON = { comment: 'comment', like: 'heart', survey: 'survey', news: 'news', notice: 'megaphone' }
const PER = 10

export default function NotificationCenterPage() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const team = getTeam(teamId)
  const { lang, t } = useLang()
  const toast = useToast()
  const NICKNAME = getCurrentUser()?.nickname || '팬'

  const [all, setAll] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const load = useCallback(async () => {
    const list = await listNotifications({ limit: 200 })
    setAll(list)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  // Realtime: 새 알림/읽음/삭제 시 자동 갱신.
  useEffect(() => subscribeNotifications(() => load()), [load])

  const visible = all.filter(n =>
    filter === 'all' ? true
      : filter === 'unread' ? !n.isRead
      : n.type === filter)
  const { paged, page, total, setPage } = usePagination(visible, PER, [filter, all.length])
  const unread = all.filter(n => !n.isRead).length

  async function onItemClick(n) {
    if (!n.isRead) {
      await markRead(n.id)
      setAll(prev => prev.map(x => (x.id === n.id ? { ...x, isRead: true } : x)))
    }
    if (n.url) navigate(n.url)
  }
  async function onDelete(e, id) {
    e.stopPropagation()
    await deleteNotification(id)
    setAll(prev => prev.filter(x => x.id !== id))
  }
  async function onMarkAll() {
    await markAllRead()
    setAll(prev => prev.map(x => ({ ...x, isRead: true })))
    toast.success(t('noti.allReadDone'))
  }
  async function onDeleteAll() {
    if (!window.confirm(t('noti.confirmDeleteAll'))) return
    await deleteAll()
    setAll([])
    toast.success(t('noti.deleteAllDone'))
  }

  if (!team) {
    return (
      <div className="ch-fallback">
        <p>{t('common.notFoundTeam')}</p>
        <button onClick={() => navigate('/team-select')}>{t('common.reselectTeam')}</button>
      </div>
    )
  }

  const themeStyle = { '--team': team.color, '--team-deep': team.colorDeep }
  const hoursSince = iso => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3600000))
  const filterLabel = f => t(`noti.filter.${f}`)

  return (
    <div className="ch-root" style={themeStyle}>
      <header className="ch-header">
        <div className="ch-topbar">
          <div className="ch-logo" role="button" tabIndex={0} onClick={() => navigate(`/club/${teamId}`)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/club/${teamId}`) } }}>FANCLUV</div>
          <div className="ch-club">
            <TeamEmblem color={team.color} size={30} className="ch-club-emblem" />
            <span className="ch-club-name">{teamName(team, lang)}</span>
          </div>
          <div className="ch-actions">
            <span className="ch-user">{NICKNAME}{t('common.honorific')}</span>
            <NotificationBell />
            <button className="ch-logout" onClick={() => { logout(); navigate('/', { replace: true }) }}>{t('common.logout')}</button>
          </div>
        </div>
        <nav className="ch-nav" aria-label="메인 메뉴">
          {MENU.map(item => (
            <a key={item} href="#" className="ch-nav-item"
              onClick={e => { e.preventDefault(); navigate(menuPath(item, team.id)) }}>{t(NAV_KEYS[item])}</a>
          ))}
        </nav>
      </header>

      <main className="ntf-main">
        <header className="ntf-head">
          <h1 className="ntf-title">{t('common.notifications')}</h1>
          <div className="ntf-actions">
            <Button variant="outline" size="sm" leftIcon="check" disabled={unread === 0} onClick={onMarkAll}>{t('noti.markAll')}</Button>
            <Button variant="ghost" size="sm" leftIcon="trash" disabled={all.length === 0} onClick={onDeleteAll}>{t('noti.deleteAll')}</Button>
          </div>
        </header>

        <div className="ntf-filters" role="group" aria-label={t('common.notifications')}>
          {FILTERS.map(f => (
            <button key={f} className={`ntf-filter${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
              {filterLabel(f)}{f === 'unread' && unread > 0 ? ` (${unread})` : ''}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="ntf-loading">{t('common.loading')}</div>
        ) : visible.length === 0 ? (
          <EmptyState iconName="bell" title={t('noti.emptyTitle')} message={t('noti.emptyMsg')} />
        ) : (
          <>
            <ul className="ntf-list">
              {paged.map(n => (
                <li key={n.id}>
                  <div className={`ntf-item${n.isRead ? '' : ' unread'}`} role="button" tabIndex={0}
                    onClick={() => onItemClick(n)}
                    onKeyDown={e => { if (e.key === 'Enter') onItemClick(n) }}>
                    <span className="ntf-item-ico" aria-hidden="true"><Icon name={TYPE_ICON[n.type] || 'bell'} size={18} /></span>
                    <span className="ntf-item-body">
                      <span className="ntf-item-title">
                        {!n.isRead && <span className="ntf-dot" aria-hidden="true" />}
                        {n.isImportant && <span className="ntf-important">{t('notice.important')}</span>}
                        {n.title}
                      </span>
                      {n.body && <span className="ntf-item-text">{n.body}</span>}
                      <span className="ntf-item-time">{relativeTime(hoursSince(n.createdAt), lang)}</span>
                    </span>
                    <button type="button" className="ntf-del" aria-label={t('common.delete')} onClick={e => onDelete(e, n.id)}>
                      <Icon name="close" size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={page} total={total} onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
          </>
        )}
      </main>
    </div>
  )
}
