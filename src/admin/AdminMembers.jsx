import { useState, useMemo, useEffect } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'
import { getTeam, teamName } from '../teams.jsx'
import Avatar from '../components/Avatar.jsx'
import EmptyState from '../components/EmptyState.jsx'
import Pagination from '../components/Pagination.jsx'
import { usePagination } from '../lib/usePagination.js'
import { SkeletonList } from '../components/Skeleton.jsx'
import Icon from '../components/Icon.jsx'
import AdminNoteBox from './AdminNoteBox.jsx'
import { adminListMembers, setMemberActive, adminDeleteMember } from '../lib/admin/membersRepo.js'
import { exportCsv } from '../lib/admin/csv.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useToast } from '../contexts/ToastContext.jsx'
import { canDeleteRole, isProtectedTargetRole, deleteErrorKey } from '../lib/admin/deletePolicy.js'
import MemberDeleteModal from './MemberDeleteModal.jsx'

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
  const { user: me } = useAuth()
  const toast = useToast()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)   // 회원 상세 패널 (운영자 전용)
  const [deleteTarget, setDeleteTarget] = useState(null) // 삭제 확인 모달 대상
  const [deleting, setDeleting] = useState(false)

  // 앱 role → DB role (팬은 app 'fan' == db 'user'). 관리자 콘솔 사용자는 admin/superadmin/staff.
  const actorRole = me?.role === 'fan' ? 'user' : (me?.role || 'user')

  // 실 데이터(Supabase RPC admin_list_members) 또는 Mock 폴백으로 회원 목록 로드.
  async function refetch() {
    const list = await adminListMembers()
    setMembers(list); setLoading(false)
  }
  useEffect(() => {
    let active = true
    adminListMembers().then(list => { if (active) { setMembers(list); setLoading(false) } })
    return () => { active = false }
  }, [])

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
  const { paged, page, total, setPage } = usePagination(visible, 20, [query, filter])

  function toggleActive(id) {
    const cur = members.find(m => m.id === id)
    if (!cur) return
    const nextActive = cur.status !== 'active'
    setMembers(list => list.map(m => (m.id === id ? { ...m, status: nextActive ? 'active' : 'inactive' } : m)))
    // Supabase 모드면 profiles.deactivated_at 반영(관리자 RPC). Mock 은 화면 상태만.
    setMemberActive(id, nextActive)
  }

  // 회원 목록 role 은 소스별로 다를 수 있다(Mock=앱 'fan', Supabase=DB 'user'). DB role 로 정규화.
  const dbRole = r => (r === 'fan' ? 'user' : r)

  // 삭제 가능 여부(권한 매트릭스 + 자기 자신 + superadmin 보호). 서버가 다시 권위 검증한다.
  function deletableReason(m) {
    if (m.id === me?.id) return 'self'
    if (isProtectedTargetRole(dbRole(m.role))) return 'protected'
    if (!canDeleteRole(actorRole, dbRole(m.role))) return 'no_permission'
    return null // 삭제 가능
  }

  // 실제 삭제: 서버(Edge Function) 요청 → 성공 시에만 서버 목록 refetch(로컬 state 삭제 금지).
  async function confirmDelete(reason) {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    const res = await adminDeleteMember(deleteTarget.id, { reason, mode: 'hard_delete' })
    setDeleting(false)
    if (res.ok) {
      // 삭제 성공 또는 이미 삭제됨 → 서버 재조회(로컬 state 임의 제거 금지).
      if (selectedId === deleteTarget.id) setSelectedId(null)
      setDeleteTarget(null)
      await refetch() // 삭제 대상 즉시 미노출, total 감소(pagination 자동 clamp)
      if (res.code === 'already_deleted') toast.show(t('admin.del.errAlready'), { type: 'info' })
      else toast.success(t('admin.del.success'))
    } else if (res.code === 'already_in_progress') {
      // 다른 요청이 처리 중 — 목록에서 제거하지 않고 최신 상태만 재조회.
      setDeleteTarget(null)
      await refetch()
      toast.warn(t('admin.del.errInProgress'))
    } else {
      // 실패 — 목록 유지, 모달 유지(재시도 가능).
      toast.error(t(deleteErrorKey(res.code)))
    }
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

      {loading ? (
        <SkeletonList count={6} lines={1} />
      ) : visible.length === 0 ? (
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
              {paged.map(m => {
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
                        {(() => {
                          const blocked = deletableReason(m)
                          return (
                            <button
                              className="adm-btn-sm danger"
                              disabled={!!blocked}
                              title={blocked ? t(`admin.del.blocked.${blocked}`) : ''}
                              onClick={() => !blocked && setDeleteTarget(m)}
                            >
                              {t('admin.delete')}
                            </button>
                          )
                        })()}
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

      <MemberDeleteModal
        open={!!deleteTarget}
        member={deleteTarget}
        submitting={deleting}
        onClose={() => { if (!deleting) setDeleteTarget(null) }}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
