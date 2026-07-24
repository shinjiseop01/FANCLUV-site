// FANCLUV Feedback Loop — 구단 개선 조치 팬 공개(「구단 피드백」) 데이터 레이어.
//
// 보안: 팬 조회는 sanitize 된 공개 필드만 반환하는 서버 RPC(fan_club_feedback)만 사용한다.
//       공개/취소는 서버 RPC(club_publish_action / club_unpublish_action)에서 tenant·완료상태·
//       공개필드 존재를 강제한다. 클라이언트는 내부 필드를 직접 다루지 않는다.
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { toFanFeedback, validatePublicFields } from './feedbackVisibility.js'

// ── Fan: 우리 구단의 공개된 개선 사례(최근 N개, bounded) ──
export async function getFanFeedback(teamId, limit = 5) {
  if (!teamId) return []
  if (!isSupabaseConfigured) return [] // Mock: 허위 개선 사례를 만들지 않는다(정직한 Empty State).
  const { data, error } = await supabase.rpc('fan_club_feedback', { p_team_id: teamId, p_limit: limit })
  if (error) return []
  // 방어적 sanitize — 서버가 이미 공개필드만 반환하지만 내부 필드 유입을 이중 차단.
  return (data || []).map(toFanFeedback)
}

// ── Club/Admin: 내 구단의 조치 목록(공개 관리용, 최소 필드) ──
export async function listOwnActions(limit = 50) {
  if (!isSupabaseConfigured) return []
  const { data, error } = await supabase.rpc('club_list_own_actions', { p_limit: limit })
  if (error) return []
  return data || []
}

// ── Club/Admin: 완료 조치를 팬에게 공개 ──
export async function publishAction(id, { title, summary, category } = {}) {
  const v = validatePublicFields({ title, summary })
  if (!v.ok) return v
  if (!isSupabaseConfigured) return { ok: false, code: 'no_backend' }
  const { data, error } = await supabase.rpc('club_publish_action', {
    p_action_id: id, p_public_title: title, p_public_summary: summary, p_category: category || null,
  })
  if (error) return { ok: false, code: error.message }
  return data || { ok: false, code: 'error' }
}

// ── Club/Admin: 공개 취소(row 삭제 아님) ──
export async function unpublishAction(id) {
  if (!isSupabaseConfigured) return { ok: false, code: 'no_backend' }
  const { data, error } = await supabase.rpc('club_unpublish_action', { p_action_id: id })
  if (error) return { ok: false, code: error.message }
  return data || { ok: false, code: 'error' }
}
