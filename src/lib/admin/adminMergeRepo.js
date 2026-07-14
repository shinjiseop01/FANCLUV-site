// FANCLUV — 관리자 계정 병합 관측 repository.
//
// 관리자가 Merge Pending(승인 대기) 및 전체 병합 작업 목록을 조회한다(PII 없음).
// admin_list_merge_operations RPC(is_admin 게이트). 이번 Phase 는 Repo/RPC/API 까지만(UI 없음).
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { isAdmin } from '../auth.js'

// 병합 작업 목록: { operation_id, source_user_id, target_user_id, status, requested_by,
//   approved_by, retry_count, last_error_code, created_at, updated_at }
// status: null 이면 전체, 'pending' 이면 승인 대기만.
export async function adminListMergeOperations({ status = null, limit = 50 } = {}) {
  if (!isAdmin() || !isSupabaseConfigured) return []
  const { data, error } = await supabase.rpc('admin_list_merge_operations', { p_status: status, p_limit: limit })
  if (error) return []
  return data || []
}

// 승인 대기 목록(관리자 승인 UI 준비용).
export async function adminListPendingMerges(limit = 50) {
  return adminListMergeOperations({ status: 'pending', limit })
}
