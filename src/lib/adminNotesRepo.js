// FANCLUV — Admin internal notes (운영자 전용 내부 메모).
//
// 회원 · 팬 의견 · 댓글 · 신고 각 대상에 운영자만 볼 수 있는 메모를 남긴다.
// (예: "반복 신고 사용자", "욕설 경고 완료", "재검토 필요")
// 일반 사용자에게는 절대 노출되지 않는다:
//   - Supabase : admin_notes 테이블 RLS 가 is_admin() 만 허용(0014).
//   - Mock     : 운영자 화면(RequireAdmin) 안에서만 읽는 localStorage.
// 모든 API 는 isAdmin() 사전 검사로 이중 방어한다.
import { supabase, isSupabaseConfigured } from './supabase.js'
import { getCurrentUser, isAdmin } from './auth.js'

const KEY = 'fancluv_admin_notes'

function readMock() {
  try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] }
}
function writeMock(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

function mapRow(r) {
  return { id: r.id, entityType: r.entity_type, entityId: String(r.entity_id), body: r.body, author: r.profiles?.nickname || null, createdAt: r.created_at }
}

// ── 대상별 메모 목록 (최신순) ──
export async function listNotes(entityType, entityId) {
  if (!isAdmin()) return []
  const eid = String(entityId)
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('admin_notes').select('*, profiles:author_id(nickname)')
      .eq('entity_type', entityType).eq('entity_id', eid)
      .order('created_at', { ascending: false })
    if (error) return []
    return (data || []).map(mapRow)
  }
  return readMock()
    .filter(n => n.entityType === entityType && n.entityId === eid)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

// ── 메모 추가 ──
export async function addNote(entityType, entityId, body) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  const text = (body || '').trim()
  if (!text) return { ok: false, error: '메모 내용을 입력해 주세요.' }
  const eid = String(entityId)
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    const { data, error } = await supabase.from('admin_notes').insert({
      entity_type: entityType, entity_id: eid, body: text, author_id: me?.id || null,
    }).select('*, profiles:author_id(nickname)').single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, note: mapRow(data) }
  }
  const me = getCurrentUser()
  const note = { id: 'an' + Date.now(), entityType, entityId: eid, body: text, author: me?.nickname || 'Admin', createdAt: new Date().toISOString() }
  const list = readMock()
  list.unshift(note)
  writeMock(list)
  return { ok: true, note }
}

// ── 메모 삭제 ──
export async function deleteNote(id) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('admin_notes').delete().eq('id', id)
    return { ok: !error }
  }
  writeMock(readMock().filter(n => n.id !== id))
  return { ok: true }
}
