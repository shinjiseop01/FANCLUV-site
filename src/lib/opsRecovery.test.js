// FANCLUV — opsRecovery.js 단위 테스트.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isTransientError, withRetry, shouldNotifyRecovery } from './opsRecovery.js'

test('isTransientError: 네트워크/타임아웃/5xx 는 transient', () => {
  assert.equal(isTransientError(new Error('network error')), true)
  assert.equal(isTransientError(new Error('timeout')), true)
  assert.equal(isTransientError(new Error('http_503')), true)
  assert.equal(isTransientError(new Error('invalid_key')), false)
})

test('withRetry: 첫 시도 transient 실패 → 재시도 성공(자동 복구)', async () => {
  let n = 0
  const r = await withRetry(async () => { n++; if (n === 1) throw new Error('network'); return 'ok' }, { sleep: async () => {} })
  assert.equal(r.ok, true)
  assert.equal(r.value, 'ok')
  assert.equal(r.attempts, 2)
})

test('withRetry: 실패→재시도→계속 실패면 재시도 소진 후 복구 실패(ok=false)', async () => {
  let n = 0
  const r = await withRetry(async () => { n++; throw new Error('network') }, { retries: 2, sleep: async () => {} })
  assert.equal(r.ok, false)      // 복구 실패
  assert.equal(n, 3)             // 최초 1 + 재시도 2
  assert.match(String(r.error?.message), /network/)
})

test('withRetry: 영구 오류는 재시도 없이 즉시 실패', async () => {
  let n = 0
  const r = await withRetry(async () => { n++; throw new Error('invalid_key') }, { sleep: async () => {} })
  assert.equal(r.ok, false)
  assert.equal(n, 1) // 재시도 안 함
})

test('withRetry: isValid 실패(빈 응답)도 재시도 대상', async () => {
  let n = 0
  const r = await withRetry(async () => { n++; return n < 2 ? [] : ['x'] }, { isValid: (v) => v.length > 0, sleep: async () => {} })
  assert.equal(r.ok, true)
  assert.equal(r.attempts, 2)
})

test('shouldNotifyRecovery: 장애 알림 상태 → 정상 복귀 시에만 true', () => {
  assert.equal(shouldNotifyRecovery('2026-07-12T00:00:00Z', 'ok'), true)
  assert.equal(shouldNotifyRecovery('2026-07-12T00:00:00Z', 'slow'), true)
  assert.equal(shouldNotifyRecovery('2026-07-12T00:00:00Z', 'error'), false) // 아직 장애
  assert.equal(shouldNotifyRecovery(null, 'ok'), false) // 애초에 알림 안 나갔음
})
