// FANCLUV — 본인인증 보안/Adapter 단위 테스트 (순수 로직, webcrypto).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateNonce, isTimestampFresh, hashDi, signPayload, verifySignature,
  validateState, validateOrigin, validateCallback,
} from './identitySecurity.js'
import { MockIdentityAdapter, mockVerificationServer, getIdentityAdapter } from './identityAdapter.js'

const SECRET = 'fancluv-mock-identity-secret'

test('nonce: 32 hex, 매번 다름', () => {
  const a = generateNonce(), b = generateNonce()
  assert.match(a, /^[0-9a-f]{32}$/); assert.notEqual(a, b)
})

test('hashDi: 결정적 sha256 hex, 동일 DI 동일 해시 · 다른 DI 다른 해시', async () => {
  const h1 = await hashDi('MOCKDI-abc'), h2 = await hashDi('MOCKDI-abc'), h3 = await hashDi('MOCKDI-xyz')
  assert.match(h1, /^[0-9a-f]{64}$/); assert.equal(h1, h2); assert.notEqual(h1, h3)
})

test('signPayload/verifySignature: 정상 서명 검증 + tamper 거부', async () => {
  const p = { provider: 'mock', di: 'D', timestamp: 1000, state: 'ss' }
  p.signature = await signPayload(p, SECRET)
  assert.equal(await verifySignature(p, SECRET), true)
  const tampered = { ...p, di: 'D-HACK' }
  assert.equal(await verifySignature(tampered, SECRET), false)
  assert.equal(await verifySignature({ ...p, signature: 'deadbeef' }, SECRET), false)
})

test('timestamp/state/origin 검증', () => {
  assert.equal(isTimestampFresh(Date.now()), true)
  assert.equal(isTimestampFresh(Date.now() - 10 * 60 * 1000), false)
  assert.equal(validateState('abcd1234', 'abcd1234'), true)
  assert.equal(validateState('x', 'y'), false)
  assert.equal(validateOrigin('https://a.com', ['https://a.com']), true)
  assert.equal(validateOrigin('https://evil.com', ['https://a.com']), false)
})

test('validateCallback: 정상 통과 + 위/변조·만료·오리진·state 거부', async () => {
  const now = Date.now()
  const base = { provider: 'mock', di: 'D', state: 'state1234', origin: 'https://mock-identity.local', timestamp: now }
  const good = { ...base }; good.signature = await signPayload(good, SECRET)
  assert.equal((await validateCallback({ payload: good, expectedState: 'state1234', allowedOrigin: 'https://mock-identity.local', secret: SECRET, now })).ok, true)
  // bad origin
  assert.equal((await validateCallback({ payload: good, expectedState: 'state1234', allowedOrigin: 'https://other', secret: SECRET, now })).code, 'bad_origin')
  // bad state
  assert.equal((await validateCallback({ payload: good, expectedState: 'WRONG', allowedOrigin: 'https://mock-identity.local', secret: SECRET, now })).code, 'bad_state')
  // expired
  const old = { ...base, timestamp: now - 10 * 60 * 1000 }; old.signature = await signPayload(old, SECRET)
  assert.equal((await validateCallback({ payload: old, expectedState: 'state1234', allowedOrigin: 'https://mock-identity.local', secret: SECRET, now })).code, 'expired')
  // tamper (서명 후 변조)
  const t = { ...good, di: 'HACK' }
  assert.equal((await validateCallback({ payload: t, expectedState: 'state1234', allowedOrigin: 'https://mock-identity.local', secret: SECRET, now })).code, 'bad_signature')
})

test('MockAdapter: start → 서버 콜백 → complete(정상), di_hash 존재·원문 미포함', async () => {
  const adapter = new MockIdentityAdapter()
  const started = await adapter.startVerification({})
  assert.equal(started.ok, true); assert.ok(started.state && started.nonce)
  const payload = await mockVerificationServer.issueCallback({ personSeed: 'user-A', state: started.state })
  const done = await adapter.completeVerification({ payload, expectedState: started.state, providerUserId: 'pu1' })
  assert.equal(done.ok, true)
  assert.match(done.di_hash, /^[0-9a-f]{64}$/)
  // 표준 완료 데이터에 DI/CI 원문 없음
  assert.equal('di' in done, false); assert.equal('ci' in done, false)
  assert.equal(done.ci_present, true)
})

test('MockAdapter: 동일인=동일 di_hash, 다른 사람=다른 di_hash (중복/연결 근거)', async () => {
  const adapter = new MockIdentityAdapter()
  const mk = async (seed) => {
    const s = await adapter.startVerification({})
    const p = await mockVerificationServer.issueCallback({ personSeed: seed, state: s.state })
    return (await adapter.completeVerification({ payload: p, expectedState: s.state })).di_hash
  }
  const a1 = await mk('person-1'), a2 = await mk('person-1'), b = await mk('person-2')
  assert.equal(a1, a2); assert.notEqual(a1, b)
})

test('MockAdapter: 만료 콜백 거부', async () => {
  const adapter = new MockIdentityAdapter()
  const s = await adapter.startVerification({})
  const p = await mockVerificationServer.issueCallback({ personSeed: 'u', state: s.state, expired: true })
  const done = await adapter.completeVerification({ payload: p, expectedState: s.state })
  assert.equal(done.ok, false); assert.equal(done.code, 'expired')
})

test('getIdentityAdapter: 미지원/미설정 → mock 폴백', () => {
  assert.equal(getIdentityAdapter('mock').agency, 'mock')
  assert.equal(getIdentityAdapter('pass').agency, 'pass')
  assert.equal(getIdentityAdapter('unknown').agency, 'mock')
  assert.equal(getIdentityAdapter().agency, 'mock')
})
