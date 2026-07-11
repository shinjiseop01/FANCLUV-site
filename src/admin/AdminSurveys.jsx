import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../contexts/LanguageContext.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Pagination from '../components/Pagination.jsx'
import { usePagination } from '../lib/usePagination.js'
import Icon from '../components/Icon.jsx'
import { adminListSurveys, setSurveyStatus, deleteSurvey } from '../lib/surveysRepo.js'

const STATUS_META = {
  draft:     { key: 'admin.sv.stDraft',     cls: 'hidden' },
  published: { key: 'admin.sv.stPublished', cls: 'active' },
  closed:    { key: 'admin.sv.stClosed',    cls: 'muted' },
}

export default function AdminSurveys() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [surveys, setSurveys] = useState([])
  const { paged, page, total, setPage } = usePagination(surveys, 20)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')

  const load = () => {
    setLoading(true)
    adminListSurveys().then(list => { setSurveys(list); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  async function changeStatus(id, status) {
    setBusy(id)
    const res = await setSurveyStatus(id, status)
    if (res.ok) setSurveys(list => list.map(s => (s.id === id ? { ...s, status } : s)))
    setBusy('')
  }
  async function remove(id) {
    if (!window.confirm(t('admin.sv.confirmDelete'))) return
    setBusy(id)
    const res = await deleteSurvey(id)
    if (res.ok) setSurveys(list => list.filter(s => s.id !== id))
    setBusy('')
  }

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-head-row">
        <div>
          <h1 className="adm-h1">{t('admin.menu.surveys')}</h1>
          <p className="adm-sub">{t('admin.sv.sub', { n: surveys.length })}</p>
        </div>
        <div className="adm-head-actions">
          <button className="adm-btn-primary" onClick={() => navigate('/admin/surveys/new')}>
            <Icon name="plus" size={16} /> {t('admin.sv.create')}
          </button>
        </div>
      </header>

      {loading ? (
        <div className="adm-loading">{t('common.loading')}</div>
      ) : surveys.length === 0 ? (
        <EmptyState iconName="survey" title={t('empty.surveysTitle')} message={t('empty.surveysMsg')} />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('admin.sv.colTitle')}</th>
                <th>{t('admin.sv.colQuestions')}</th>
                <th>{t('admin.sv.colResponses')}</th>
                <th>{t('admin.sv.colEnd')}</th>
                <th>{t('admin.sv.colStatus')}</th>
                <th className="adm-col-actions">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(s => {
                const sm = STATUS_META[s.status] || STATUS_META.draft
                return (
                  <tr key={s.id}>
                    <td className="adm-cell-strong">
                      {s.title || t('admin.sv.untitled')}
                      {!s.isPublic && <span className="adm-badge muted adm-sv-private">{t('admin.sv.private')}</span>}
                    </td>
                    <td>{s.questionCount}</td>
                    <td>{s.responses.toLocaleString()}</td>
                    <td className="adm-cell-muted">{s.endDate || '-'}</td>
                    <td><span className={`adm-badge ${sm.cls}`}>{t(sm.key)}</span></td>
                    <td className="adm-col-actions">
                      <div className="adm-actions">
                        <button className="adm-btn-sm" onClick={() => navigate(`/admin/surveys/${s.id}/edit`)}>{t('admin.edit')}</button>
                        <button className="adm-btn-sm" onClick={() => navigate(`/admin/surveys/${s.id}/results`)}>{t('admin.sv.results')}</button>
                        {s.status === 'draft' && (
                          <button className="adm-btn-sm accent" disabled={busy === s.id} onClick={() => changeStatus(s.id, 'published')}>{t('admin.sv.publish')}</button>
                        )}
                        {s.status === 'published' && (
                          <button className="adm-btn-sm" disabled={busy === s.id} onClick={() => changeStatus(s.id, 'closed')}>{t('admin.sv.closeBtn')}</button>
                        )}
                        {s.status === 'closed' && (
                          <button className="adm-btn-sm" disabled={busy === s.id} onClick={() => changeStatus(s.id, 'published')}>{t('admin.sv.reopen')}</button>
                        )}
                        <button className="adm-btn-sm danger" disabled={busy === s.id} onClick={() => remove(s.id)}>{t('admin.delete')}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination page={page} total={total} onChange={setPage} />
        </div>
      )}
    </div>
  )
}
