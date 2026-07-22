import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emailCodeErrorInfo, EMAIL_CODE_MSG } from './emailCodeErrors.js'

test('provider unconfigured → service-unavailable (no internal reason leaked)', () => {
  for (const r of ['email_provider_unconfigured', 'provider_unconfigured']) {
    const i = emailCodeErrorInfo(r)
    assert.equal(i.code, 'provider_unavailable')
    assert.equal(i.message, EMAIL_CODE_MSG.serviceUnavailable)
    assert.ok(!/RESEND|API_KEY|secret/i.test(i.message)) // 시크릿/내부 사유 미노출
  }
})

test('provider send failure → generic send-failed (check email)', () => {
  assert.equal(emailCodeErrorInfo('email_send_failed').code, 'send_failed')
  assert.equal(emailCodeErrorInfo('store_failed').code, 'send_failed')
})

test('invalid email → invalid_email', () => {
  assert.equal(emailCodeErrorInfo('invalid_email').code, 'invalid_email')
  assert.equal(emailCodeErrorInfo('invalid_email').message, EMAIL_CODE_MSG.invalidEmail)
})

test('unknown/undefined reason → send_failed fallback', () => {
  assert.equal(emailCodeErrorInfo('weird_new_reason').code, 'weird_new_reason')
  assert.equal(emailCodeErrorInfo(undefined).message, EMAIL_CODE_MSG.sendFailed)
})
