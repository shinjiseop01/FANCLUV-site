// FANCLUV — deletePolicy 단위 테스트.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canDeleteRole, canActorDelete, isProtectedTargetRole,
  validateReason, normalizeMode, isUuid, deleteErrorKey,
} from './deletePolicy.js'

test('권한 매트릭스: superadmin 은 superadmin 제외 전부 삭제 가능', () => {
  for (const tgt of ['user', 'staff', 'admin', 'club', 'club_admin']) {
    assert.equal(canDeleteRole('superadmin', tgt), true, `superadmin→${tgt}`)
  }
  assert.equal(canDeleteRole('superadmin', 'superadmin'), false)
})

test('권한 매트릭스: admin 은 팬(user)만 삭제 가능', () => {
  assert.equal(canDeleteRole('admin', 'user'), true)
  for (const tgt of ['staff', 'admin', 'club', 'club_admin', 'superadmin']) {
    assert.equal(canDeleteRole('admin', tgt), false, `admin→${tgt} 차단`)
  }
})

test('권한 매트릭스: staff/club/club_admin/fan 은 삭제 권한 없음', () => {
  for (const actor of ['staff', 'club', 'club_admin', 'user']) {
    assert.equal(canActorDelete(actor), false, `${actor} 권한 없음`)
    assert.equal(canDeleteRole(actor, 'user'), false, `${actor}→user 차단`)
  }
  assert.equal(canActorDelete('admin'), true)
  assert.equal(canActorDelete('superadmin'), true)
})

test('superadmin 대상은 보호(마지막 1인 포함)', () => {
  assert.equal(isProtectedTargetRole('superadmin'), true)
  assert.equal(isProtectedTargetRole('admin'), false)
})

test('삭제 사유 검증: 3~500자', () => {
  assert.equal(validateReason('  ').ok, false)
  assert.equal(validateReason('ab').code, 'reason_too_short')
  assert.equal(validateReason('스팸 계정').ok, true)
  assert.equal(validateReason('x'.repeat(501)).code, 'reason_too_long')
  assert.equal(validateReason('  정상 사유  ').value, '정상 사유')
})

test('mode 정규화: 허용값 외는 hard_delete', () => {
  assert.equal(normalizeMode('anonymize'), 'anonymize')
  assert.equal(normalizeMode('hard_delete'), 'hard_delete')
  assert.equal(normalizeMode('DROP TABLE'), 'hard_delete')
  assert.equal(normalizeMode(undefined), 'hard_delete')
})

test('UUID 검증', () => {
  assert.equal(isUuid('3a791c83-b3aa-4ec2-bf67-c5f7c3e860f5'), true)
  assert.equal(isUuid('not-a-uuid'), false)
  assert.equal(isUuid(''), false)
  assert.equal(isUuid(null), false)
})

test('error code → i18n 키 매핑(미지 코드는 errFailed)', () => {
  assert.equal(deleteErrorKey('self_delete_forbidden'), 'admin.del.errSelf')
  assert.equal(deleteErrorKey('last_superadmin_forbidden'), 'admin.del.errLastSuper')
  assert.equal(deleteErrorKey('forbidden'), 'admin.del.errForbidden')
  assert.equal(deleteErrorKey('weird_unknown'), 'admin.del.errFailed')
})
