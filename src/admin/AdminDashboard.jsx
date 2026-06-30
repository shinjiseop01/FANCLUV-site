import { useNavigate } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext.jsx'
import { getCurrentUser } from '../lib/auth.js'
import { getDashboardStats } from './adminData.js'

const STAT_CARDS = [
  { key: 'members',        labelKey: 'admin.dash.members',        icon: '👥', accent: false },
  { key: 'opinions',       labelKey: 'admin.dash.opinions',       icon: '💬', accent: false },
  { key: 'activeSurveys',  labelKey: 'admin.dash.activeSurveys',  icon: '📊', accent: false },
  { key: 'opinionsToday',  labelKey: 'admin.dash.opinionsToday',  icon: '✍️', accent: false },
  { key: 'newMembersToday', labelKey: 'admin.dash.newMembersToday', icon: '🌱', accent: false },
  { key: 'pendingReports', labelKey: 'admin.dash.pendingReports',  icon: '🚩', accent: true },
]

export default function AdminDashboard() {
  const { t } = useLang()
  const navigate = useNavigate()
  const stats = getDashboardStats()
  const admin = getCurrentUser()

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <h1 className="adm-h1">{t('admin.console')}</h1>
        <p className="adm-sub">{t('admin.dash.welcome', { name: admin?.nickname || 'Admin' })}</p>
      </header>

      <div className="adm-stat-grid">
        {STAT_CARDS.map(c => (
          <div key={c.key} className={`adm-stat${c.accent ? ' accent' : ''}`}>
            <span className="adm-stat-icon" aria-hidden="true">{c.icon}</span>
            <span className="adm-stat-value">{Number(stats[c.key]).toLocaleString()}</span>
            <span className="adm-stat-label">{t(c.labelKey)}</span>
          </div>
        ))}
      </div>

      <div className="adm-quick">
        <h2 className="adm-h2">{t('admin.dash.quick')}</h2>
        <div className="adm-quick-grid">
          <button className="adm-quick-btn" onClick={() => navigate('/admin/members')}>👥 {t('admin.menu.members')}</button>
          <button className="adm-quick-btn" onClick={() => navigate('/admin/opinions')}>💬 {t('admin.menu.opinions')}</button>
          <button className="adm-quick-btn" onClick={() => navigate('/admin/surveys')}>📊 {t('admin.menu.surveys')}</button>
          <button className="adm-quick-btn" onClick={() => navigate('/admin/reports')}>🚩 {t('admin.menu.reports')}</button>
        </div>
      </div>
    </div>
  )
}
