// FANCLUV — Admin Opinions repository (관리자 의견/댓글 관리).
//
// AdminOpinions 페이지의 단일 데이터 소스.
//   Supabase 설정 시  → public.opinions / comments / likes / reports 실데이터.
//   미설정(DEV Mock) → adminData.js 의 MOCK_*.
// 라이브(Supabase env 존재)에서는 Mock 을 절대 사용하지 않는다.
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { logger } from '../logger.js'
import { MOCK_OPINIONS, MOCK_COMMENTS } from '../../admin/adminData.js'

// 현재 사용 중인 Repository 를 콘솔에 1회 출력(#8 — Mock/Supabase 확인용).
export const ADMIN_OPINIONS_REPO = isSupabaseConfigured ? 'supabase' : 'mock'
if (!globalThis.__fancluvAdminOpinionsRepoLogged) {
  globalThis.__fancluvAdminOpinionsRepoLogged = true
  logger.info(
    `[adminOpinionsRepo] Repository = ${isSupabaseConfigured ? 'Supabase (public.opinions)' : 'Mock (adminData.js)'}`,
  )
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// opinion_id/target_id 별 개수 집계 헬퍼.
function tally(rows, key) {
  const m = {}
  for (const r of rows || []) m[r[key]] = (m[r[key]] || 0) + 1
  return m
}

// ── Mock 가변 상태 (DEV 전용) ── 정적 MOCK_* 를 복제해 두고 숨김/삭제를 반영한다.
let mockOps = null
let mockCms = null
function ensureMock() {
  if (!mockOps) mockOps = MOCK_OPINIONS.map(o => ({ ...o }))
  if (!mockCms) mockCms = MOCK_COMMENTS.map(c => ({ ...c }))
}

// ════════════════════════════════════════════════════════════════════════
//  의견 목록 (전 구단·전 상태 — 관리자는 hidden 도 본다)
// ════════════════════════════════════════════════════════════════════════
export async function adminListOpinions() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('opinions')
      .select('id, author_id, team_id, title, body, status, created_at')
      .order('created_at', { ascending: false })
    if (error) { logger.error('관리자 의견 목록 조회 실패(opinions)', { error }); return [] }
    const rows = data || []
    if (rows.length === 0) return []
    const ids = rows.map(o => o.id)
    const authorIds = [...new Set(rows.map(o => o.author_id).filter(Boolean))]
    // 공감/댓글/신고 수 + 작성자 닉네임을 병렬 조회 후 조립.
    const [likesRes, commentsRes, reportsRes, profsRes] = await Promise.all([
      supabase.from('likes').select('opinion_id').in('opinion_id', ids),
      supabase.from('comments').select('opinion_id').in('opinion_id', ids),
      supabase.from('reports').select('target_id').eq('target_type', 'opinion').in('target_id', ids),
      authorIds.length
        ? supabase.from('public_profiles').select('id, nickname').in('id', authorIds)
        : Promise.resolve({ data: [] }),
    ])
    const likeCount = tally(likesRes.data, 'opinion_id')
    const commentCount = tally(commentsRes.data, 'opinion_id')
    const reportCount = tally(reportsRes.data, 'target_id')
    const nameById = {}
    for (const p of profsRes.data || []) nameById[p.id] = p.nickname
    return rows.map(o => ({
      id: o.id,
      author: nameById[o.author_id] || '팬',
      team: o.team_id,
      date: fmtDate(o.created_at),
      title: o.title || '',
      content: o.body || '',
      likes: likeCount[o.id] || 0,
      comments: commentCount[o.id] || 0,
      reports: reportCount[o.id] || 0,
      status: o.status || 'visible',
    }))
  }
  // Mock(DEV): 가변 복제본 기준. 댓글 수는 mock 댓글에서 집계, 신고수는 데모라 0.
  ensureMock()
  return mockOps.map(o => ({
    ...o, title: o.title || '', reports: o.reports || 0,
    comments: mockCms.filter(c => c.opinionId === o.id).length,
  }))
}

// ════════════════════════════════════════════════════════════════════════
//  선택 의견의 댓글 (전 상태 — 관리자용)
// ════════════════════════════════════════════════════════════════════════
export async function adminListComments(opinionId) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('comments').select('id, author_id, content, status, created_at')
      .eq('opinion_id', opinionId)
      .order('created_at', { ascending: true })
    if (error) { logger.error('관리자 댓글 조회 실패(comments)', { error, context: { opinionId } }); return [] }
    const rows = data || []
    const authorIds = [...new Set(rows.map(c => c.author_id).filter(Boolean))]
    const { data: profs } = authorIds.length
      ? await supabase.from('public_profiles').select('id, nickname').in('id', authorIds)
      : { data: [] }
    const nameById = {}
    for (const p of profs || []) nameById[p.id] = p.nickname
    return rows.map(c => ({
      id: c.id, opinionId, author: nameById[c.author_id] || '팬',
      date: fmtDate(c.created_at), content: c.content, status: c.status || 'visible',
    }))
  }
  ensureMock()
  return mockCms.filter(c => c.opinionId === opinionId).map(c => ({ ...c }))
}

// ════════════════════════════════════════════════════════════════════════
//  뮤테이션 (관리자 RLS: is_admin() — 0030)
// ════════════════════════════════════════════════════════════════════════
export async function setOpinionHidden(id, hidden) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('opinions')
      .update({ status: hidden ? 'hidden' : 'visible' }).eq('id', id)
    if (error) { logger.error('의견 상태 변경 실패', { error, context: { id } }); return { ok: false, error: error.message } }
    return { ok: true }
  }
  ensureMock()
  const o = mockOps.find(x => x.id === id)
  if (o) o.status = hidden ? 'hidden' : 'visible'
  return { ok: true }
}

export async function deleteOpinion(id) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('opinions').delete().eq('id', id)
    if (error) { logger.error('의견 삭제 실패', { error, context: { id } }); return { ok: false, error: error.message } }
    return { ok: true }
  }
  ensureMock()
  mockOps = mockOps.filter(x => x.id !== id)
  mockCms = mockCms.filter(c => c.opinionId !== id)
  return { ok: true }
}

export async function setCommentHidden(id, hidden) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('comments')
      .update({ status: hidden ? 'hidden' : 'visible' }).eq('id', id)
    if (error) { logger.error('댓글 상태 변경 실패', { error, context: { id } }); return { ok: false, error: error.message } }
    return { ok: true }
  }
  ensureMock()
  const c = mockCms.find(x => x.id === id)
  if (c) c.status = hidden ? 'hidden' : 'visible'
  return { ok: true }
}

export async function deleteCommentAdmin(id) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('comments').delete().eq('id', id)
    if (error) { logger.error('댓글 삭제 실패(admin)', { error, context: { id } }); return { ok: false, error: error.message } }
    return { ok: true }
  }
  ensureMock()
  mockCms = mockCms.filter(x => x.id !== id)
  return { ok: true }
}
