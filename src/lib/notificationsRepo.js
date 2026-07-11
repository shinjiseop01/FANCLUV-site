// FANCLUV — Notifications repository.
//
// NotificationBell 이 사용하는 단일 데이터 소스.
// Supabase 설정 시 notifications 테이블(생성은 DB 트리거가 담당 — 0006 참조),
// 아니면 Mock(localStorage). 클라이언트는 조회 / 읽음 처리만 한다.
import { supabase, isSupabaseConfigured } from './supabase.js'
import { getCurrentUser, isAdmin } from './auth.js'

const KEY = 'fancluv_notifications'

// 운영자용(관리자 전용) 알림 여부 — 이 audience 는 관리자에게만 노출한다.
//   일반 회원(fan)·구단(club) 계정에는 절대 표시하지 않는다.
function canSeeMock(n) {
  return n.audience !== 'admin' || isAdmin()
}

function readMock() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null } catch { return null }
}
function writeMock(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

// Mock 초기 시드 (알림 기능 데모용). 한 번만 생성.
// 클릭 시 이동을 보여주기 위해 현재 사용자의 응원 구단 기준 URL 을 넣는다.
function seedMock() {
  const now = Date.now()
  const team = getCurrentUser()?.selectedTeam || null
  const club = p => (team ? `/club/${team}${p}` : null)
  return [
    { id: 'seed4', type: 'notice', title: '관리자 공지', body: 'FANCLUV 서비스 점검 안내: 7월 5일 02:00~04:00 사이 일시적으로 접속이 제한될 수 있습니다.', url: null, is_read: false, created_at: new Date(now - 1 * 3600e3).toISOString() },
    { id: 'seed3', type: 'news', title: '새 팀 뉴스', body: '구단, 2026 시즌 하반기 멤버십 혜택 개편 발표', url: club('/news/1'), is_read: false, created_at: new Date(now - 2 * 3600e3).toISOString() },
    { id: 'seed2', type: 'survey', title: '새 설문', body: '2026 시즌 홈 경기장 시설 만족도 조사', url: club('/survey/home'), is_read: false, created_at: new Date(now - 5 * 3600e3).toISOString() },
    { id: 'seed1', type: 'comment', title: '새 댓글', body: '내 의견에 새 댓글이 달렸습니다.', url: club('/opinions/1'), is_read: true, created_at: new Date(now - 26 * 3600e3).toISOString() },
  ]
}
function getMockList() {
  let list = readMock()
  if (list === null) { list = seedMock(); writeMock(list) }
  return list
}

// Mock 모드에서 이벤트 발생 시 알림 추가 (다른 repo 들이 호출).
// Supabase 모드에서는 DB 트리거가 생성하므로 아무것도 하지 않는다.
export function pushMockNotification({ type, title, body, url = null, isImportant = false, audience = 'user' }) {
  if (isSupabaseConfigured) return
  const list = getMockList()
  list.unshift({ id: 'n' + Date.now(), type, title, body, url, is_read: false, is_important: isImportant, audience, created_at: new Date().toISOString() })
  writeMock(list)
}

function mapRow(r) {
  return { id: r.id, type: r.type, title: r.title, body: r.body, url: r.url, isRead: !!r.is_read, isImportant: !!r.is_important, createdAt: r.created_at }
}

// 관리자 공지 등록(createNotice)은 noticesRepo.js 로 이동했다(공지 CRUD/노출 일원화).

// ── 목록 ── opts: { limit, type, unreadOnly }
//   기본 30개(벨/프리뷰). 알림센터는 더 큰 limit 로 불러 클라이언트에서 필터/페이지네이션.
export async function listNotifications(opts = {}) {
  const { limit = 30, type = null, unreadOnly = false } = opts
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    if (!me) return []
    let q = supabase.from('notifications').select('*').eq('user_id', me.id)
    if (type) q = q.eq('type', type)
    if (unreadOnly) q = q.eq('is_read', false)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(limit)
    if (error) return []
    return (data || []).map(mapRow)
  }
  // Mock: 운영자 전용(audience:'admin') 알림은 관리자에게만 노출.
  let list = getMockList().filter(canSeeMock)
  if (type) list = list.filter(n => n.type === type)
  if (unreadOnly) list = list.filter(n => !n.is_read)
  return list.slice(0, limit).map(mapRow)
}

// ── 안읽음 수 ──
export async function unreadCount() {
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    if (!me) return 0
    const { count } = await supabase
      .from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', me.id).eq('is_read', false)
    return count || 0
  }
  return getMockList().filter(n => !n.is_read && canSeeMock(n)).length
}

// ── 읽음 처리 ──
export async function markRead(id) {
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    await supabase.from('notifications').update({ is_read: true }).eq('id', id).eq('user_id', me?.id)
    return { ok: true }
  }
  writeMock(getMockList().map(n => (n.id === id ? { ...n, is_read: true } : n)))
  return { ok: true }
}

// ── 전체 읽음 처리 ──
export async function markAllRead() {
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    if (!me) return { ok: false }
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', me.id).eq('is_read', false)
    return { ok: true }
  }
  // 본인에게 보이는 알림만 읽음 처리(안 보이는 운영자 알림은 건드리지 않음).
  writeMock(getMockList().map(n => (canSeeMock(n) ? { ...n, is_read: true } : n)))
  return { ok: true }
}

// ── 삭제(단건) ──
export async function deleteNotification(id) {
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    if (!me) return { ok: false }
    const { error } = await supabase.from('notifications').delete().eq('id', id).eq('user_id', me.id)
    return { ok: !error }
  }
  writeMock(getMockList().filter(n => n.id !== id))
  return { ok: true }
}

// ── 전체 삭제(본인에게 보이는 알림) ──
export async function deleteAll() {
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    if (!me) return { ok: false }
    const { error } = await supabase.from('notifications').delete().eq('user_id', me.id)
    return { ok: !error }
  }
  writeMock(getMockList().filter(n => !canSeeMock(n)))
  return { ok: true }
}

// ── 운영 알림 생성(관리자 전원) ── 직접 insert 금지: notify_admins RPC 로 일원화.
//   운영 실패(Edge/OpenAI/뉴스/경기/시스템)에서 호출한다.
export async function notifyAdmins({ type = 'notice', title, body, url = null }) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('notify_admins', {
      p_type: type, p_title: title, p_body: body, p_url: url,
    })
    if (error) return { ok: false, error }
    return { ok: true, count: data || 0 }
  }
  pushMockNotification({ type, title, body, isImportant: true, audience: 'admin' })
  return { ok: true }
}

// ── Realtime 구독 ── 내 알림 변화(추가/읽음/삭제) 시 onChange 호출.
//   NotificationBell / 알림센터가 새로고침 없이 갱신하도록.
export function subscribeNotifications(onChange) {
  if (!isSupabaseConfigured) return () => {}
  const me = getCurrentUser()
  if (!me) return () => {}
  const channel = supabase
    .channel(`notif:${me.id}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${me.id}` },
      () => onChange())
    .subscribe()
  return () => { try { supabase.removeChannel(channel) } catch { /* noop */ } }
}
