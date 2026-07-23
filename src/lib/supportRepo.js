// FANCLUV — 고객 문의 repository (Supabase + Mock).
//
// 쓰기(생성/답변/상태)는 RPC 로만(정책·rate limit·audit·알림은 서버 0080). 조회는 RLS 하 select.
import { supabase, isSupabaseConfigured } from './supabase.js'
import { getCurrentUser } from './auth.js'
import { logger } from './logger.js'

let mockInquiries = []
function mapRow(r) {
  return {
    id: r.id, userId: r.user_id, category: r.category, subject: r.subject, content: r.content,
    status: r.status, adminReply: r.admin_reply, repliedBy: r.replied_by, repliedAt: r.replied_at,
    createdAt: r.created_at, updatedAt: r.updated_at, nickname: r.nickname,
  }
}

// ── 사용자 ──
export async function createInquiry({ category, subject, content }) {
  if (!isSupabaseConfigured) {
    const u = getCurrentUser()
    const row = { id: 'q' + Date.now(), user_id: u?.id, category, subject: subject.trim(), content: content.trim(),
      status: 'pending', admin_reply: null, created_at: new Date().toISOString() }
    mockInquiries = [row, ...mockInquiries]
    return { ok: true, code: 'OK', id: row.id }
  }
  try {
    const { data, error } = await supabase.rpc('create_inquiry', { p_category: category, p_subject: subject, p_content: content })
    if (error) { logger.warn('create_inquiry', error.message); return { ok: false, code: 'NOT_ALLOWED' } }
    return data || { ok: false, code: 'NOT_ALLOWED' }
  } catch (e) { logger.warn('create_inquiry ex', e?.message); return { ok: false, code: 'NOT_ALLOWED' } }
}

export async function listMyInquiries() {
  if (!isSupabaseConfigured) return mockInquiries.map(mapRow)
  try {
    const { data, error } = await supabase.from('support_inquiries')
      .select('id, category, subject, status, created_at, replied_at')
      .order('created_at', { ascending: false }).limit(100)
    if (error) { logger.warn('listMyInquiries', error.message); return [] }
    return (data || []).map(mapRow)
  } catch (e) { logger.warn('listMyInquiries ex', e?.message); return [] }
}

export async function getMyInquiry(id) {
  if (!isSupabaseConfigured) { const r = mockInquiries.find(x => x.id === id); return r ? mapRow(r) : null }
  try {
    const { data, error } = await supabase.from('support_inquiries')
      .select('id, user_id, category, subject, content, status, admin_reply, replied_at, created_at')
      .eq('id', id).maybeSingle()
    if (error || !data) return null            // RLS: 타인 문의는 행 없음 → null(404 처리)
    return mapRow(data)
  } catch { return null }
}

// ── 관리자 ──
export async function adminListInquiries({ status = '', category = '', q = '', page = 1, pageSize = 20 } = {}) {
  if (!isSupabaseConfigured) {
    let items = mockInquiries.slice()
    if (status) items = items.filter(i => i.status === status)
    if (category) items = items.filter(i => i.category === category)
    return { items: items.map(mapRow), total: items.length }
  }
  try {
    const { data, error } = await supabase.rpc('admin_list_inquiries', {
      p_status: status || null, p_category: category || null, p_q: q || null, p_page: page, p_page_size: pageSize,
    })
    if (error || !data?.ok) { logger.warn('admin_list_inquiries', error?.message); return { items: [], total: 0 } }
    return { items: (data.items || []).map(mapRow), total: data.total || 0 }
  } catch (e) { logger.warn('adminListInquiries ex', e?.message); return { items: [], total: 0 } }
}

export async function adminGetInquiry(id) {
  if (!isSupabaseConfigured) { const r = mockInquiries.find(x => x.id === id); return r ? mapRow(r) : null }
  try {
    const { data, error } = await supabase.rpc('admin_get_inquiry', { p_id: id })
    if (error || !data?.ok) return null
    return mapRow(data.inquiry)
  } catch { return null }
}

export async function adminReplyInquiry(id, reply, status = 'resolved') {
  if (!isSupabaseConfigured) {
    mockInquiries = mockInquiries.map(x => x.id === id ? { ...x, admin_reply: reply, status, replied_at: new Date().toISOString() } : x)
    return { ok: true, code: 'OK', status }
  }
  try {
    const { data, error } = await supabase.rpc('admin_reply_inquiry', { p_id: id, p_reply: reply, p_status: status })
    if (error) { logger.warn('admin_reply_inquiry', error.message); return { ok: false, code: 'NOT_ALLOWED' } }
    return data || { ok: false, code: 'NOT_ALLOWED' }
  } catch (e) { logger.warn('admin_reply_inquiry ex', e?.message); return { ok: false, code: 'NOT_ALLOWED' } }
}

export async function adminSetInquiryStatus(id, status) {
  if (!isSupabaseConfigured) {
    mockInquiries = mockInquiries.map(x => x.id === id ? { ...x, status } : x)
    return { ok: true, code: 'OK', status }
  }
  try {
    const { data, error } = await supabase.rpc('admin_set_inquiry_status', { p_id: id, p_status: status })
    if (error) { logger.warn('admin_set_inquiry_status', error.message); return { ok: false, code: 'NOT_ALLOWED' } }
    return data || { ok: false, code: 'NOT_ALLOWED' }
  } catch (e) { logger.warn('admin_set_inquiry_status ex', e?.message); return { ok: false, code: 'NOT_ALLOWED' } }
}
