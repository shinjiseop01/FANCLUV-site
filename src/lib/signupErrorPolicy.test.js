import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signupErrorPolicy } from './signupErrorPolicy.js'

test('nickname conflict → focus nickname, keep OTP step (no login CTA)', () => {
  for (const c of ['nickname_taken', 'nickname_invalid', 'NICKNAME_ALREADY_TAKEN']) {
    const p = signupErrorPolicy(c)
    assert.equal(p.focusNickname, true)
    assert.equal(p.showLoginLink, false)
    assert.equal(p.reverify, false)
  }
})

test('already-registered email → login CTA, no nickname focus', () => {
  for (const c of ['already_registered', 'duplicate', 'EMAIL_ALREADY_REGISTERED']) {
    const p = signupErrorPolicy(c)
    assert.equal(p.showLoginLink, true)
    assert.equal(p.focusNickname, false)
  }
})

test('signin_after_signup → account ready + login CTA', () => {
  const p = signupErrorPolicy('signin_after_signup')
  assert.equal(p.accountReady, true)
  assert.equal(p.showLoginLink, true)
})

test('session/verify expiry → reverify path', () => {
  for (const c of ['unverified', 'not_verified', 'stale', 'UNAUTHENTICATED']) {
    assert.equal(signupErrorPolicy(c).reverify, true)
  }
})

test('network/unknown → retriable, no destructive branch', () => {
  const p = signupErrorPolicy('network_error')
  assert.equal(p.retriable, true)
  assert.equal(p.focusNickname, false)
  assert.equal(p.showLoginLink, false)
})

test('unknown/undefined code is retriable by default (conservative)', () => {
  assert.equal(signupErrorPolicy(undefined).retriable, true)
  assert.equal(signupErrorPolicy('some_new_code').retriable, true)
})
