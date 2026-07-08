import { useState, useMemo } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { getTeam, teamName } from '../teams.jsx'
import Avatar from '../components/Avatar.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Icon from '../components/Icon.jsx'
import AdminNoteBox from './AdminNoteBox.jsx'
import { MOCK_MEMBERS } from './adminData.js'
import { exportCsv } from '../lib/admin/csv.js'

// 필터: 전체 / 정상 / 비활성 / 이메일 인증 / 본인인증 여부
const FILTERS = ['all', 'active', 'inactive', 'email_verified', 'email_unverified', 'identity_verified', 'identity_unverified']

// Verification badge: class + label key per status.
function vMeta(status) {
  if (status === 'phone_verified') return { cls: 'vphone', key: 'admin.mem.vPhone' }
  if (status === 'email_verified') return { cls: 'vemail', key: 'admin.mem.vEmail' }
  return { cls: 'vnone', key: 'admin.mem.vNone' }
}

// 로그인 방식(provider) 표시 라벨. 소셜은 브랜드명 그대로, 이메일만 번역.
function loginLabel(provider, t) {
  if (provider === 'google') return 'Google'
  if (provider === 'kakao') return 'Kakao'
  if (provider === 'naver') return 'NAVER'
  return t('admin.mem.loginEmail')
}

// 필터 매칭 (상태 + 이메일 인증 여부)
function matchFilter(m, f) {
  if (f === 'all') return true
  if (f === 'active') return m.status === 'active'
  if (f === 'inactive') return m.status === 'inactive'
  if (f === 'email_verified') return m.verificationStatus === 'email_verified' || m.verificationStatus === 'phone_verified'
  if (f === 'email_unverified') return (m.verificationStatus || 'unverified') === 'unverified'
  if (f === 'identity_verified') return !!m.identityVerified
  if (f === 'identity_unverified') return !m.identityVerified
  return true
}

export default function AdminMembers() {
  const { t, lang } = useLang()
  const [members, setMembers] = useState(MOCK_MEMBERS)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)   // 회원 상세 패널 (운영자 전용)

  // 성별 / 나이대 표시 라벨 (회원가입 폼과 동일 키 재사용)
  const genderLabel = g => g === 'male' ? t('signup.genderMale') : g === 'female' ? t('signup.genderFemale') : t('set.notSet')
  const ageLabel = a => a ? (a === '50+' ? t('signup.age50') : t(`signup.age${a}`)) : t('set.notSet')
  const statusLabel = s => s === 'active' ? t('admin.mem.active') : t('admin.mem.inactive')

  // 검색: 이메일 / 닉네임 / 구단 / 날짜(가입일) / 상태
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members.filter(m => {
      if (!matchFilter(m, filter)) return false
      if (!q) return true
      const team = teamName(getTeam(m.team), lang) || ''
      return [m.nickname, m.email, team, m.joinedAt, statusLabel(m.status)]
        .some(v => String(v || '').toLowerCase().includes(q))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, query, filter, t])

  function toggleActive(id) {
    setMembers(list => list.map(m =>
      m.id === id ? { ...m, status: m.status === 'active' ? 'inactive' : 'active' } : m,
    ))
  }

  function remove(id) {
    setMembers(list => list.filter(m => m.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function downloadCsv() {
    const cols = [
      { key: 'id', label: 'Member ID' },
      { key: 'nickname', label: t('admin.mem.fNickname') },
      { key: 'email', label: t('admin.mem.colEmail') },
      { key: 'joinedAt', label: t('admin.mem.colJoined') },
      { key: 'team', label: t('admin.mem.colTeam') },
      { key: 'login', label: t('admin.mem.fLogin') },
      { key: 'gender', label: t('admin.mem.fGender') },
      { key: 'age', label: t('admin.mem.fAge') },
      { key: 'verify', label: t('admin.mem.fVerifyEmail') },
      { key: 'identity', label: t('admin.mem.fIdentity') },
      { key: 'status', label: t('admin.mem.colStatus') },
      { key: 'lastActive', label: t('admin.mem.fLastActive') },
    ]
    const rows = visible.map(m => ({
      id: m.id, nickname: m.nickname, email: m.email, joinedAt: m.joinedAt,
      team: teamName(getTeam(m.team), lang) || '', login: loginLabel(m.provider, t),
      gender: genderLabel(m.gender), age: ageLabel(m.ageGroup),
      verify: m.verificationStatus === 'unverified' ? t('admin.mem.verifiedNo') : t('admin.mem.verifiedYes'),
      identity: m.identityVerified ? t('admin.mem.identityYes') : t('admin.mem.identityNo'),
      status: statusLabel(m.status), lastActive: m.lastActiveAt || '',
    }))
    exportCsv('fancluv_members', cols, rows)
  }

  const selected = members.find(m => m.id === selectedId) || null

  return (
    <div className="adm-page">
      <header className="adm-page-head adm-head-row">
        <div>
          <h1 className="adm-h1">{t('admin.menu.members')}</h1>
          <p className="adm-sub">{t('admin.mem.sub', { n: members.length })}</p>
        </div>
        <button className="adm-btn-ghost adm-csv-btn" onClick={downloadCsv} disabled={visible.length === 0}>
          <Icon name="external" size={15} /> {t('admin.csv')}
        </button>
      </header>

      <div className="adm-toolbar">
        <div className="adm-search">
          <Icon name="search" size={18} />
          <input type="search" placeholder={t('admin.mem.searchPh')} value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="adm-filters" role="group" aria-label={t('admin.mem.colStatus')}>
          {FILTERS.map(f => (
            <button key={f}
              className={`adm-filter${filter === f ? ' on' : ''}`}
              onClick={() => setFilter(f)}>
              {t(`admin.mem.filter.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState iconName="search" title={t('empty.searchTitle')} message={t('empty.searchMsg')} />
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>{t('admin.mem.colProfile')}</th>
                <th>{t('admin.mem.colEmail')}</th>
                <th>{t('admin.mem.colJoined')}</th>
                <th>{t('admin.mem.colTeam')}</th>
                <th>{t('admin.mem.colVerify')}</th>
                <th>{t('admin.mem.colIdentity')}</th>
                <th>{t('admin.mem.colStatus')}</th>
                <th className="adm-col-actions">{t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(m => {
                const team = getTeam(m.team)
                const v = vMeta(m.verificationStatus)
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
                    <td>{team ? teamName(team, lang) : '-'}</td>
                    <td><span className={`adm-badge ${v.cls}`}>{t(v.key)}</span></td>
                    <td>
                      <span className={`adm-badge ${m.identityVerified ? 'vphone' : 'vnone'}`}>
                        {m.identityVerified ? t('admin.mem.identityYes') : t('admin.mem.identityNo')}
                      </span>
                    </td>
                    <td>
                      <span className={`adm-badge ${m.status}`}>{statusLabel(m.status)}</span>
                    </td>
                    <td className="adm-col-actions">
                      <div className="adm-actions">
                        <button className={`adm-btn-sm${selectedId === m.id ? ' on' : ''}`} onClick={() => setSelectedId(id => (id === m.id ? null : m.id))}>
                          {t('admin.mem.viewDetail')}
                        </button>
                        <button className="adm-btn-sm" onClick={() => toggleActive(m.id)}>
                          {m.status === 'active' ? t('admin.mem.deactivate') : t('admin.mem.activate')}
                        </button>
                        <button className="adm-btn-sm danger" onClick={() => remove(m.id)}>{t('admin.delete')}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 회원 상세 정보 — 운영자 전용 (RequireAdmin 가드 안에서만 렌더) */}
      {selected && (
        <section className="adm-panel adm-member-detail">
          <div className="adm-panel-head">
            <h2 className="adm-h2 adm-panel-title">{t('admin.mem.detailTitle')}</h2>
            <button className="adm-btn-sm" onClick={() => setSelectedId(null)}>{t('admin.mem.close')}</button>
          </div>
          <dl className="adm-report-dl adm-member-dl">
            <div><dt>{t('admin.mem.fId')}</dt><dd className="adm-mono">{selected.id}</dd></div>
            <div><dt>{t('admin.mem.fNickname')}</dt><dd>{selected.nickname}</dd></div>
            <div><dt>{t('admin.mem.colEmail')}</dt><dd>{selected.email}</dd></div>
            <div><dt>{t('admin.mem.colJoined')}</dt><dd>{selected.joinedAt}</dd></div>
            <div><dt>{t('admin.mem.fLogin')}</dt><dd>{loginLabel(selected.provider, t)}</dd></div>
            <div><dt>{t('admin.mem.colTeam')}</dt><dd>{teamName(getTeam(selected.team), lang) || '-'}</dd></div>
            <div><dt>{t('admin.mem.fGender')}</dt><dd>{genderLabel(selected.gender)}</dd></div>
            <div><dt>{t('admin.mem.fAge')}</dt><dd>{ageLabel(selected.ageGroup)}</dd></div>
            <div>
              <dt>{t('admin.mem.fVerifyEmail')}</dt>
              <dd>
                <span className={`adm-badge ${selected.verificationStatus === 'unverified' ? 'vnone' : 'vemail'}`}>
                  {selected.verificationStatus === 'unverified' ? t('admin.mem.verifiedNo') : t('admin.mem.verifiedYes')}
                </span>
              </dd>
            </div>
            <div>
              <dt>{t('admin.mem.fIdentity')}</dt>
              <dd>
                <span className={`adm-badge ${selected.identityVerified ? 'vphone' : 'vnone'}`}>
                  {selected.identityVerified ? t('admin.mem.identityYes') : t('admin.mem.identityNo')}
                </span>
              </dd>
            </div>
            <div>
              <dt>{t('admin.mem.colStatus')}</dt>
              <dd><span className={`adm-badge ${selected.status}`}>{statusLabel(selected.status)}</span></dd>
            </div>
            <div><dt>{t('admin.mem.fLastActive')}</dt><dd>{selected.lastActiveAt || '-'}</dd></div>
          </dl>

          <AdminNoteBox entityType="member" entityId={selected.id} />
        </section>
      )}
    </div>
  )
}
