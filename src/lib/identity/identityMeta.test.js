// FANCLUV — 본인인증 상태/오류 메타 단위 테스트(순수 함수).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  IDENTITY_STATES, IDENTITY_STATUS_META, statusMeta, resolveIdentityStatus, canRetry,
} from './identityStatus.js'
import { identityErrorKey, isSoftError } from './identityErrors.js'

test('statusMeta: 모든 상태에 icon/tone/labelKey/descKey/nextKey 존재', () => {
  for (const s of IDENTITY_STATES) {
    const m = IDENTITY_STATUS_META[s]
    assert.ok(m, `${s} meta 없음`)
    for (const k of ['icon', 'tone', 'labelKey', 'descKey', 'nextKey']) assert.ok(m[k], `${s}.${k} 없음`)
  }
})

test('statusMeta: 미지원 상태 → unverified 폴백', () => {
  assert.equal(statusMeta('nope'), IDENTITY_STATUS_META.unverified)
  assert.equal(statusMeta(undefined), IDENTITY_STATUS_META.unverified)
  assert.equal(statusMeta('verified'), IDENTITY_STATUS_META.verified)
})

test('resolveIdentityStatus: verified 우선, 그다음 세션 상태 매핑', () => {
  assert.equal(resolveIdentityStatus({ verified: true, latestSessionStatus: 'failed' }), 'verified')
  assert.equal(resolveIdentityStatus({ verified: false, latestSessionStatus: 'blocked' }), 'blocked')
  assert.equal(resolveIdentityStatus({ verified: false, latestSessionStatus: 'pending' }), 'pending')
  assert.equal(resolveIdentityStatus({ verified: false, latestSessionStatus: 'failed' }), 'failed')
  assert.equal(resolveIdentityStatus({ verified: false, latestSessionStatus: 'expired' }), 'expired')
  assert.equal(resolveIdentityStatus({ verified: false, latestSessionStatus: null }), 'unverified')
  assert.equal(resolveIdentityStatus({}), 'unverified')
})

test('canRetry: unverified/failed/expired 만 재시도 가능', () => {
  assert.equal(canRetry('unverified'), true)
  assert.equal(canRetry('failed'), true)
  assert.equal(canRetry('expired'), true)
  assert.equal(canRetry('pending'), false)
  assert.equal(canRetry('verified'), false)
  assert.equal(canRetry('blocked'), false)
})

test('identityErrorKey: 알려진 코드 매핑 + 미지의 코드 generic 폴백', () => {
  assert.equal(identityErrorKey('bad_origin'), 'identity.err.origin')
  assert.equal(identityErrorKey('bad_state'), 'identity.err.state')
  assert.equal(identityErrorKey('bad_signature'), 'identity.err.signature')
  assert.equal(identityErrorKey('replay'), 'identity.err.replay')
  assert.equal(identityErrorKey('expired'), 'identity.err.expired')
  assert.equal(identityErrorKey('duplicate'), 'identity.err.duplicate')
  assert.equal(identityErrorKey('provider_unconfigured'), 'identity.err.unconfigured')
  assert.equal(identityErrorKey('not_configured'), 'identity.err.unconfigured')
  assert.equal(identityErrorKey('unauthorized'), 'identity.err.unauthorized')
  assert.equal(identityErrorKey('something-weird'), 'identity.err.generic')
  assert.equal(identityErrorKey(undefined), 'identity.err.generic')
})

test('isSoftError: 취소만 soft', () => {
  assert.equal(isSoftError('cancelled'), true)
  assert.equal(isSoftError('expired'), false)
  assert.equal(isSoftError('bad_signature'), false)
})
