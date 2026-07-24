import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyFailure, backoffSeconds, decideNext, MAX_ATTEMPTS } from './aiRetry.js'
import { djb2, newsCacheKey } from './newsCacheKey.js'

test('classifyFailure: 429=retryable+rateLimited, 5xx=retryable, 4xx=non-retryable', () => {
  assert.deepEqual(classifyFailure({ httpStatus: 429 }), { retryable: true, rateLimited: true, code: 'rate_limited' })
  assert.deepEqual(classifyFailure({ httpStatus: 503 }), { retryable: true, rateLimited: false, code: 'http_503' })
  assert.equal(classifyFailure({ httpStatus: 400 }).retryable, false)
  assert.equal(classifyFailure({ httpStatus: 401 }).retryable, false)
})
test('classifyFailure: kind-based', () => {
  assert.equal(classifyFailure({ kind: 'timeout' }).retryable, true)
  assert.equal(classifyFailure({ kind: 'network' }).retryable, true)
  assert.equal(classifyFailure({ kind: 'empty_content' }).retryable, false)
  assert.equal(classifyFailure({ kind: 'bad_input' }).retryable, false)
  assert.equal(classifyFailure({ kind: 'parse' }).retryable, false)
})
test('backoffSeconds: 단조 증가 + cap 6h', () => {
  assert.equal(backoffSeconds(1, { jitter: false }), 60)
  assert.equal(backoffSeconds(2, { jitter: false }), 300)
  assert.equal(backoffSeconds(4, { jitter: false }), 3600)
  assert.equal(backoffSeconds(6, { jitter: false }), 21600)
  assert.equal(backoffSeconds(99, { jitter: false }), 21600) // cap
})
test('backoffSeconds: jitter는 최소 30초 이상, base 근처', () => {
  const v = backoffSeconds(1, { jitter: true, rand: () => 0 }) // -20%
  assert.ok(v >= 30 && v <= 60)
})
test('decideNext: 성공→done', () => {
  assert.deepEqual(decideNext({ ok: true }), { status: 'done' })
})
test('decideNext: 429 첫 시도→retry(backoff)', () => {
  const r = decideNext({ ok: false, httpStatus: 429, attempts: 1 })
  assert.equal(r.status, 'retry'); assert.equal(r.nextRetrySec, 60); assert.equal(r.rateLimited, true)
})
test('decideNext: 5xx 3회차→retry, MAX 도달→failed', () => {
  assert.equal(decideNext({ ok: false, httpStatus: 503, attempts: 3 }).status, 'retry')
  assert.equal(decideNext({ ok: false, httpStatus: 503, attempts: MAX_ATTEMPTS }).status, 'failed')
})
test('decideNext: 비재시도(빈 컨텐츠/400)→즉시 failed', () => {
  assert.equal(decideNext({ ok: false, kind: 'empty_content', attempts: 1 }).status, 'failed')
  assert.equal(decideNext({ ok: false, httpStatus: 400, attempts: 1 }).status, 'failed')
})
test('newsCacheKey: sourceUrl 우선, 안정적 djb2', () => {
  const k1 = newsCacheKey('seoul', { id: 'x', title: 'T', sourceUrl: 'http://a' })
  const k2 = newsCacheKey('seoul', { id: 'x', title: 'T', sourceUrl: 'http://a' })
  assert.equal(k1, k2)                          // 결정적
  assert.ok(k1.startsWith('seoul:'))
  const kTitle = newsCacheKey('seoul', { id: 'x', title: 'T' })   // sourceUrl 없으면 title
  assert.equal(kTitle, `seoul:${djb2('T')}`)
  const kId = newsCacheKey('seoul', { id: 'idv' })                 // 둘 다 없으면 id
  assert.equal(kId, `seoul:${djb2('idv')}`)
})
test('djb2: 알려진 입력 결정성(회귀 방지)', () => {
  assert.equal(djb2('http://a'), djb2('http://a'))
  assert.equal(typeof djb2('test'), 'string')
})
