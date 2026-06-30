import { useState } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { MOCK_REPORTS } from './adminData.js'

export default function AdminReports() {
  const { t } = useLang()
  const [reports, setReports] = useState(MOCK_REPORTS)

  function hide(id) {
    setReports(list => list.map(r => (r.id === id ? { ...r, status: 'resolved' } : r)))
  }

  function remove(id) {
    setReports(list => list.filter(r => r.id !== id))
  }

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <h1 className="adm-h1">{t('admin.menu.reports')}</h1>
        <p className="adm-sub">{t('admin.rp.sub', { n: reports.filter(r => r.status === 'pending').length })}</p>
      </header>

      {reports.length === 0 ? (
        <EmptyState icon="🚩" title={t('admin.rp.emptyTitle')} message={t('admin.rp.emptyMsg')} />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('admin.rp.colTarget')}</th>
                <th>{t('admin.rp.colReason')}</th>
                <th>{t('admin.rp.colReporter')}</th>
                <th>{t('admin.rp.colDate')}</th>
                <th>{t('admin.rp.colStatus')}</th>
                <th className="adm-col-actions">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id}>
                  <td className="adm-cell-content">
                    <span className="adm-badge type">{t(`admin.rp.type.${r.targetType}`)}</span>
                    {r.target}
                  </td>
                  <td><span className="adm-badge reason">{r.reason}</span></td>
                  <td className="adm-cell-muted">{r.reporter}</td>
                  <td className="adm-cell-muted">{r.date}</td>
                  <td>
                    <span className={`adm-badge ${r.status === 'pending' ? 'pending' : 'active'}`}>
                      {r.status === 'pending' ? t('admin.rp.pending') : t('admin.rp.resolved')}
                    </span>
                  </td>
                  <td className="adm-col-actions">
                    <button className="adm-btn-sm" disabled={r.status !== 'pending'} onClick={() => hide(r.id)}>{t('admin.rp.hidePost')}</button>
                    <button className="adm-btn-sm danger" onClick={() => remove(r.id)}>{t('admin.rp.deletePost')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
