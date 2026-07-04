import { useState } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { getTeam } from '../teams.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { MOCK_OPINIONS, MOCK_COMMENTS } from './adminData.js'

export default function AdminOpinions() {
  const { t } = useLang()
  const [opinions, setOpinions] = useState(MOCK_OPINIONS)
  const [comments, setComments] = useState(MOCK_COMMENTS)
  const [selectedId, setSelectedId] = useState(null) // 댓글을 펼쳐 볼 게시글 id

  function toggleHide(id) {
    setOpinions(list => list.map(o =>
      o.id === id ? { ...o, status: o.status === 'visible' ? 'hidden' : 'visible' } : o,
    ))
  }

  function remove(id) {
    setOpinions(list => list.filter(o => o.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function selectComments(id) {
    setSelectedId(prev => (prev === id ? null : id))
  }

  function toggleHideComment(cid) {
    setComments(list => list.map(c =>
      c.id === cid ? { ...c, status: c.status === 'visible' ? 'hidden' : 'visible' } : c,
    ))
  }

  function removeComment(cid) {
    setComments(list => list.filter(c => c.id !== cid))
  }

  const selectedOpinion = opinions.find(o => o.id === selectedId) || null
  const selectedComments = comments.filter(c => c.opinionId === selectedId)

  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <h1 className="adm-h1">{t('admin.menu.opinions')}</h1>
        <p className="adm-sub">{t('admin.op.sub', { n: opinions.length })}</p>
      </header>

      {opinions.length === 0 ? (
        <EmptyState iconName="comment" title={t('empty.opinionsTitle')} message={t('empty.opinionsMsg')} />
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
                const isOpen = selectedId === o.id
                const count = comments.filter(c => c.opinionId === o.id).length
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
                    <td>
                      <button className={`adm-link-btn${isOpen ? ' on' : ''}`} onClick={() => selectComments(o.id)}>
                        {t('admin.op.viewComments', { n: count })}
                      </button>
                    </td>
                    <td className="adm-col-actions">
                      <div className="adm-actions">
                        <button className="adm-btn-sm" onClick={() => toggleHide(o.id)}>
                          {o.status === 'visible' ? t('admin.hide') : t('admin.show')}
                        </button>
                        <button className="adm-btn-sm danger" onClick={() => remove(o.id)}>{t('admin.delete')}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 선택한 게시글의 댓글 관리 ── */}
      {selectedOpinion && (
        <section className="adm-comments">
          <div className="adm-comments-head">
            <h2 className="adm-h2">{t('admin.cm.title', { author: selectedOpinion.author })}</h2>
            <button className="adm-btn-ghost" onClick={() => setSelectedId(null)}>{t('admin.cm.close')}</button>
          </div>

          {selectedComments.length === 0 ? (
            <EmptyState compact iconName="comment" title={t('admin.cm.emptyTitle')} message={t('admin.cm.emptyMsg')} />
          ) : (
            <ul className="adm-comment-list">
              {selectedComments.map(c => (
                <li key={c.id} className={`adm-comment${c.status === 'hidden' ? ' is-hidden' : ''}`}>
                  <div className="adm-comment-body">
                    <div className="adm-comment-meta">
                      <span className="adm-cell-strong">{c.author}</span>
                      <span className="adm-cell-muted">{c.date}</span>
                      {c.status === 'hidden' && <span className="adm-badge hidden">{t('admin.op.hiddenTag')}</span>}
                    </div>
                    <p className="adm-comment-text">{c.content}</p>
                  </div>
                  <div className="adm-actions">
                    <button className="adm-btn-sm" onClick={() => toggleHideComment(c.id)}>
                      {c.status === 'visible' ? t('admin.hide') : t('admin.show')}
                    </button>
                    <button className="adm-btn-sm danger" onClick={() => removeComment(c.id)}>{t('admin.delete')}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
