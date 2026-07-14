import { useState, useEffect, useRef, useCallback } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { TEAMS, getTeam, teamName } from '../teams.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Pagination from '../components/Pagination.jsx'
import Icon from '../components/Icon.jsx'
import { useEscapeKey } from '../lib/useEscapeKey.js'
import {
  adminListNews, adminGetNews, createNews, updateNews, deleteNews,
  transitionNewsStatus, setNewsPinned, newsDashboardCounts, autosaveDraft,
} from '../lib/newsRepo.js'
import {
  NEWS_STATUS_META, NEWS_TRANSITIONS, SUGGESTED_TAGS, normalizeTags,
} from '../lib/news/newsStatus.js'
import { saveNewsImage, deleteNewsImage, validateImageFile, ACCEPTED_EXT } from '../lib/news/newsImageStorage.js'

const PAGE_SIZE = 20
const AUTOSAVE_MS = 30000
const EMPTY = { title: '', content: '', team: TEAMS[0].id, image: '', category: '구단 공지', tags: [], isImportant: false, status: 'draft' }

function StatusBadge({ status, t }) {
  const m = NEWS_STATUS_META[status] || NEWS_STATUS_META.draft
  return <span className={`nw-badge nw-badge-${m.tone}`}>{t(m.labelKey)}</span>
}

export default function AdminNews() {
  const { t, lang } = useLang()
  const [list, setList] = useState({ items: [], total: 0 })
  const [counts, setCounts] = useState(null)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ status: '', q: '' })
  const [sort, setSort] = useState('newest')
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [saveState, setSaveState] = useState('') // '', 'saving', 'saved'
  const [preview, setPreview] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const autosaveTimer = useRef(null)
  const fileRef = useRef(null)

  const refresh = useCallback(async () => {
    const [res, c] = await Promise.all([
      adminListNews({ filters, sort, page, pageSize: PAGE_SIZE }),
      newsDashboardCounts(),
    ])
    setList(res); setCounts(c)
  }, [filters, sort, page])

  useEffect(() => { refresh() }, [refresh])

  function openCreate() { setError(''); setPreview(false); setForm({ ...EMPTY }) }
  async function openEdit(n) {
    setError(''); setPreview(false)
    const fresh = await adminGetNews(n.id)
    setForm(fresh ? { ...fresh } : { ...n })
  }
  function close() { setForm(null); setError(''); setSaveState(''); if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
  useEscapeKey(close, !!form)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // 자동저장(30초 debounce) — 새 글/draft 만. 게시된 글은 명시 저장.
  useEffect(() => {
    if (!form || (form.status && form.status !== 'draft')) return
    if (!form.title?.trim() && !form.content?.trim()) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(async () => {
      setSaveState('saving')
      const r = await autosaveDraft(form)
      if (r.ok) { setSaveState('saved'); if (r.created && r.id) setForm(f => ({ ...f, id: r.id, status: 'draft' })) }
      else setSaveState('')
    }, AUTOSAVE_MS)
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.title, form?.content, form?.tags, form?.image, form?.team])

  async function saveNow(e) {
    e?.preventDefault()
    if (!form.title?.trim()) { setError(t('admin.nw.errTitle')); return }
    if (!form.content?.trim()) { setError(t('admin.nw.errContent')); return }
    setSaveState('saving')
    let res
    if (form.id) res = await updateNews(form.id, form)
    else res = await createNews({ ...form, status: 'draft' })
    if (!res.ok) { setError(res.error || t('admin.nw.errTitle')); setSaveState(''); return }
    setSaveState('saved')
    if (!form.id && res.news?.id) setForm(f => ({ ...f, id: res.news.id }))
    refresh()
  }

  async function doTransition(to, publishAt = null) {
    if (!form.title?.trim() || !form.content?.trim()) { setError(t('admin.nw.errContent')); return }
    // 저장 보장: id 없으면 먼저 draft 생성.
    let id = form.id
    if (!id) {
      const c = await createNews({ ...form, status: 'draft' })
      if (!c.ok) { setError(c.error || t('admin.nw.errTransition')); return }
      id = c.news.id; setForm(f => ({ ...f, id }))
    } else {
      await updateNews(id, form) // 현재 편집 내용 반영 후 전이
    }
    const r = await transitionNewsStatus(id, to, publishAt)
    if (!r.ok) {
      const key = `admin.nw.err.${r.code}`
      setError(t(key) === key ? t('admin.nw.errTransition') : t(key))
      return
    }
    setError(''); setForm(f => ({ ...f, status: to, publishAt }))
    refresh()
  }

  async function togglePin(n) {
    const r = await setNewsPinned(n.id, !n.pinned)
    if (!r.ok) { setError(r.code === 'pin_limit' ? t('admin.nw.err.pin_limit') : t('admin.nw.errTransition')); return }
    refresh()
  }

  async function remove(id) {
    const res = await deleteNews(id)
    if (res.ok) { if (form?.id === id) close(); refresh() }
  }

  // ── 이미지 업로드 ──
  async function onPickImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const v = validateImageFile(file)
    if (!v.ok) { setError(t(`admin.nw.img.${v.code}`)); e.target.value = ''; return }
    setSaveState('saving')
    const r = await saveNewsImage(file, form.id || 'tmp', form.image)
    e.target.value = ''
    if (!r.ok) { setError(t('admin.nw.img.upload_failed')); setSaveState(''); return }
    set('image', r.url); setSaveState('saved'); setError('')
  }
  async function removeImage() {
    if (form.image) await deleteNewsImage(form.image)
    set('image', '')
  }

  // ── 태그 ──
  function addTag(raw) {
    const next = normalizeTags([...(form.tags || []), raw])
    set('tags', next); setTagInput('')
  }
  function removeTag(tag) { set('tags', (form.tags || []).filter(x => x !== tag)) }

  const items = list.items
  const dash = counts || {}

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-head-row">
        <div>
          <h1 className="adm-h1">{t('admin.menu.news')}</h1>
          <p className="adm-sub">{t('admin.nw.sub', { n: list.total })}</p>
        </div>
        <button className="adm-btn-primary" onClick={openCreate}>+ {t('admin.nw.create')}</button>
      </header>

      {/* 운영 대시보드 */}
      {counts && (
        <div className="nw-dash" aria-label={t('admin.nw.dashboard')}>
          {['draft', 'published', 'scheduled', 'archived', 'pinned', 'today', 'this_week', 'ai_pending'].map(k => (
            <div key={k} className="nw-dash-cell">
              <span className="nw-dash-val">{dash[k] ?? 0}</span>
              <span className="nw-dash-lbl">{t(`admin.nw.dash.${k}`)}</span>
            </div>
          ))}
        </div>
      )}

      {/* 검색/필터/정렬 */}
      <div className="nw-toolbar">
        <input className="adm-input nw-search" type="search" value={filters.q}
          onChange={e => { setPage(1); setFilters(f => ({ ...f, q: e.target.value })) }}
          placeholder={t('admin.nw.searchPh')} aria-label={t('admin.nw.searchPh')} />
        <select className="adm-input" value={filters.status} aria-label={t('admin.nw.filterStatus')}
          onChange={e => { setPage(1); setFilters(f => ({ ...f, status: e.target.value })) }}>
          <option value="">{t('admin.nw.allStatus')}</option>
          {['draft', 'scheduled', 'published', 'archived'].map(s => <option key={s} value={s}>{t(NEWS_STATUS_META[s].labelKey)}</option>)}
        </select>
        <select className="adm-input" value={sort} aria-label={t('admin.nw.sort')} onChange={e => { setPage(1); setSort(e.target.value) }}>
          <option value="newest">{t('admin.nw.sortNewest')}</option>
          <option value="oldest">{t('admin.nw.sortOldest')}</option>
          <option value="views">{t('admin.nw.sortViews')}</option>
          <option value="schedule">{t('admin.nw.sortSchedule')}</option>
        </select>
      </div>

      {/* 에디터 */}
      {form && (
        <div className="nw-editor" role="dialog" aria-modal="true" aria-label={form.id ? t('admin.nw.editTitle') : t('admin.nw.createTitle')}>
          <div className="nw-editor-head">
            <h2 className="adm-h2">{form.id ? t('admin.nw.editTitle') : t('admin.nw.createTitle')}</h2>
            <div className="nw-editor-meta">
              <StatusBadge status={form.status || 'draft'} t={t} />
              {saveState === 'saving' && <span className="nw-save">{t('admin.nw.saving')}</span>}
              {saveState === 'saved' && <span className="nw-save nw-saved">{t('admin.nw.saved')}</span>}
              <button className="adm-btn-sm" type="button" onClick={() => setPreview(p => !p)} aria-pressed={preview}>{preview ? t('admin.nw.edit') : t('admin.nw.preview')}</button>
              <button className="adm-btn-sm" type="button" onClick={close} aria-label={t('admin.cancel')}><Icon name="close" size={14} /></button>
            </div>
          </div>

          {preview ? (
            <div className="nw-preview">
              {form.image && <img className="nw-preview-img" src={form.image} alt="" />}
              <h3>{form.title || t('admin.nw.fTitlePh')}</h3>
              <div className="nw-preview-tags">{(form.tags || []).map(tg => <span key={tg} className="nw-tag">#{tg}</span>)}</div>
              {String(form.content || '').split(/\n{2,}|\n/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
            </div>
          ) : (
            <form className="adm-form" onSubmit={saveNow}>
              <div className="adm-field">
                <label htmlFor="nw-title">{t('admin.nw.fTitle')}</label>
                <input id="nw-title" className="adm-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder={t('admin.nw.fTitlePh')} autoFocus />
              </div>
              <div className="adm-field">
                <label htmlFor="nw-content">{t('admin.nw.fContent')}</label>
                <textarea id="nw-content" className="adm-input" rows={6} value={form.content} onChange={e => set('content', e.target.value)} placeholder={t('admin.nw.fContentPh')} />
              </div>
              <div className="adm-field-row">
                <div className="adm-field">
                  <label htmlFor="nw-team">{t('admin.nw.fTeam')}</label>
                  <select id="nw-team" className="adm-input" value={form.team || ''} onChange={e => set('team', e.target.value)}>
                    <option value="">{t('admin.nw.allTeams')}</option>
                    {TEAMS.map(tm => <option key={tm.id} value={tm.id}>{teamName(tm, lang)}</option>)}
                  </select>
                </div>
                <div className="adm-field">
                  <label htmlFor="nw-cat">{t('admin.nw.fCategory')}</label>
                  <input id="nw-cat" className="adm-input" value={form.category || ''} onChange={e => set('category', e.target.value)} />
                </div>
              </div>

              {/* 대표 이미지 */}
              <div className="adm-field">
                <label>{t('admin.nw.fImage')} <span className="nw-hint">({ACCEPTED_EXT}, ≤5MB)</span></label>
                <div className="nw-image-row">
                  <div className="nw-image-preview" style={{ backgroundImage: form.image ? `url(${form.image})` : 'none' }}>
                    {!form.image && <Icon name="image" size={22} />}
                  </div>
                  <div className="nw-image-actions">
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickImage} hidden />
                    <button type="button" className="adm-btn-sm" onClick={() => fileRef.current?.click()}>{form.image ? t('admin.nw.imgReplace') : t('admin.nw.imgUpload')}</button>
                    {form.image && <button type="button" className="adm-btn-sm danger" onClick={removeImage}>{t('admin.nw.imgRemove')}</button>}
                  </div>
                </div>
              </div>

              {/* 태그 */}
              <div className="adm-field">
                <label htmlFor="nw-tag">{t('admin.nw.fTags')}</label>
                <div className="nw-tags">
                  {(form.tags || []).map(tg => (
                    <span key={tg} className="nw-tag nw-tag-on">#{tg}
                      <button type="button" aria-label={`remove ${tg}`} onClick={() => removeTag(tg)}><Icon name="close" size={11} /></button>
                    </span>
                  ))}
                  <input id="nw-tag" className="nw-tag-input" value={tagInput} onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (tagInput.trim()) addTag(tagInput) } }}
                    placeholder={t('admin.nw.tagPh')} />
                </div>
                <div className="nw-tag-suggest">
                  {SUGGESTED_TAGS.filter(s => !(form.tags || []).some(x => x.toLowerCase() === s.toLowerCase())).map(s => (
                    <button type="button" key={s} className="nw-tag nw-tag-sug" onClick={() => addTag(s)}>+ {s}</button>
                  ))}
                </div>
              </div>

              <label className="nw-check"><input type="checkbox" checked={!!form.isImportant} onChange={e => set('isImportant', e.target.checked)} /> {t('admin.nw.fImportant')}</label>

              {error && <div className="adm-error" role="alert"><Icon name="warningTriangle" size={14} className="fc-inline-ico" />{error}</div>}

              {/* 상태 전이 액션 */}
              <div className="nw-status-actions" role="group" aria-label={t('admin.nw.statusActions')}>
                <button type="submit" className="adm-btn-primary">{t('admin.nw.saveDraft')}</button>
                {(NEWS_TRANSITIONS[form.status || 'draft'] || []).includes('published') &&
                  <button type="button" className="adm-btn-primary" onClick={() => doTransition('published')}>{t('admin.nw.publish')}</button>}
                {(NEWS_TRANSITIONS[form.status || 'draft'] || []).includes('scheduled') && (
                  <span className="nw-sched">
                    <input type="datetime-local" className="adm-input" value={form._schedInput || ''} onChange={e => set('_schedInput', e.target.value)} aria-label={t('admin.nw.publishAt')} />
                    <button type="button" className="adm-btn-sm" disabled={!form._schedInput}
                      onClick={() => doTransition('scheduled', new Date(form._schedInput).toISOString())}>{t('admin.nw.schedule')}</button>
                  </span>
                )}
                {(NEWS_TRANSITIONS[form.status || 'draft'] || []).includes('archived') &&
                  <button type="button" className="adm-btn-ghost" onClick={() => doTransition('archived')}>{t('admin.nw.archive')}</button>}
                {form.status === 'archived' &&
                  <button type="button" className="adm-btn-ghost" onClick={() => doTransition('draft')}>{t('admin.nw.restore')}</button>}
              </div>
            </form>
          )}
        </div>
      )}

      {/* 목록 */}
      {items.length === 0 ? (
        <EmptyState iconName="news" title={t('empty.newsTitle')} message={t('empty.newsMsg')} />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('admin.nw.colImage')}</th>
                <th>{t('admin.nw.colTitle')}</th>
                <th>{t('admin.nw.colStatus')}</th>
                <th>{t('admin.nw.colTeam')}</th>
                <th>{t('admin.nw.colViews')}</th>
                <th>{t('admin.nw.colDate')}</th>
                <th className="adm-col-actions">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map(n => {
                const team = getTeam(n.team)
                return (
                  <tr key={n.id} className={n.pinned ? 'nw-row-pinned' : ''}>
                    <td>
                      <div className="adm-thumb" style={{ backgroundImage: n.image ? `url(${n.image})` : 'none' }}>
                        {!n.image && <Icon name="image" size={18} />}
                      </div>
                    </td>
                    <td className="adm-cell-strong">
                      {n.pinned && <Icon name="pin" size={13} className="nw-pin-ico" />}{n.title}
                      {(n.tags || []).length > 0 && <div className="nw-row-tags">{n.tags.map(tg => <span key={tg} className="nw-tag nw-tag-sm">#{tg}</span>)}</div>}
                    </td>
                    <td><StatusBadge status={n.status} t={t} /></td>
                    <td className="adm-cell-muted">{team ? teamName(team, lang) : t('admin.nw.allTeams')}</td>
                    <td className="adm-cell-muted">{n.views}</td>
                    <td className="adm-cell-muted">{n.date}</td>
                    <td className="adm-col-actions">
                      <div className="adm-actions">
                        <button className="adm-btn-sm" onClick={() => openEdit(n)}>{t('admin.edit')}</button>
                        <button className="adm-btn-sm" onClick={() => togglePin(n)} aria-pressed={n.pinned}>{n.pinned ? t('admin.nw.unpin') : t('admin.nw.pin')}</button>
                        <button className="adm-btn-sm danger" onClick={() => remove(n.id)}>{t('admin.delete')}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination page={page} total={Math.ceil(list.total / PAGE_SIZE)} onChange={setPage} />
        </div>
      )}
    </div>
  )
}
