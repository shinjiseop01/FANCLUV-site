// FANCLUV — 계정 병합 상태 머신 단위 테스트(순수, DB 불필요).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MERGE_STATES, MERGE_TRANSITIONS, TERMINAL_STATES, MERGE_ACTION_ROLE,
  isTerminal, isRetryable, canApply, nextStatus, isPendingApproval,
} from './mergeStatus.js'

test('상태 집합: 6개(pending/approved/completed/cancelled/failed/rejected)', () => {
  assert.deepEqual([...MERGE_STATES].sort(),
    ['approved', 'cancelled', 'completed', 'failed', 'pending', 'rejected'])
})

test('canApply: 허용 전이만 통과(compare-and-set 대상)', () => {
  // 승인/반려/취소는 pending 에서.
  assert.equal(canApply('approve', 'pending'), true)
  assert.equal(canApply('reject', 'pending'), true)
  assert.equal(canApply('cancel', 'pending'), true)
  // 완료/실패는 approved 에서.
  assert.equal(canApply('complete', 'approved'), true)
  assert.equal(canApply('fail', 'approved'), true)
  assert.equal(canApply('cancel', 'approved'), true)
  // 취소는 완료된 건에 불가.
  assert.equal(canApply('cancel', 'completed'), false)
  // 완료는 pending 에서 바로 불가(승인 필요).
  assert.equal(canApply('complete', 'pending'), false)
  // 승인은 이미 승인/완료된 건 불가.
  assert.equal(canApply('approve', 'approved'), false)
  assert.equal(canApply('approve', 'completed'), false)
  // 미지 액션.
  assert.equal(canApply('nope', 'pending'), false)
})

test('nextStatus: 액션 성공 시 도달 상태', () => {
  assert.equal(nextStatus('request'), 'pending')
  assert.equal(nextStatus('approve'), 'approved')
  assert.equal(nextStatus('reject'), 'rejected')
  assert.equal(nextStatus('cancel'), 'cancelled')
  assert.equal(nextStatus('complete'), 'completed')
  assert.equal(nextStatus('fail'), 'failed')
  assert.equal(nextStatus('nope'), null)
})

test('terminal/retryable 판정', () => {
  for (const s of ['completed', 'cancelled', 'rejected', 'failed']) assert.equal(isTerminal(s), true)
  for (const s of ['pending', 'approved']) assert.equal(isTerminal(s), false)
  // 실패만 재시도(새 요청)로 재개 가능.
  assert.equal(isRetryable('failed'), true)
  assert.equal(isRetryable('completed'), false)
  assert.equal(isRetryable('pending'), false)
})

test('terminal 상태에서는 어떤 전이도 불가', () => {
  for (const s of TERMINAL_STATES) {
    for (const action of Object.keys(MERGE_TRANSITIONS)) {
      if (action === 'request') continue // request 는 신규(from=null)
      assert.equal(canApply(action, s), false, `${action} from ${s} 이면 안 됨`)
    }
  }
})

test('권한 매핑: request=user, approve/reject=admin, complete=service/superadmin', () => {
  assert.equal(MERGE_ACTION_ROLE.request, 'user')
  assert.equal(MERGE_ACTION_ROLE.approve, 'admin')
  assert.equal(MERGE_ACTION_ROLE.reject, 'admin')
  assert.equal(MERGE_ACTION_ROLE.cancel, 'requester_or_admin')
  assert.equal(MERGE_ACTION_ROLE.complete, 'service_or_superadmin')
  assert.equal(MERGE_ACTION_ROLE.fail, 'service_or_superadmin')
})

test('isPendingApproval: pending 만 승인 대기', () => {
  assert.equal(isPendingApproval('pending'), true)
  assert.equal(isPendingApproval('approved'), false)
})
