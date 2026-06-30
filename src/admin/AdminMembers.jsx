import { useState, useMemo } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { getTeam } from '../teams.jsx'
import Avatar from '../components/Avatar.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { MOCK_MEMBERS } from './adminData.js'

export default function AdminMembers() {
  const { t } = useLang()
  const { toast } = useToast()
  const [members, setMembers] = useState(MOCK_MEMBERS)
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter(m =>
      m.nickname.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    )
  }, [members, query])

  function toggleActive(id) {
    setMembers(list => list.map(m =>
      m.id === id ? { ...m, status: m.status === 'active' ? 'inactive' : 'active' } : m,
    ))
    const m = members.find(x => x.id === id)
    toast(m?.status === 'active' ? t('admin.mem.deactivated') : t('admin.mem.activated'))
  }

  function remove(id) {
    setMembers(list => list.filter(m => m.id !== id))
    toast(t('admin.mem.deleted'))
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
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="🔍" title={t('empty.searchTitle')} message={t('empty.searchMsg')} />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('admin.mem.colProfile')}</th>
                <th>{t('admin.mem.colEmail')}</th>
                <th>{t('admin.mem.colJoined')}</th>
                <th>{t('admin.mem.colTeam')}</th>
                <th>{t('admin.mem.colStatus')}</th>
                <th className="adm-col-actions">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(m => {
                const team = getTeam(m.team)
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
                    <td>
                      <span className={`adm-badge ${m.status}`}>
                        {m.status === 'active' ? t('admin.mem.active') : t('admin.mem.inactive')}
                      </span>
                    </td>
                    <td className="adm-col-actions">
                      <button className="adm-btn-sm" onClick={() => toggleActive(m.id)}>
                        {m.status === 'active' ? t('admin.mem.deactivate') : t('admin.mem.activate')}
                      </button>
                      <button className="adm-btn-sm danger" onClick={() => remove(m.id)}>{t('admin.delete')}</button>
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
