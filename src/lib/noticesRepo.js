// FANCLUV — Notices repository (관리자 공지사항).
//
// 관리자 공지 관리(AdminNotices)와 사용자 노출(홈 배너 · 알림센터)의 단일 데이터 소스.
// Supabase 설정 시 notices 테이블(+ insert 트리거가 알림 broadcast), 아니면 Mock(localStorage).
//
// 공지 필드: 제목 / 내용 / 중요 공지 여부 / 노출 시작일 / 노출 종료일 / 상단 고정 / 숨김.
// 사용자에게는 숨김이 아니고 노출 기간에 해당하는 공지만 보이며, 고정·중요 공지가 상단에 온다.
import { supabase, isSupabaseConfigured } from './supabase.js'
import { getCurrentUser, isAdmin } from './auth.js'
import { pushMockNotification } from './notificationsRepo.js'

const KEY = 'fancluv_notices'

function readMock() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null } catch { return null }
}
function writeMock(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 데모 시드 (한 번만 생성)
function seedMock() {
  const now = Date.now()
  return [
    { id: 'nt1', title: '서비스 점검 안내', body: '7월 10일 02:00~04:00 사이 서비스 점검이 예정되어 있습니다. 이용에 참고 부탁드립니다.', teamId: null, isImportant: true, pinned: true, hidden: false, startAt: null, endAt: null, createdAt: new Date(now - 3 * 3600e3).toISOString() },
    { id: 'nt2', title: '2026 시즌 커뮤니티 이용 수칙 안내', body: '건전한 응원 문화를 위해 커뮤니티 이용 수칙을 업데이트했습니다.', teamId: null, isImportant: false, pinned: false, hidden: false, startAt: null, endAt: null, createdAt: new Date(now - 30 * 3600e3).toISOString() },
  ]
}
function getMockList() {
  let list = readMock()
  if (list === null) { list = seedMock(); writeMock(list) }
  return list
}

function mapRow(r) {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    teamId: r.team_id ?? null,
    isImportant: !!r.is_important,
    pinned: !!r.pinned,
    hidden: !!r.hidden,
    startAt: r.start_at ?? null,
    endAt: r.end_at ?? null,
    createdAt: r.created_at,
  }
}

// 노출 기간 판정: 시작일 없거나 오늘 이후 시작 안 지났으면 통과, 종료일 없거나 오늘까지면 통과.
function withinPeriod(n, today) {
  if (n.startAt && today < n.startAt) return false
  if (n.endAt && today > n.endAt) return false
  return true
}
// 사용자 노출 정렬: 고정 → 중요 → 최신
function displaySort(a, b) {
  if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1
  if (!!b.isImportant !== !!a.isImportant) return b.isImportant ? 1 : -1
  return String(b.createdAt).localeCompare(String(a.createdAt))
}

// ── 관리자: 전체 공지 목록 (숨김 포함) ──
export async function adminListNotices() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('notices').select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) return []
    return (data || []).map(mapRow)
  }
  // Mock 저장 객체는 이미 앱 형태(camelCase)라 mapRow 를 거치지 않는다.
  return getMockList()
    .slice()
    .sort((a, b) => ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || String(b.createdAt).localeCompare(String(a.createdAt)))
}

// ── 관리자: 공지 작성 ── (등록 시 대상 팬에게 'notice' 알림 생성 — 숨김이면 미생성)
export async function createNotice({ title, body, teamId = null, isImportant = false, startAt = null, endAt = null, hidden = false }) {
  const tt = (title || '').trim()
  const bb = (body || '').trim()
  if (!tt || !bb) return { ok: false, error: '제목과 내용을 입력해 주세요.' }
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    const { data, error } = await supabase.from('notices').insert({
      title: tt, body: bb, team_id: teamId || null, created_by: me?.id || null,
      is_important: isImportant, start_at: startAt || null, end_at: endAt || null, hidden,
    }).select().single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, notice: mapRow(data) }
  }
  // Mock: 목록에 저장 + (숨김이 아니면) 알림 추가
  const list = getMockList()
  const notice = {
    id: 'nt' + Date.now(), title: tt, body: bb, teamId: teamId || null,
    isImportant, pinned: false, hidden, startAt: startAt || null, endAt: endAt || null,
    createdAt: new Date().toISOString(),
  }
  list.unshift(notice)
  writeMock(list)
  if (!hidden) pushMockNotification({ type: 'notice', title: tt, body: bb, isImportant })
  return { ok: true, notice }
}

// ── 관리자: 공지 수정 ──
export async function updateNotice(id, { title, body, teamId, isImportant, startAt, endAt }) {
  const tt = (title || '').trim()
  const bb = (body || '').trim()
  if (!tt || !bb) return { ok: false, error: '제목과 내용을 입력해 주세요.' }
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('notices').update({
      title: tt, body: bb, team_id: teamId || null,
      is_important: isImportant, start_at: startAt || null, end_at: endAt || null, updated_at: new Date().toISOString(),
    }).eq('id', id).select().single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, notice: mapRow(data) }
  }
  let updated = null
  writeMock(getMockList().map(n => {
    if (n.id !== id) return n
    updated = { ...n, title: tt, body: bb, teamId: teamId || null, isImportant, startAt: startAt || null, endAt: endAt || null }
    return updated
  }))
  return { ok: true, notice: updated }
}

// ── 관리자: 숨김 토글 / 고정 토글 / 삭제 ──
export async function setNoticeHidden(id, hidden) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('notices').update({ hidden }).eq('id', id)
    return { ok: !error }
  }
  writeMock(getMockList().map(n => (n.id === id ? { ...n, hidden } : n)))
  return { ok: true }
}
export async function setNoticePinned(id, pinned) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('notices').update({ pinned }).eq('id', id)
    return { ok: !error }
  }
  writeMock(getMockList().map(n => (n.id === id ? { ...n, pinned } : n)))
  return { ok: true }
}
export async function deleteNotice(id) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('notices').delete().eq('id', id)
    return { ok: !error }
  }
  writeMock(getMockList().filter(n => n.id !== id))
  return { ok: true }
}

// ── 사용자: 노출용 활성 공지 (홈 배너) ──
// 숨김 제외 + 노출 기간 내 + (전체 또는 내 구단 대상). 고정/중요 공지가 상단.
export async function listActiveNotices(teamId = null) {
  const today = todayStr()
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('notices').select('*').eq('hidden', false)
      .order('pinned', { ascending: false })
      .order('is_important', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) return []
    return (data || []).map(mapRow)
      .filter(n => (!n.teamId || n.teamId === teamId) && withinPeriod(n, today))
  }
  // Mock 저장 객체는 이미 앱 형태(camelCase).
  return getMockList()
    .filter(n => !n.hidden && (!n.teamId || n.teamId === teamId) && withinPeriod(n, today))
    .sort(displaySort)
}

// 관리자 전용 접근 가드용 헬퍼 (UI 방어)
export function canManageNotices() { return isAdmin() }
