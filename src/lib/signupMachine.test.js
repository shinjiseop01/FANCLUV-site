import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canTransition, nextStates, FORBIDDEN_TRANSITIONS, SIGNUP_STATES } from './signupMachine.js'

// 허용 전이(스펙 예시)
const ALLOWED = [
  ['idle', 'sending'],
  ['sending', 'code_sent'],
  ['sending', 'send_failed'],
  ['code_sent', 'verifying'],
  ['verifying', 'verified'],
  ['verifying', 'verification_failed'],
  ['verifying', 'expired'],
  ['verified', 'completing_signup'],
  ['completing_signup', 'completed'],
  ['completing_signup', 'verified'],
  ['code_sent', 'sending'],   // 재전송
  ['expired', 'sending'],     // 재전송
  ['verified', 'idle'],       // 이메일 변경(인증 무효화)
]
for (const [f, t] of ALLOWED) {
  test(`allow ${f} → ${t}`, () => assert.equal(canTransition(f, t), true))
}

// 금지 전이(스펙): verified→sending 자동 등
for (const [f, t] of FORBIDDEN_TRANSITIONS) {
  test(`forbid ${f} → ${t}`, () => assert.equal(canTransition(f, t), false))
}

test('completed 는 종료 상태(모든 전이 불가)', () => {
  assert.deepEqual(nextStates('completed'), [])
  for (const s of SIGNUP_STATES) assert.equal(canTransition('completed', s), false)
})

test('알 수 없는 상태는 전이 불가', () => {
  assert.equal(canTransition('bogus', 'sending'), false)
})
