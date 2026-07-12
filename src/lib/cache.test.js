// FANCLUV — cache.js 단위 테스트 (in-memory TTL 캐시).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withCache, invalidate, clearCache, getCacheStats, resetCacheStats } from './cache.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('Cache Hit/Miss: TTL 내 반복 호출은 fetcher 1회만 실행(중복 호출 감소)', async () => {
  clearCache()
  let calls = 0
  const fetcher = () => { calls++; return Promise.resolve('v' + calls) }
  const first = await withCache('k', fetcher, 1000)
  for (let i = 0; i < 9; i++) await withCache('k', fetcher, 1000)
  assert.equal(calls, 1) // 10회 호출 → 1회 실행 = 90% 감소
  assert.equal(first, 'v1')
})

test('getCacheStats: hit/miss/hitRate 계측(운영 대시보드)', async () => {
  clearCache(); resetCacheStats()
  const f = () => Promise.resolve(1)
  await withCache('s', f, 1000)          // miss
  await withCache('s', f, 1000)          // hit
  await withCache('s', f, 1000)          // hit
  const st = getCacheStats()
  assert.equal(st.misses, 1)
  assert.equal(st.hits, 2)
  assert.equal(st.hitRate, 2 / 3)
})

test('TTL 만료 후에는 다시 fetcher 실행', async () => {
  clearCache()
  let calls = 0
  const fetcher = () => { calls++; return Promise.resolve(calls) }
  await withCache('t', fetcher, 40)
  await sleep(60)
  await withCache('t', fetcher, 40)
  assert.equal(calls, 2)
})

test('invalidate(prefix) 후에는 재요청 시 fetcher 실행', async () => {
  clearCache()
  let calls = 0
  const fetcher = () => { calls++; return Promise.resolve(calls) }
  await withCache('p:1', fetcher, 5000)
  invalidate('p:')
  await withCache('p:1', fetcher, 5000)
  assert.equal(calls, 2)
})

test('실패한 응답은 캐시하지 않아 다음 호출에서 재시도', async () => {
  clearCache()
  let calls = 0
  const bad = () => { calls++; return Promise.reject(new Error('boom')) }
  await assert.rejects(withCache('e', bad, 5000))
  await assert.rejects(withCache('e', bad, 5000))
  assert.equal(calls, 2)
})
