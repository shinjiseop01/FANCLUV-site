import { useState, useMemo } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { getTeam } from '../teams.jsx'
import Avatar from '../components/Avatar.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { MOCK_MEMBERS } from './adminData.js'

const VFILTERS = ['all', 'unverified', 'email_verified', 'phone_verified']

// Verification badge: class + label key per status.
function vMeta(status) {
  if (status === 'phone_verified') return { cls: 'vphone', key: 'admin.mem.vPhone' }
  if (status === 'email_verified') return { cls: 'vemail', key: 'admin.mem.vEmail' }
  return { cls: 'vnone', key: 'admin.mem.vNone' }
}

export default function AdminMembers() {
  const { t } = useLang()
  const [members, setMembers] = useState(MOCK_MEMBERS)
  const [query, setQuery] = useState('')
  const [vfilter, setVfilter] = useState('all')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members.filter(m => {
      if (vfilter !== 'all' && (m.verificationStatus || 'unverified') !== vfilter) return false
      if (q && !(m.nickname.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))) return false
      return true
    })
  }, [members, query, vfilter])

  function toggleActive(id) {
    setMembers(list => list.map(m =>
      m.id === id ? { ...m, status: m.status === 'active' ? 'inactive' : 'active' } : m,
    ))
  }

  function remove(id) {
    setMembers(list => list.filter(m => m.id !== id))
  }

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <h1 className="adm-h1">{t('admin.menu.members')}</h1>
        <p className="adm-sub">{t('admin.mem.sub', { n: members.length })}</p>
      </header>

      <div className="adm-toolbar">
        <div className="adm-search">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/><path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          <input type="search" placeholder={t('admin.mem.searchPh')} value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="adm-filters" role="group" aria-label={t('admin.mem.colVerify')}>
          {VFILTERS.map(f => (
            <button key={f}
              className={`adm-filter${vfilter === f ? ' on' : ''}`}
              onClick={() => setVfilter(f)}>
              {t(`admin.mem.filter.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState iconName="search" title={t('empty.searchTitle')} message={t('empty.searchMsg')} />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('admin.mem.colProfile')}</th>
                <th>{t('admin.mem.colEmail')}</th>
                <th>{t('admin.mem.colJoined')}</th>
                <th>{t('admin.mem.colTeam')}</th>
                <th>{t('admin.mem.colVerify')}</th>
                <th>{t('admin.mem.colStatus')}</th>
                <th className="adm-col-actions">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(m => {
                const team = getTeam(m.team)
                const v = vMeta(m.verificationStatus)
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="adm-user-cell">
                        <Avatar name={m.nickname} size={32} />
                        <span className="adm-cell-strong">{m.nickname}</span>
                      </div>
                    </td>
                    <td className="adm-cell-muted">{m.email}</td>
                    <td className="adm-cell-muted">{m.joinedAt}</td>
                    <td>{team ? team.name : '-'}</td>
                    <td><span className={`adm-badge ${v.cls}`}>{t(v.key)}</span></td>
                    <td>
                      <span className={`adm-badge ${m.status}`}>
                        {m.status === 'active' ? t('admin.mem.active') : t('admin.mem.inactive')}
                      </span>
                    </td>
                    <td className="adm-col-actions">
                      <div className="adm-actions">
                        <button className="adm-btn-sm" onClick={() => toggleActive(m.id)}>
                          {m.status === 'active' ? t('admin.mem.deactivate') : t('admin.mem.activate')}
                        </button>
                        <button className="adm-btn-sm danger" onClick={() => remove(m.id)}>{t('admin.delete')}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
