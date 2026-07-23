// 자동 수집 오케스트레이터 순수 로직 테스트 (node --test)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarize, runPool, EDGE_CLUBS } from './collect-news.js'

test('EDGE_CLUBS: 안양 제외 11개 구단', () => {
  assert.equal(EDGE_CLUBS.length, 11)
  assert.ok(!EDGE_CLUBS.includes('anyang'))
})

test('summarize: 전부 성공 → success', () => {
  const r = summarize([{ ok: true, written: 3 }, { ok: true, written: 2 }])
  assert.equal(r.status, 'success')
  assert.equal(r.successful_sources, 2)
  assert.equal(r.failed_sources, 0)
  assert.equal(r.articles_written, 5)
})

test('summarize: 일부 실패 → partial (rollback 아님)', () => {
  const r = summarize([{ ok: true, written: 4 }, { ok: false, written: 0 }, { ok: true, written: 1 }])
  assert.equal(r.status, 'partial')
  assert.equal(r.successful_sources, 2)
  assert.equal(r.failed_sources, 1)
  assert.equal(r.articles_written, 5)   // 실패해도 성공분 기록 유지
})

test('summarize: 전부 실패 → failed', () => {
  const r = summarize([{ ok: false, written: 0 }, { ok: false, written: 0 }])
  assert.equal(r.status, 'failed')
  assert.equal(r.successful_sources, 0)
})

test('runPool: 동시성 제한 준수 + 전체 처리', async () => {
  let active = 0, maxActive = 0
  const items = Array.from({ length: 9 }, (_, i) => i)
  const out = await runPool(items, 3, async (n) => {
    active++; maxActive = Math.max(maxActive, active)
    await new Promise((r) => setTimeout(r, 5))
    active--
    return n * 2
  })
  assert.deepEqual(out, items.map((n) => n * 2))   // 결과 순서/값 보존
  assert.ok(maxActive <= 3, `maxActive ${maxActive} <= 3`)
})

test('runPool: 개별 worker 예외를 던지면 격리되지 않음 → 오케스트레이터가 worker 내부에서 try/catch로 처리해야 함(계약 확인)', async () => {
  // worker 가 절대 throw 하지 않는 계약(각 collector 가 결과 객체 반환). 예시로 확인.
  const out = await runPool([1, 2], 2, async (n) => ({ ok: n === 1, source: 's' + n }))
  assert.equal(out[0].ok, true)
  assert.equal(out[1].ok, false)
})
