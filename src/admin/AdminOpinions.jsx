import { useState } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { getTeam } from '../teams.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { MOCK_OPINIONS } from './adminData.js'

export default function AdminOpinions() {
  const { t } = useLang()
  const { toast } = useToast()
  const [opinions, setOpinions] = useState(MOCK_OPINIONS)

  function toggleHide(id) {
    setOpinions(list => list.map(o =>
      o.id === id ? { ...o, status: o.status === 'visible' ? 'hidden' : 'visible' } : o,
    ))
    const o = opinions.find(x => x.id === id)
    toast(o?.status === 'visible' ? t('admin.op.hidden') : t('admin.op.shown'))
  }

  function remove(id) {
    setOpinions(list => list.filter(o => o.id !== id))
    toast(t('admin.op.deleted'))
  }

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <h1 className="adm-h1">{t('admin.menu.opinions')}</h1>
        <p className="adm-sub">{t('admin.op.sub', { n: opinions.length })}</p>
      </header>

      {opinions.length === 0 ? (
        <EmptyState icon="💬" title={t('empty.opinionsTitle')} message={t('empty.opinionsMsg')} />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('admin.op.colAuthor')}</th>
                <th>{t('admin.op.colTeam')}</th>
                <th>{t('admin.op.colDate')}</th>
                <th>{t('admin.op.colContent')}</th>
                <th>{t('admin.op.colLikes')}</th>
                <th>{t('admin.op.colComments')}</th>
                <th className="adm-col-actions">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {opinions.map(o => {
                const team = getTeam(o.team)
                return (
                  <tr key={o.id} className={o.status === 'hidden' ? 'is-hidden' : ''}>
                    <td className="adm-cell-strong">{o.author}</td>
                    <td className="adm-cell-muted">{team ? team.name : '-'}</td>
                    <td className="adm-cell-muted">{o.date}</td>
                    <td className="adm-cell-content">
                      {o.content}
                      {o.status === 'hidden' && <span className="adm-badge hidden">{t('admin.op.hiddenTag')}</span>}
                    </td>
                    <td>{o.likes.toLocaleString()}</td>
                    <td>{o.comments}</td>
                    <td className="adm-col-actions">
                      <button className="adm-btn-sm" onClick={() => toggleHide(o.id)}>
                        {o.status === 'visible' ? t('admin.hide') : t('admin.show')}
                      </button>
                      <button className="adm-btn-sm danger" onClick={() => remove(o.id)}>{t('admin.delete')}</button>
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
