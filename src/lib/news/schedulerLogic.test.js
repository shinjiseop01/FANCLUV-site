import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeRun } from './schedulerLogic.js'

test('summarizeRun: 전부 성공 → success', () => {
  const r = summarizeRun([{ ok: true, written: 3 }, { ok: true, written: 2 }])
  assert.equal(r.status, 'success')
  assert.deepEqual([r.successful_sources, r.failed_sources, r.articles_written], [2, 0, 5])
})

test('summarizeRun: 일부 실패 → partial(rollback 아님, 성공분 유지)', () => {
  const r = summarizeRun([{ ok: true, written: 4 }, { ok: false, written: 0 }, { ok: true, written: 1 }])
  assert.equal(r.status, 'partial')
  assert.deepEqual([r.successful_sources, r.failed_sources, r.articles_written], [2, 1, 5])
})

test('summarizeRun: 전부 실패 → failed', () => {
  assert.equal(summarizeRun([{ ok: false }, { ok: false }]).status, 'failed')
})

test('summarizeRun: 빈 결과 → failed', () => {
  assert.equal(summarizeRun([]).status, 'failed')
})
