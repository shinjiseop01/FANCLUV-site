import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext.jsx'
import { logout, getCurrentUser, getRole } from '../lib/auth.js'
import { visibleMenu } from './adminData.js'
import './admin.css'

// Inline icons per menu key.
const ICONS = {
  dashboard: <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />,
  members: <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M16 4.1a3.5 3.5 0 0 1 0 6.8" />,
  opinions: <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />,
  surveys: <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  news: <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9h4M18 14h-8M15 18h-5M10 6h8v4h-8V6z" />,
  reports: <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />,
  settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />,
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const { lang, setLang, t } = useLang()
  const user = getCurrentUser()
  const role = getRole()
  const menu = visibleMenu(role)

  return (
    <div className="ch-root admin-shell">
      {/* ── Sidebar ── */}
      <aside className="adm-sidebar">
        <div className="adm-brand" onClick={() => navigate('/admin')}>
          FANCLUV <span>Admin</span>
        </div>
        <nav className="adm-nav" aria-label="Admin menu">
          {menu.map(item => (
            <NavLink
              key={item.key}
              to={item.path}
              end={item.key === 'dashboard'}
              className={({ isActive }) => `adm-nav-item${isActive ? ' on' : ''}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[item.key]}</svg>
              <span>{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="adm-sidebar-foot">
          <span className="adm-role-badge">{t('admin.roleAdmin')}</span>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="adm-main">
        <header className="adm-topbar">
          <span className="adm-topbar-title">{t('admin.console')}</span>
          <div className="adm-topbar-actions">
            <div className="ch-lang" role="group" aria-label="언어 선택">
              <button className={lang === 'ko' ? 'on' : ''} onClick={() => setLang('ko')}>한국어</button>
              <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
            </div>
            <span className="adm-user">{user?.nickname}</span>
            <button className="ch-logout" onClick={() => { logout(); navigate('/') }}>{t('common.logout')}</button>
          </div>
        </header>
        <main className="adm-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
