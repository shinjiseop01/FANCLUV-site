// FANCLUV — 구단 액션(조치) 관리 repository (Supabase-우선 + Mock 폴백).
//
// 운영자가 구단의 실제 조치를 등록하고, 생성 시점 KPI(before)를 자동 스냅샷한다.
// 완료 후 after KPI 를 기록하면 Club Action Tracker 에서 전후 비교가 가능하다.
//   - Supabase: club_actions 테이블(0024, 관리자 RLS).
//   - Mock: localStorage(`fancluv_club_actions`).
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { isAdmin, getCurrentUser } from '../auth.js'
import { getKpis } from '../kpi/kpiEngine.js'
import { getLatestInsight } from '../ai/analyzeFanInsights.js'

// 카테고리(요구사항 3) — 라벨은 locale admin.action.cat.*
export const ACTION_CATEGORIES = ['match', 'ticket', 'md', 'store', 'stadium', 'event', 'marketing', 'fanservice', 'squad', 'etc']
// 상태(요구사항 4) — 라벨은 locale admin.action.st.*
export const ACTION_STATUSES = ['planned', 'in_progress', 'done', 'closed']

const KEY = 'fancluv_club_actions'
function readMock() { try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] } }
function writeMock(list) { try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* ignore */ } }

// KPI 엔진 결과 → 액션에 저장할 compact 스냅샷.
function compactKpi(k) {
  if (!k) return null
  return {
    week: k.week,
    satisfaction: k.satisfaction,
    positive: k.sentiment?.positive, neutral: k.sentiment?.neutral, negative: k.sentiment?.negative,
    nps: k.nps, complaintIndex: k.complaintIndex, engagement: k.engagement,
    participationRate: k.participationRate, recommendation: k.recommendation,
    capturedAt: new Date().toISOString(),
  }
}

function mapRow(r) {
  return {
    id: r.id, clubId: r.club_id, title: r.title, description: r.description || '',
    category: r.category || 'etc', status: r.status || 'planned', actionDate: r.action_date || '',
    beforeKpi: r.before_kpi || null, afterKpi: r.after_kpi || null,
    aiInsightId: r.ai_insight_id || null, reportId: r.report_id || null, week: r.week || null,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

// ── 목록 + 검색(구단/상태/카테고리/기간) ──
export async function adminListActions(filters = {}) {
  if (!isAdmin()) return []
  const { clubId, status, category, from, to } = filters
  if (isSupabaseConfigured) {
    let q = supabase.from('club_actions').select('*')
    if (clubId && clubId !== 'all') q = q.eq('club_id', clubId)
    if (status && status !== 'all') q = q.eq('status', status)
    if (category && category !== 'all') q = q.eq('category', category)
    if (from) q = q.gte('action_date', from)
    if (to) q = q.lte('action_date', to)
    const { data, error } = await q.order('action_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
    if (error) return []
    return (data || []).map(mapRow)
  }
  let list = readMock()
  if (clubId && clubId !== 'all') list = list.filter(a => a.clubId === clubId)
  if (status && status !== 'all') list = list.filter(a => a.status === status)
  if (category && category !== 'all') list = list.filter(a => a.category === category)
  if (from) list = list.filter(a => a.actionDate && a.actionDate >= from)
  if (to) list = list.filter(a => a.actionDate && a.actionDate <= to)
  return list.sort((a, b) => String(b.actionDate || b.createdAt).localeCompare(String(a.actionDate || a.createdAt)))
}

// ── 생성 (before KPI 자동 스냅샷) ──
export async function createAction(input) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  const clubId = input.clubId
  const title = (input.title || '').trim()
  if (!clubId || clubId === 'all') return { ok: false, code: 'no_club' }
  if (!title) return { ok: false, code: 'no_title' }

  // 생성 시점 KPI 스냅샷 + 관련 AI 인사이트 자동 연결.
  const kpi = await getKpis(clubId).catch(() => null)
  const before = compactKpi(kpi)
  let aiInsightId = input.aiInsightId || null
  if (input.linkLatestInsight && !aiInsightId) {
    const ins = await getLatestInsight(clubId).catch(() => null)
    aiInsightId = ins?.id || (ins ? `${clubId}:${ins.created_at || ins.period || ''}` : null)
  }

  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    const { data, error } = await supabase.from('club_actions').insert({
      club_id: clubId, title, description: input.description || '', category: input.category || 'etc',
      status: input.status || 'planned', action_date: input.actionDate || null,
      before_kpi: before, week: before?.week || null,
      ai_insight_id: aiInsightId, report_id: input.reportId || null, created_by: me?.id || null,
    }).select().single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, action: mapRow(data) }
  }
  const now = new Date().toISOString()
  const action = {
    id: 'ca' + Date.now(), clubId, title, description: input.description || '',
    category: input.category || 'etc', status: input.status || 'planned', actionDate: input.actionDate || '',
    beforeKpi: before, afterKpi: null, aiInsightId, reportId: input.reportId || null,
    week: before?.week || null, createdAt: now, updatedAt: now,
  }
  const list = readMock(); list.unshift(action); writeMock(list)
  return { ok: true, action }
}

// ── 수정 ──
export async function updateAction(id, patch) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  const now = new Date().toISOString()
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('club_actions').update({
      title: patch.title, description: patch.description, category: patch.category,
      status: patch.status, action_date: patch.actionDate || null,
      ai_insight_id: patch.aiInsightId || null, report_id: patch.reportId || null, updated_at: now,
    }).eq('id', id).select().single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, action: mapRow(data) }
  }
  let updated = null
  writeMock(readMock().map(a => {
    if (a.id !== id) return a
    updated = { ...a, ...patch, updatedAt: now }
    return updated
  }))
  return { ok: true, action: updated }
}

// ── 상태 변경 ──
export async function setStatus(id, status) {
  return updateAction(id, { status })
}

// ── 완료 후 KPI 기록(after 스냅샷) — Club Action Tracker 전후 비교 ──
export async function captureAfterKpi(id, clubId) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  const kpi = await getKpis(clubId).catch(() => null)
  const after = compactKpi(kpi)
  const now = new Date().toISOString()
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('club_actions').update({ after_kpi: after, updated_at: now }).eq('id', id).select().single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, action: mapRow(data) }
  }
  let updated = null
  writeMock(readMock().map(a => {
    if (a.id !== id) return a
    updated = { ...a, afterKpi: after, updatedAt: now }
    return updated
  }))
  return { ok: true, action: updated }
}

// ── 삭제 ──
export async function deleteAction(id) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('club_actions').delete().eq('id', id)
    return { ok: !error }
  }
  writeMock(readMock().filter(a => a.id !== id))
  return { ok: true }
}
