import { useState, useMemo } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { getTeam, teamName } from '../teams.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Icon from '../components/Icon.jsx'
import AdminNoteBox from './AdminNoteBox.jsx'
import { MOCK_OPINIONS, MOCK_COMMENTS } from './adminData.js'
import { exportCsv } from '../lib/admin/csv.js'

const FILTERS = ['all', 'visible', 'hidden']

export default function AdminOpinions() {
  const { t, lang } = useLang()
  const [opinions, setOpinions] = useState(MOCK_OPINIONS)
  const [comments, setComments] = useState(MOCK_COMMENTS)
  const [selectedId, setSelectedId] = useState(null) // 댓글을 펼쳐 볼 게시글 id
  const [noteFor, setNoteFor] = useState(null)       // 메모를 펼친 댓글 id
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  const statusLabel = s => s === 'hidden' ? t('admin.op.hiddenTag') : t('admin.op.visibleTag')

  function toggleHide(id) {
    setOpinions(list => list.map(o =>
      o.id === id ? { ...o, status: o.status === 'visible' ? 'hidden' : 'visible' } : o,
    ))
  }
  function remove(id) {
    setOpinions(list => list.filter(o => o.id !== id))
    if (selectedId === id) setSelectedId(null)
  }
  function selectComments(id) { setSelectedId(prev => (prev === id ? null : id)); setNoteFor(null) }
  function toggleHideComment(cid) {
    setComments(list => list.map(c =>
      c.id === cid ? { ...c, status: c.status === 'visible' ? 'hidden' : 'visible' } : c,
    ))
  }
  function removeComment(cid) { setComments(list => list.filter(c => c.id !== cid)) }

  // 검색: 닉네임(작성자) / 구단 / 날짜 / 상태  + 상태 필터
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return opinions.filter(o => {
      if (filter !== 'all' && (o.status || 'visible') !== filter) return false
      if (!q) return true
      const team = teamName(getTeam(o.team), lang) || ''
      return [o.author, team, o.date, o.content, statusLabel(o.status)]
        .some(v => String(v || '').toLowerCase().includes(q))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opinions, query, filter, t])

  function downloadCsv() {
    const cols = [
      { key: 'id', label: 'ID' },
      { key: 'author', label: t('admin.op.colAuthor') },
      { key: 'team', label: t('admin.op.colTeam') },
      { key: 'date', label: t('admin.op.colDate') },
      { key: 'content', label: t('admin.op.colContent') },
      { key: 'likes', label: t('admin.op.colLikes') },
      { key: 'comments', label: t('admin.op.colComments') },
      { key: 'status', label: t('admin.mem.colStatus') },
    ]
    const rows = visible.map(o => ({
      id: o.id, author: o.author, team: teamName(getTeam(o.team), lang) || '', date: o.date,
      content: o.content, likes: o.likes,
      comments: comments.filter(c => c.opinionId === o.id).length,
      status: statusLabel(o.status),
    }))
    exportCsv('fancluv_opinions', cols, rows)
  }

  const selectedOpinion = opinions.find(o => o.id === selectedId) || null
  const selectedComments = comments.filter(c => c.opinionId === selectedId)

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-head-row">
        <div>
          <h1 className="adm-h1">{t('admin.menu.opinions')}</h1>
          <p className="adm-sub">{t('admin.op.sub', { n: opinions.length })}</p>
        </div>
        <button className="adm-btn-ghost adm-csv-btn" onClick={downloadCsv} disabled={visible.length === 0}>
          <Icon name="external" size={15} /> {t('admin.csv')}
        </button>
      </header>

      <div className="adm-toolbar">
        <div className="adm-search">
          <Icon name="search" size={18} />
          <input type="search" placeholder={t('admin.op.searchPh')} value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="adm-filters" role="group" aria-label={t('admin.mem.colStatus')}>
          {FILTERS.map(f => (
            <button key={f} className={`adm-filter${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? t('admin.rp.filterAll') : f === 'visible' ? t('admin.op.visibleTag') : t('admin.op.hiddenTag')}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
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
              {visible.map(o => {
                const team = getTeam(o.team)
                const isOpen = selectedId === o.id
                const count = comments.filter(c => c.opinionId === o.id).length
                return (
                  <tr key={o.id} className={o.status === 'hidden' ? 'is-hidden' : ''}>
                    <td className="adm-cell-strong">{o.author}</td>
                    <td className="adm-cell-muted">{team ? teamName(team, lang) : '-'}</td>
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

      {/* ── 선택한 게시글의 댓글 관리 + 관리자 메모 ── */}
      {selectedOpinion && (
        <section className="adm-comments">
          <div className="adm-comments-head">
            <h2 className="adm-h2">{t('admin.cm.title', { author: selectedOpinion.author })}</h2>
            <button className="adm-btn-ghost" onClick={() => setSelectedId(null)}>{t('admin.cm.close')}</button>
          </div>

          {/* 게시글(팬 의견) 메모 */}
          <AdminNoteBox entityType="opinion" entityId={selectedOpinion.id} />

          {selectedComments.length === 0 ? (
            <EmptyState compact iconName="comment" title={t('admin.cm.emptyTitle')} message={t('admin.cm.emptyMsg')} />
          ) : (
            <ul className="adm-comment-list">
              {selectedComments.map(c => (
                <li key={c.id} className={`adm-comment${c.status === 'hidden' ? ' is-hidden' : ''}`}>
                  <div className="adm-comment-main">
                    <div className="adm-comment-body">
                      <div className="adm-comment-meta">
                        <span className="adm-cell-strong">{c.author}</span>
                        <span className="adm-cell-muted">{c.date}</span>
                        {c.status === 'hidden' && <span className="adm-badge hidden">{t('admin.op.hiddenTag')}</span>}
                      </div>
                      <p className="adm-comment-text">{c.content}</p>
                    </div>
                    <div className="adm-actions">
                      <button className={`adm-btn-sm${noteFor === c.id ? ' on' : ''}`} onClick={() => setNoteFor(id => (id === c.id ? null : c.id))}>{t('admin.note.btn')}</button>
                      <button className="adm-btn-sm" onClick={() => toggleHideComment(c.id)}>
                        {c.status === 'visible' ? t('admin.hide') : t('admin.show')}
                      </button>
                      <button className="adm-btn-sm danger" onClick={() => removeComment(c.id)}>{t('admin.delete')}</button>
                    </div>
                  </div>
                  {noteFor === c.id && <AdminNoteBox entityType="comment" entityId={c.id} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
