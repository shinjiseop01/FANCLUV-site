// 회귀 테스트 — OAuth state 서명/변조/만료/replay (node --test).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signState, verifyState } from './oauthStateSign.js'

const SECRET = 'test-secret-abc'

test('정상 서명→검증 왕복', async () => {
  const t = await signState({ provider: 'kakao', origin: 'https://fancluv-site.vercel.app', secret: SECRET })
  const r = await verifyState(t, { secret: SECRET })
  assert.equal(r.ok, true)
  assert.equal(r.payload.provider, 'kakao')
  assert.equal(r.payload.origin, 'https://fancluv-site.vercel.app')
  assert.equal(typeof r.payload.n, 'string')
})

test('변조된 payload 는 거부(bad_sig)', async () => {
  const t = await signState({ provider: 'kakao', origin: 'https://a.com', secret: SECRET })
  const [p, sig] = t.split('.')
  const tampered = Buffer.from('{"n":"x","exp":9999999999,"provider":"kakao","origin":"https://evil.com"}')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '.' + sig
  const r = await verifyState(tampered, { secret: SECRET })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'bad_sig')
})

test('다른 secret 은 거부', async () => {
  const t = await signState({ provider: 'naver', origin: 'https://a.com', secret: SECRET })
  const r = await verifyState(t, { secret: 'other-secret' })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'bad_sig')
})

test('만료된 state 는 거부(expired)', async () => {
  const past = Date.now() - 10 * 60 * 1000 // 10분 전 발급
  const t = await signState({ provider: 'kakao', origin: 'https://a.com', secret: SECRET, ttlSec: 300, now: past })
  const r = await verifyState(t, { secret: SECRET, now: Date.now() })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'expired')
})

test('형식 오류 거부', async () => {
  assert.equal((await verifyState('garbage', { secret: SECRET })).code, 'bad_format')
  assert.equal((await verifyState('', { secret: SECRET })).code, 'bad_format')
})

test('replay: nonce 는 검증 결과로 노출되어 호출측이 소비(one-time)할 수 있다', async () => {
  const t = await signState({ provider: 'kakao', origin: 'https://a.com', secret: SECRET })
  const r = await verifyState(t, { secret: SECRET })
  assert.ok(r.payload.n) // 호출측이 이 nonce 를 저장소에서 1회 소비 처리
})
