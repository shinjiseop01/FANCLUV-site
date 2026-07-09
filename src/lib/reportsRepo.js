// FANCLUV — Reports repository.
//
// 팬 신고 접수(ReportModal)와 관리자 신고 관리(AdminReports)의 단일 데이터 소스.
// Supabase 설정 시 reports 테이블(+ 대상 콘텐츠 숨김/삭제), 아니면 Mock(localStorage).
// 모든 함수는 async 이며 두 모드에서 동일한 UI 형태의 객체를 반환한다.
import { supabase, isSupabaseConfigured } from './supabase.js'
import { getCurrentUser } from './auth.js'
import { MOCK_REPORTS } from '../admin/adminData.js'

// 신고 사유 코드 (라벨은 locale report.reason.<code> 로 표시). '기타'는 detail 직접 입력.
export const REPORT_REASONS = ['abuse', 'ad', 'false', 'obscene', 'privacy', 'spam', 'other']

const KEY = 'fancluv_reports'

function readMock() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null } catch { return null }
}
function writeMock(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* ignore */ }
}
// 최초 1회 seed (adminData 의 MOCK_REPORTS 로 시작).
function getMockList() {
  let list = readMock()
  if (list === null) { list = MOCK_REPORTS.map(r => ({ ...r })); writeMock(list) }
  return list
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mapRow(r, reporterName) {
  return {
    id: r.id,
    targetType: r.target_type,
    targetId: r.target_id,
    target: r.target_excerpt || '',
    reporter: reporterName || '익명',
    reason: r.reason,
    detail: r.detail || '',
    date: fmtDate(r.created_at),
    status: r.status,
  }
}

// ── 팬: 신고 접수 ──
export async function submitReport({ targetType, targetId = null, targetExcerpt = '', reason, detail = '' }) {
  if (!reason) return { ok: false, error: '신고 사유를 선택해 주세요.' }
  if (reason === 'other' && !detail.trim()) return { ok: false, error: '기타 사유를 입력해 주세요.' }
  const me = getCurrentUser()
  if (isSupabaseConfigured) {
    if (!me) return { ok: false, error: '로그인이 필요합니다.' }
    const { error } = await supabase.from('reports').insert({
      target_type: targetType, target_id: targetId ? String(targetId) : null,
      target_excerpt: targetExcerpt, reporter_id: me.id,
      reason, detail: reason === 'other' ? detail.trim() : null,
    })
    if (error) {
      // 같은 사용자가 같은 대상을 다시 신고(unique 제약 위반, 0030) → 중복 안내.
      if (error.code === '23505' || /duplicate/i.test(error.message || ''))
        return { ok: false, code: 'duplicate' }
      return { ok: false, error: error.message }
    }
    return { ok: true }
  }
  // Mock: localStorage 에 저장 → 관리자 화면에서 즉시 확인 가능
  const list = getMockList()
  list.unshift({
    id: 'r' + Date.now(),
    targetType, targetId: targetId ? String(targetId) : null,
    target: targetExcerpt,
    reporter: me?.nickname || '익명',
    reason, detail: reason === 'other' ? detail.trim() : '',
    date: fmtDate(new Date().toISOString()),
    status: 'pending',
  })
  writeMock(list)
  return { ok: true }
}

// ── 관리자: 신고 목록 ──
export async function adminListReports() {
  if (isSupabaseConfigured) {
    // reporter_id 는 auth.users 참조라 profiles 임베드가 불가능(조회 에러 원인).
    // reports 는 관리자만 SELECT(RLS). 신고자 닉네임은 public_profiles 로 별도 조회.
    const { data, error } = await supabase
      .from('reports').select('*')
      .order('created_at', { ascending: false })
    if (error) return []
    const rows = data || []
    const reporterIds = [...new Set(rows.map(r => r.reporter_id).filter(Boolean))]
    const { data: profs } = reporterIds.length
      ? await supabase.from('public_profiles').select('id, nickname').in('id', reporterIds)
      : { data: [] }
    const nameById = {}
    for (const p of profs || []) nameById[p.id] = p.nickname
    return rows.map(r => mapRow(r, nameById[r.reporter_id]))
  }
  return getMockList().map(r => ({ ...r }))
}

// ── 관리자: 처리 완료 ──
export async function resolveReport(id) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('reports').update({ status: 'resolved' }).eq('id', id)
    return { ok: !error }
  }
  writeMock(getMockList().map(r => (r.id === id ? { ...r, status: 'resolved' } : r)))
  return { ok: true }
}

// ── 관리자: 반려 (신고를 기각) ──
export async function rejectReport(id) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('reports').update({ status: 'rejected' }).eq('id', id)
    return { ok: !error }
  }
  writeMock(getMockList().map(r => (r.id === id ? { ...r, status: 'rejected' } : r)))
  return { ok: true }
}

// ── 관리자: 신고 삭제 ──
export async function deleteReport(id) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('reports').delete().eq('id', id)
    return { ok: !error }
  }
  writeMock(getMockList().filter(r => r.id !== id))
  return { ok: true }
}

// ── 관리자: 대상 콘텐츠 조치 (숨김/삭제) 후 신고 처리 완료 ──
// action: 'hide' | 'delete'. targetType 에 따라 opinions/comments 를 대상으로 한다.
export async function moderateTarget(report, action) {
  if (isSupabaseConfigured && report.targetId) {
    const table = report.targetType === 'comment' ? 'comments' : 'opinions'
    if (action === 'delete') {
      await supabase.from(table).delete().eq('id', report.targetId)
    } else {
      await supabase.from(table).update({ status: 'hidden' }).eq('id', report.targetId)
    }
  }
  // 조치 후 신고를 처리 완료 처리 (Mock 은 콘텐츠 저장소가 분리돼 있어 상태만 갱신)
  return resolveReport(report.id)
}
