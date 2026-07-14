// FANCLUV — 계정 병합 서비스(AccountMergeService).
//
// merge_operations(0058) RPC 를 오케스트레이션한다. 자동 병합 없음 — 항상 Merge Pending.
//   requestMerge   : 본인(source)이 동일 DI 대표계정과 병합 요청 → pending
//   approveMerge   : 관리자 승인 → approved
//   rejectMerge    : 관리자 반려 → rejected
//   cancelMerge    : 요청자/관리자 취소 → cancelled
//   completeMerge  : service_role/superadmin 실제 이관 → completed (또는 failed 롤백)
//   getMergeStatus : 상태 조회
//
// 보안 경계: 실제 이관(completeMerge)은 클라이언트에서 직접 호출하지 않는 것이 원칙이며,
//   관리자 승인 후 백엔드(Edge Function, service_role)가 호출한다. 여기서는 얇은 RPC 래퍼만 제공.
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { canApply, nextStatus } from './mergeStatus.js'
import { logger } from '../logger.js'

async function callRpc(fn, args) {
  if (!isSupabaseConfigured) return { ok: false, code: 'not_configured' }
  const { data, error } = await supabase.rpc(fn, args)
  if (error) { logger.warn('merge rpc 실패', { fn, error }); return { ok: false, code: 'rpc_error' } }
  return data || { ok: false, code: 'no_data' }
}

export class AccountMergeService {
  // 본인 → 대표계정 병합 요청. requestId 는 멱등키(중복 요청 dedupe).
  async requestMerge({ targetUserId, reason = null, requestId = null } = {}) {
    return callRpc('request_account_merge', { p_target: targetUserId, p_reason: reason, p_request_id: requestId })
  }

  async approveMerge(operationId) {
    return callRpc('approve_account_merge', { p_operation_id: operationId })
  }

  async rejectMerge(operationId, reason = null) {
    return callRpc('reject_account_merge', { p_operation_id: operationId, p_reason: reason })
  }

  async cancelMerge(operationId) {
    return callRpc('cancel_account_merge', { p_operation_id: operationId })
  }

  // service_role/superadmin 컨텍스트에서만 성공(그 외 forbidden).
  async completeMerge(operationId) {
    return callRpc('complete_account_merge', { p_operation_id: operationId })
  }

  async getMergeStatus(operationId) {
    return callRpc('get_merge_status', { p_operation_id: operationId })
  }

  // 클라이언트 선검증(서버 compare-and-set 과 동일 규칙) — UX 용, 최종 판정은 서버.
  canApply(action, fromStatus) { return canApply(action, fromStatus) }
  nextStatus(action) { return nextStatus(action) }
}

export const accountMergeService = new AccountMergeService()
