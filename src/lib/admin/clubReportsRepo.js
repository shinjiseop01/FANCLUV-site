// FANCLUV — 구단 전달용 리포트 관리 repository.
//
// 운영자가 AI 인사이트를 스냅샷해 리포트 초안을 만들고, 검토·수정 후 승인/전달하는
// 워크플로우의 단일 데이터 소스. Supabase(club_reports/report_deliveries) 또는 Mock.
//
// 개인정보 보호(요구사항 7): 리포트 content 에는 집계/요약 필드만 저장한다.
//   summary · sentiment · keywords · categories · satisfaction · suggestions · kpi ·
//   operatorComment · finalSummary — 이메일/닉네임/원본 의견/댓글/신고는 저장하지 않는다.
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { getCurrentUser, isAdmin, isClub, getClubId } from '../auth.js'
import { buildReportModel } from '../ai/report/reportModel.js'

export const REPORT_STATUSES = ['draft', 'review', 'approved', 'delivered']

const KEY = 'fancluv_club_reports'
const DKEY = 'fancluv_report_deliveries'

function readMock(key) { try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] } }
function writeMock(key, list) { try { localStorage.setItem(key, JSON.stringify(list)) } catch { /* ignore */ } }

function mapRow(r) {
  return {
    id: r.id,
    teamId: r.team_id,
    title: r.title,
    periodType: r.period_type,
    periodLabel: r.period_label,
    status: r.status,
    content: r.content || {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deliveredAt: r.delivered_at || null,
    deliveredBy: r.delivered_by || null,
    deliveryMethod: r.delivery_method || null,
    deliveryMemo: r.delivery_memo || '',
  }
}

// 전달 방식 (이메일/링크는 구조만 — 실제 전송 미구현)
export const DELIVERY_METHODS = ['pdf', 'email', 'link']

// AI 인사이트 → 리포트 content 스냅샷 (집계 필드만).
function contentFromModel(model) {
  return {
    summary: model.summary || '',
    sentiment: { ...model.sentiment },
    keywords: (model.keywords || []).map(k => ({ tag: k.tag, count: k.count })),
    categories: (model.categories || []).map(c => ({ name: c.name, note: c.note })),
    satisfaction: model.satisfaction || 0,
    kpiMetrics: model.kpiMetrics || null,
    suggestions: (model.suggestions || []).map(s => ({ rank: s.rank, title: s.title, desc: s.desc })),
    kpi: { ...model.kpi },
    operatorComment: '',
    finalSummary: model.summary || '', // 초안 시작점 — 운영자가 검토·수정
  }
}

// ── 목록 ──
export async function adminListReports() {
  if (!isAdmin()) return []
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('club_reports').select('*').order('created_at', { ascending: false })
    if (error) return []
    return (data || []).map(mapRow)
  }
  return readMock(KEY).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

// ── 구단(고객) Report Center: 자기 구단에 전달(delivered)된 리포트만 ──
// 원본 팬 데이터 없음(집계/요약 content 만). 관리자 또는 해당 구단 계정만 접근.
export async function listDeliveredReports(clubId) {
  const allowed = isAdmin() || (isClub() && getClubId() === clubId)
  if (!clubId || !allowed) return []
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('club_reports').select('*')
      .eq('team_id', clubId).eq('status', 'delivered').order('delivered_at', { ascending: false })
    if (error) return []
    return (data || []).map(mapRow)
  }
  return readMock(KEY).filter(r => r.teamId === clubId && r.status === 'delivered')
    .sort((a, b) => String(b.deliveredAt || b.createdAt).localeCompare(String(a.deliveredAt || a.createdAt)))
}

// ── 생성 (AI 인사이트 초안) ──
export async function createReport({ teamId, periodType = 'monthly', title }) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  const tt = (title || '').trim()
  if (!teamId || teamId === 'all') return { ok: false, code: 'no_team' }
  if (!tt) return { ok: false, code: 'no_title' }

  const model = await buildReportModel({ clubId: teamId, periodType })
  if (!model.ok) return { ok: false, code: 'no_insight' }
  const content = contentFromModel(model)

  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    const { data, error } = await supabase.from('club_reports').insert({
      team_id: teamId, title: tt, period_type: periodType, period_label: model.periodLabel,
      status: 'draft', content, created_by: me?.id || null,
    }).select().single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, report: mapRow(data) }
  }
  const now = new Date().toISOString()
  const report = {
    id: 'rp' + Date.now(), teamId, title: tt, periodType, periodLabel: model.periodLabel,
    status: 'draft', content, createdAt: now, updatedAt: now, deliveredAt: null, deliveredBy: null,
  }
  const list = readMock(KEY); list.unshift(report); writeMock(KEY, list)
  return { ok: true, report }
}

// ── 상세 ──
export async function getReport(id) {
  if (!isAdmin()) return null
  if (isSupabaseConfigured) {
    const { data } = await supabase.from('club_reports').select('*').eq('id', id).maybeSingle()
    return data ? mapRow(data) : null
  }
  return readMock(KEY).find(r => r.id === id) || null
}

// ── 본문/제목 수정 ──
export async function updateReport(id, { title, content }) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  const patch = { updated_at: new Date().toISOString() }
  if (title != null) patch.title = title
  if (content != null) patch.content = content
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('club_reports').update(patch).eq('id', id).select().single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, report: mapRow(data) }
  }
  let updated = null
  writeMock(KEY, readMock(KEY).map(r => {
    if (r.id !== id) return r
    updated = { ...r, ...(title != null ? { title } : {}), ...(content != null ? { content } : {}), updatedAt: patch.updated_at }
    return updated
  }))
  return { ok: true, report: updated }
}

// ── 상태 변경 (초안/검토중/승인됨). 전달(delivered)은 deliverReport 로만 처리. ──
export async function setStatus(id, status) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  if (status === 'delivered') return { ok: false, error: 'use_deliver' }
  const now = new Date().toISOString()
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('club_reports').update({ status, updated_at: now }).eq('id', id).select().single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, report: mapRow(data) }
  }
  let updated = null
  writeMock(KEY, readMock(KEY).map(r => {
    if (r.id !== id) return r
    updated = { ...r, status, updatedAt: now }
    return updated
  }))
  return { ok: true, report: updated }
}

// ── 구단 전달 (승인된 리포트만). 상태 → 전달 완료 + 전달 방식/메모 저장 + 전달 이력 기록 ──
// method: 'pdf' | 'email' | 'link' (이메일/링크는 구조만). memo: 운영자 전달 메모(PDF 포함 가능).
export async function deliverReport(id, { method = 'pdf', memo = '' } = {}) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  const me = getCurrentUser()
  const operator = me?.nickname || 'Admin'
  const now = new Date().toISOString()

  if (isSupabaseConfigured) {
    const cur = await getReport(id)
    if (!cur) return { ok: false, error: 'not_found' }
    if (cur.status !== 'approved') return { ok: false, code: 'not_approved' }
    const { data, error } = await supabase.from('club_reports').update({
      status: 'delivered', updated_at: now, delivered_at: now, delivered_by: operator,
      delivery_method: method, delivery_memo: memo,
    }).eq('id', id).select().single()
    if (error) return { ok: false, error: error.message }
    await supabase.from('report_deliveries').insert({
      report_id: id, team_id: data.team_id, report_title: data.title,
      operator, method, memo,
    })
    return { ok: true, report: mapRow(data) }
  }

  const cur = readMock(KEY).find(r => r.id === id)
  if (!cur) return { ok: false, error: 'not_found' }
  if (cur.status !== 'approved') return { ok: false, code: 'not_approved' }
  let updated = null
  writeMock(KEY, readMock(KEY).map(r => {
    if (r.id !== id) return r
    updated = { ...r, status: 'delivered', updatedAt: now, deliveredAt: now, deliveredBy: operator, deliveryMethod: method, deliveryMemo: memo }
    return updated
  }))
  const dl = readMock(DKEY)
  dl.unshift({ id: 'dl' + Date.now(), reportId: id, teamId: updated.teamId, reportTitle: updated.title, operator, method, memo, deliveredAt: now })
  writeMock(DKEY, dl)
  return { ok: true, report: updated }
}

// ── 삭제 ──
export async function deleteReport(id) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('club_reports').delete().eq('id', id)
    return { ok: !error }
  }
  writeMock(KEY, readMock(KEY).filter(r => r.id !== id))
  return { ok: true }
}

// ── 전달 기록 목록 ──
export async function listDeliveries() {
  if (!isAdmin()) return []
  if (isSupabaseConfigured) {
    const { data } = await supabase.from('report_deliveries').select('*').order('delivered_at', { ascending: false })
    return (data || []).map(d => ({
      id: d.id, reportId: d.report_id, teamId: d.team_id, reportTitle: d.report_title || '',
      operator: d.operator, method: d.method || 'pdf', memo: d.memo || '', deliveredAt: d.delivered_at,
    }))
  }
  return readMock(DKEY)
}
