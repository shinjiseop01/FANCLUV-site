import { useState, useEffect, useCallback } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import Icon from '../components/Icon.jsx'
import { listNotes, addNote, deleteNote } from '../lib/adminNotesRepo.js'

// 운영자 전용 내부 메모 박스. 회원/의견/댓글/신고 상세에 재사용.
// entityType: 'member' | 'opinion' | 'comment' | 'report', entityId: 대상 id.
// adminNotesRepo 가 isAdmin() 로 접근을 막고, RequireAdmin 안에서만 렌더된다.
export default function AdminNoteBox({ entityType, entityId }) {
  const { t } = useLang()
  const [notes, setNotes] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    let active = true
    listNotes(entityType, entityId).then(list => { if (active) setNotes(list) })
    return () => { active = false }
  }, [entityType, entityId])

  useEffect(() => load(), [load])

  async function submit(e) {
    e.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    const res = await addNote(entityType, entityId, text)
    setBusy(false)
    if (res.ok) { setText(''); setNotes(list => [res.note, ...list]) }
  }

  async function remove(id) {
    const res = await deleteNote(id)
    if (res.ok) setNotes(list => list.filter(n => n.id !== id))
  }

  const fmt = iso => String(iso || '').slice(0, 10)

  return (
    <div className="adm-notes">
      <div className="adm-notes-head">
        <Icon name="edit" size={14} />
        <span>{t('admin.note.title')}</span>
        <span className="adm-notes-hint">{t('admin.note.internalOnly')}</span>
      </div>

      <form className="adm-notes-form" onSubmit={submit}>
        <input
          className="adm-input"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={t('admin.note.placeholder')}
          maxLength={300}
          aria-label={t('admin.note.title')}
        />
        <button type="submit" className="adm-btn-sm primary" disabled={!text.trim() || busy}>{t('admin.note.add')}</button>
      </form>

      {notes.length === 0 ? (
        <p className="adm-notes-empty">{t('admin.note.empty')}</p>
      ) : (
        <ul className="adm-notes-list">
          {notes.map(n => (
            <li key={n.id} className="adm-note-item">
              <div className="adm-note-body">
                <span className="adm-note-text">{n.body}</span>
                <span className="adm-note-meta">{n.author ? `${n.author} · ` : ''}{fmt(n.createdAt)}</span>
              </div>
              <button className="adm-note-del" onClick={() => remove(n.id)} aria-label={t('admin.delete')} title={t('admin.delete')}>×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
