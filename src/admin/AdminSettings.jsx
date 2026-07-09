import { useNavigate } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext.jsx'
import { useTheme } from '../contexts/ThemeContext.jsx'
import { getCurrentUser, getRole, logout } from '../lib/auth.js'

// MVP settings — 표시(언어/테마) + 계정 정보 + 예정 역할 로드맵.
const FUTURE_ROLES = [
  { key: 'superadmin', labelKey: 'admin.set.roleSuper' },
  { key: 'staff', labelKey: 'admin.set.roleStaff' },
  { key: 'club_admin', labelKey: 'admin.set.roleClub' },
]
const THEME_OPTS = [['light', 'set.themeLight'], ['dark', 'set.themeDark'], ['system', 'set.themeSystem']]

export default function AdminSettings() {
  const { lang, setLang, t } = useLang()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const user = getCurrentUser()
  const role = getRole()

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <h1 className="adm-h1">{t('admin.menu.settings')}</h1>
        <p className="adm-sub">{t('admin.set.sub')}</p>
      </header>

      {/* 표시 설정 — 팬 설정과 동일하게 전역 theme/language state 를 사용(즉시 반영·유지) */}
      <section className="adm-card">
        <h2 className="adm-h2">{t('admin.set.display')}</h2>

        <div className="adm-setting-row">
          <span className="adm-setting-label">{t('set.language')}</span>
          <div className="adm-filters" role="group" aria-label={t('set.language')}>
            <button className={`adm-filter${lang === 'ko' ? ' on' : ''}`} onClick={() => setLang('ko')}>{t('set.langKo')}</button>
            <button className={`adm-filter${lang === 'en' ? ' on' : ''}`} onClick={() => setLang('en')}>{t('set.langEn')}</button>
          </div>
        </div>

        <div className="adm-setting-row">
          <span className="adm-setting-label">{t('set.theme')}</span>
          <div className="adm-filters" role="group" aria-label={t('set.theme')}>
            {THEME_OPTS.map(([key, label]) => (
              <button key={key} className={`adm-filter${theme === key ? ' on' : ''}`}
                aria-pressed={theme === key} onClick={() => setTheme(key)}>{t(label)}</button>
            ))}
          </div>
        </div>
        <p className="adm-card-note">{t('set.themeHint')}</p>
      </section>

      <section className="adm-card">
        <h2 className="adm-h2">{t('admin.set.account')}</h2>
        <dl className="adm-deflist">
          <div><dt>{t('admin.set.name')}</dt><dd>{user?.nickname}</dd></div>
          <div><dt>{t('admin.set.email')}</dt><dd>{user?.email}</dd></div>
          <div><dt>{t('admin.set.role')}</dt><dd><span className="adm-badge active">{role}</span></dd></div>
        </dl>
        <button className="adm-btn-ghost danger adm-logout-btn" onClick={() => { logout(); navigate('/') }}>
          {t('common.logout')}
        </button>
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
