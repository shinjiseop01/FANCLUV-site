import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { getTeam, teamName } from '../teams.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { SkeletonList } from '../components/Skeleton.jsx'
import Icon from '../components/Icon.jsx'
import AdminNoteBox from './AdminNoteBox.jsx'
import { exportCsv } from '../lib/admin/csv.js'
import {
  adminListOpinions, adminListComments,
  setOpinionHidden, deleteOpinion, setCommentHidden, deleteCommentAdmin,
} from '../lib/admin/adminOpinionsRepo.js'

const FILTERS = ['all', 'visible', 'hidden']

export default function AdminOpinions() {
  const { t, lang } = useLang()
  const [opinions, setOpinions] = useState([])
  const [comments, setComments] = useState([])       // 현재 선택한 의견의 댓글
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null) // 댓글을 펼쳐 볼 게시글 id
  const [noteFor, setNoteFor] = useState(null)       // 메모를 펼친 댓글 id
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  const statusLabel = s => s === 'hidden' ? t('admin.op.hiddenTag') : t('admin.op.visibleTag')

  // 의견 목록 로드/재조회 — 항상 Repository(실데이터 우선) 기준.
  const refetch = useCallback(async () => {
    setLoading(true)
    const list = await adminListOpinions()
    setOpinions(list)
    setLoading(false)
  }, [])
  useEffect(() => { refetch() }, [refetch])

  // 선택 의견의 댓글 로드.
  const loadComments = useCallback(async (id) => {
    setComments(await adminListComments(id))
  }, [])

  async function toggleHide(o) {
    const res = await setOpinionHidden(o.id, o.status !== 'hidden')
    if (res.ok) refetch()
  }
  async function remove(id) {
    const res = await deleteOpinion(id)
    if (res.ok) { if (selectedId === id) setSelectedId(null); refetch() }
  }
  function selectComments(id) {
    setNoteFor(null)
    setSelectedId(prev => {
      const next = prev === id ? null : id
      if (next) loadComments(next); else setComments([])
      return next
    })
  }
  async function toggleHideComment(c) {
    const res = await setCommentHidden(c.id, c.status !== 'hidden')
    if (res.ok && selectedId) loadComments(selectedId)
  }
  async function removeComment(cid) {
    const res = await deleteCommentAdmin(cid)
    if (res.ok && selectedId) loadComments(selectedId)
  }

  // 검색: 닉네임(작성자) / 구단 / 날짜 / 제목·내용 / 상태  + 상태 필터
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return opinions.filter(o => {
      if (filter !== 'all' && (o.status || 'visible') !== filter) return false
      if (!q) return true
      const team = teamName(getTeam(o.team), lang) || ''
      return [o.author, team, o.date, o.title, o.content, statusLabel(o.status)]
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
      { key: 'reports', label: t('admin.op.colReports') },
      { key: 'status', label: t('admin.mem.colStatus') },
    ]
    const rows = visible.map(o => ({
      id: o.id, author: o.author, team: teamName(getTeam(o.team), lang) || '', date: o.date,
      content: o.title ? `${o.title} — ${o.content}` : o.content,
      likes: o.likes, comments: o.comments, reports: o.reports,
      status: statusLabel(o.status),
    }))
    exportCsv('fancluv_opinions', cols, rows)
  }

  const selectedOpinion = opinions.find(o => o.id === selectedId) || null

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

      {loading ? (
        <SkeletonList count={5} lines={2} />
      ) : visible.length === 0 ? (
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
                <th>{t('admin.op.colReports')}</th>
                <th className="adm-col-actions">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(o => {
                const team = getTeam(o.team)
                const isOpen = selectedId === o.id
                return (
                  <tr key={o.id} className={o.status === 'hidden' ? 'is-hidden' : ''}>
                    <td className="adm-cell-strong">{o.author}</td>
                    <td className="adm-cell-muted">{team ? teamName(team, lang) : '-'}</td>
                    <td className="adm-cell-muted">{o.date}</td>
                    <td className="adm-cell-content">
                      {o.title ? <><strong>{o.title}</strong><br />{o.content}</> : o.content}
                      {o.status === 'hidden' && <span className="adm-badge hidden">{t('admin.op.hiddenTag')}</span>}
                    </td>
                    <td>{Number(o.likes || 0).toLocaleString()}</td>
                    <td>
                      <button className={`adm-link-btn${isOpen ? ' on' : ''}`} onClick={() => selectComments(o.id)}>
                        {t('admin.op.viewComments', { n: o.comments })}
                      </button>
                    </td>
                    <td>{Number(o.reports || 0).toLocaleString()}</td>
                    <td className="adm-col-actions">
                      <div className="adm-actions">
                        <button className="adm-btn-sm" onClick={() => toggleHide(o)}>
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
            <button className="adm-btn-ghost" onClick={() => { setSelectedId(null); setComments([]) }}>{t('admin.cm.close')}</button>
          </div>

          {/* 게시글(팬 의견) 메모 */}
          <AdminNoteBox entityType="opinion" entityId={selectedOpinion.id} />

          {comments.length === 0 ? (
            <EmptyState compact iconName="comment" title={t('admin.cm.emptyTitle')} message={t('admin.cm.emptyMsg')} />
          ) : (
            <ul className="adm-comment-list">
              {comments.map(c => (
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
                      <button className="adm-btn-sm" onClick={() => toggleHideComment(c)}>
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
