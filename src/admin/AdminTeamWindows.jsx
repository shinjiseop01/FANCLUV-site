import { useState, useEffect } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { listTeamChangeWindows, saveTeamChangeWindow } from '../lib/admin/teamWindowsRepo.js'

// 응원팀 변경 기간(team_change_windows) 운영 관리 — Admin 설정 카드.
// 관리자가 시즌별 변경 시작/종료/활성을 등록·수정하면 Fan 설정 페이지에 별도 배포 없이 반영.
function dOnly(iso) { return iso ? String(iso).slice(0, 10) : '' }
function fmtRange(w, t) {
  const now = new Date()
  const inRange = w.is_active && new Date(w.starts_at) <= now && now <= new Date(w.ends_at)
  return { text: `${dOnly(w.starts_at)} ~ ${dOnly(w.ends_at)}`, live: inRange, t }
}

export default function AdminTeamWindows() {
  const { t } = useLang()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ seasonYear: new Date().getFullYear() + 1, startDate: '', endDate: '', isActive: true })
  const [saving, setSaving] = useState(false)

  async function reload() { setRows(await listTeamChangeWindows()); setLoading(false) }
  useEffect(() => { reload() }, [])

  function editRow(w) {
    setForm({ seasonYear: w.season_year, startDate: dOnly(w.starts_at), endDate: dOnly(w.ends_at), isActive: w.is_active })
  }

  async function onSave() {
    if (saving) return
    const s = Number(form.seasonYear)
    if (!s || s < 2000 || s > 2100) { toast.error(t('admin.tw.errSeason')); return }
    if (!form.startDate || !form.endDate) { toast.error(t('admin.tw.errRange')); return }
    // 날짜 → KST 경계(시작 00:00, 종료 23:59:59)
    const startsAt = `${form.startDate}T00:00:00+09:00`
    const endsAt = `${form.endDate}T23:59:59+09:00`
    if (new Date(startsAt) >= new Date(endsAt)) { toast.error(t('admin.tw.errRange')); return }
    setSaving(true)
    const r = await saveTeamChangeWindow({ seasonYear: s, startsAt, endsAt, isActive: !!form.isActive })
    setSaving(false)
    if (!r.ok) { toast.error(r.code === 'INVALID_RANGE' ? t('admin.tw.errRange') : r.code === 'INVALID_SEASON' ? t('admin.tw.errSeason') : t('admin.tw.errSave')); return }
    toast.info(t('admin.tw.saved'))
    await reload()
  }

  return (
    <section className="adm-card">
      <h2 className="adm-h2">{t('admin.tw.title')}</h2>
      <p className="adm-card-note">{t('admin.tw.note')}</p>

      {loading ? null : rows.length === 0 ? (
        <p className="adm-muted">{t('admin.tw.empty')}</p>
      ) : (
        <ul className="adm-tw-list">
          {rows.map(w => {
            const r = fmtRange(w, t)
            return (
              <li key={w.id} className="adm-tw-row">
                <span className="adm-cell-strong">{w.season_year}</span>
                <span className="adm-tw-range">{r.text}</span>
                <span className={`adm-badge ${w.is_active ? (r.live ? 'active' : 'soon') : 'off'}`}>
                  {w.is_active ? (r.live ? t('admin.tw.live') : t('admin.tw.scheduled')) : t('admin.tw.inactive')}
                </span>
                <button className="adm-btn-sm" onClick={() => editRow(w)}>{t('admin.tw.edit')}</button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="adm-tw-form">
        <div className="adm-tw-field">
          <label htmlFor="tw-season">{t('admin.tw.season')}</label>
          <input id="tw-season" type="number" min="2000" max="2100" value={form.seasonYear}
            onChange={e => setForm(f => ({ ...f, seasonYear: e.target.value }))} />
        </div>
        <div className="adm-tw-field">
          <label htmlFor="tw-start">{t('admin.tw.start')}</label>
          <input id="tw-start" type="date" value={form.startDate}
            onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
        </div>
        <div className="adm-tw-field">
          <label htmlFor="tw-end">{t('admin.tw.end')}</label>
          <input id="tw-end" type="date" value={form.endDate}
            onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
        </div>
        <label className="adm-tw-active">
          <input type="checkbox" checked={form.isActive}
            onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
          {t('admin.tw.active')}
        </label>
        <button className="adm-btn-sm primary" onClick={onSave} disabled={saving}>
          {saving ? t('common.processing') : t('admin.tw.save')}
        </button>
      </div>
    </section>
  )
}
