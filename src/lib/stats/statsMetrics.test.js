import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeAverage, computeRatio, formatRatioPct, growthRate, dayKeyInTz, isSameTzDay,
  dedupeActiveUsers, applyMinAggregation, statsCacheKey, isStale, metricDisplay,
  mergeStatsDelta, downsample,
} from './statsMetrics.js'

test('computeAverage: null when no ratings, 2 decimals otherwise', () => {
  assert.equal(computeAverage(0, 0), null)
  assert.equal(computeAverage(12, 3), 4)
  assert.equal(computeAverage(7, 2), 3.5)
  assert.equal(computeAverage(10, 3), 3.33)
})

test('computeRatio: unrounded, null on zero total', () => {
  assert.equal(computeRatio(1, 4), 0.25)
  assert.equal(computeRatio(5, 0), null)
  assert.equal(formatRatioPct(0.25), 25)
  assert.equal(formatRatioPct(null), null)
})

test('growthRate: null when baseline is zero (no exaggeration)', () => {
  assert.equal(growthRate(10, 0), null)
  assert.equal(growthRate(15, 10), 0.5)
  assert.equal(growthRate(5, 10), -0.5)
})

test('dayKeyInTz: Asia/Seoul boundary (UTC 15:00 = next day KST)', () => {
  // 2026-07-21T15:00:00Z == 2026-07-22 00:00 KST
  assert.equal(dayKeyInTz('2026-07-21T15:00:00Z', 'Asia/Seoul'), '2026-07-22')
  // 2026-07-21T14:59:59Z == 2026-07-21 23:59 KST
  assert.equal(dayKeyInTz('2026-07-21T14:59:59Z', 'Asia/Seoul'), '2026-07-21')
  assert.equal(isSameTzDay('2026-07-21T15:00:00Z', '2026-07-21T20:00:00Z', 'Asia/Seoul'), true)
})

test('dayKeyInTz honors tz param (not hardcoded) — UTC differs from KST', () => {
  assert.equal(dayKeyInTz('2026-07-21T15:00:00Z', 'UTC'), '2026-07-21')
  assert.equal(dayKeyInTz('2026-07-21T15:00:00Z', 'Asia/Seoul'), '2026-07-22')
})

test('dedupeActiveUsers: unique user_id count', () => {
  assert.equal(dedupeActiveUsers([{ user_id: 'a' }, { user_id: 'a' }, { user_id: 'b' }, { user_id: null }]), 2)
  assert.equal(dedupeActiveUsers([]), 0)
})

test('applyMinAggregation: suppress below threshold', () => {
  assert.deepEqual(applyMinAggregation({ positive: 2 }, 3, 5), { suppressed: true, min: 5 })
  assert.equal(applyMinAggregation({ positive: 2 }, 10, 5).suppressed, false)
})

test('statsCacheKey: includes team/period/metric/bucket/role (isolation)', () => {
  const fan = statsCacheKey({ scope: 'summary', teamId: 'seoul', role: 'fan' })
  const admin = statsCacheKey({ scope: 'summary', teamId: 'seoul', role: 'admin' })
  assert.notEqual(fan, admin) // 권한 캐시 분리
  assert.notEqual(statsCacheKey({ teamId: 'seoul' }), statsCacheKey({ teamId: 'ulsan' })) // 팀 분리
  assert.ok(statsCacheKey({ teamId: 'seoul', period: '7d', metric: 'likes', bucket: 'day' }).includes('7d'))
})

test('isStale: true when older than ttl or missing', () => {
  const now = 1_000_000
  assert.equal(isStale(null, 30000, now), true)
  assert.equal(isStale(new Date(now - 40000), 30000, now), true)
  assert.equal(isStale(new Date(now - 10000), 30000, now), false)
})

test('metricDisplay: distinguishes 0 from no-data', () => {
  assert.deepEqual(metricDisplay(0), { hasData: true, value: 0 })
  assert.deepEqual(metricDisplay(null), { hasData: false, value: null })
})

test('mergeStatsDelta: no negative counters', () => {
  assert.deepEqual(mergeStatsDelta({ likes_total: 5 }, { likes_total: 2 }), { likes_total: 7 })
  assert.deepEqual(mergeStatsDelta({ likes_total: 1 }, { likes_total: -3 }), { likes_total: 0 })
})

test('downsample: caps points, keeps last', () => {
  const pts = Array.from({ length: 500 }, (_, i) => ({ t: i, v: i }))
  const ds = downsample(pts, 60)
  assert.ok(ds.length <= 61)
  assert.equal(ds[ds.length - 1].v, 499)
  assert.deepEqual(downsample([{ v: 1 }], 60), [{ v: 1 }]) // 단일 포인트도 안전
  assert.deepEqual(downsample([], 60), [])
})
