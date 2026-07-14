// FANCLUV — 계정 병합 상태 머신(순수). merge_operations 의 상태전이 규칙을 프론트/테스트에서 공유.
// 서버(0058 RPC)의 compare-and-set 전이와 동일한 규칙을 클라이언트에서도 검증/표시한다.

export const MERGE_STATES = ['pending', 'approved', 'completed', 'cancelled', 'failed', 'rejected']

// 액션 → 전이(from status → to status). 서버 RPC 와 1:1.
export const MERGE_TRANSITIONS = {
  request: { from: [null], to: 'pending' },          // 신규 생성
  approve: { from: ['pending'], to: 'approved' },
  reject: { from: ['pending'], to: 'rejected' },
  cancel: { from: ['pending', 'approved'], to: 'cancelled' },
  complete: { from: ['approved'], to: 'completed' },
  fail: { from: ['approved'], to: 'failed' },
}

// 더 진행되지 않는 최종 상태.
export const TERMINAL_STATES = ['completed', 'cancelled', 'rejected', 'failed']

// 액션을 실행할 수 있는 권한.
export const MERGE_ACTION_ROLE = {
  request: 'user',        // 본인(source)
  approve: 'admin',
  reject: 'admin',
  cancel: 'requester_or_admin',
  complete: 'service_or_superadmin',
  fail: 'service_or_superadmin',
}

export function isTerminal(status) {
  return TERMINAL_STATES.includes(status)
}

// 실패는 새 요청으로만 재시도(같은 op 를 되살리지 않음).
export function isRetryable(status) {
  return status === 'failed'
}

// from 상태에서 action 이 허용되는가(compare-and-set 대상 검증).
export function canApply(action, fromStatus) {
  const t = MERGE_TRANSITIONS[action]
  if (!t) return false
  return t.from.includes(fromStatus)
}

// action 성공 시 도달 상태.
export function nextStatus(action) {
  return MERGE_TRANSITIONS[action]?.to || null
}

// 관리자 승인 대기(pending)만 별도 노출.
export function isPendingApproval(status) {
  return status === 'pending'
}
