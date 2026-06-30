import { useLang } from '../contexts/LanguageContext.jsx'
import { getCurrentUser, getRole } from '../lib/auth.js'

// MVP settings — account info + a roadmap of upcoming admin roles.
// Future role management (Super Admin / staff / club admin) plugs in here.
const FUTURE_ROLES = [
  { key: 'superadmin', labelKey: 'admin.set.roleSuper' },
  { key: 'staff', labelKey: 'admin.set.roleStaff' },
  { key: 'club_admin', labelKey: 'admin.set.roleClub' },
]

export default function AdminSettings() {
  const { t } = useLang()
  const user = getCurrentUser()
  const role = getRole()

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <h1 className="adm-h1">{t('admin.menu.settings')}</h1>
        <p className="adm-sub">{t('admin.set.sub')}</p>
      </header>

      <section className="adm-card">
        <h2 className="adm-h2">{t('admin.set.account')}</h2>
        <dl className="adm-deflist">
          <div><dt>{t('admin.set.name')}</dt><dd>{user?.nickname}</dd></div>
          <div><dt>{t('admin.set.email')}</dt><dd>{user?.email}</dd></div>
          <div><dt>{t('admin.set.role')}</dt><dd><span className="adm-badge active">{role}</span></dd></div>
        </dl>
      </section>

      <section className="adm-card">
        <h2 className="adm-h2">{t('admin.set.rolesTitle')}</h2>
        <p className="adm-card-note">{t('admin.set.rolesNote')}</p>
        <ul className="adm-role-list">
          {FUTURE_ROLES.map(r => (
            <li key={r.key}>
              <span className="adm-cell-strong">{t(r.labelKey)}</span>
              <span className="adm-badge soon">{t('admin.set.soon')}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
