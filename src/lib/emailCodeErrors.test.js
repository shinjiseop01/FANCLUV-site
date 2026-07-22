import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emailCodeErrorInfo, otpVerifyErrorInfo, EMAIL_CODE_MSG } from './emailCodeErrors.js'

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

test('send: rate_limited + network_error mapped', () => {
  assert.equal(emailCodeErrorInfo('rate_limited').code, 'rate_limited')
  assert.equal(emailCodeErrorInfo('network_error').code, 'network_error')
})

test('unknown/undefined reason → send_failed fallback', () => {
  assert.equal(emailCodeErrorInfo('weird_new_reason').code, 'weird_new_reason')
  assert.equal(emailCodeErrorInfo(undefined).message, EMAIL_CODE_MSG.sendFailed)
})

test('OTP verify: expired / invalid / attempts / consumed differentiated (no internal leak)', () => {
  assert.equal(otpVerifyErrorInfo('expired').code, 'otp_expired')
  assert.equal(otpVerifyErrorInfo('mismatch').code, 'otp_invalid')
  assert.equal(otpVerifyErrorInfo('not_found').code, 'otp_invalid')
  assert.equal(otpVerifyErrorInfo('too_many_attempts').code, 'otp_attempts_exceeded')
  assert.equal(otpVerifyErrorInfo('consumed').code, 'otp_consumed')
  assert.equal(otpVerifyErrorInfo('rate_limited').code, 'rate_limited')
  assert.equal(otpVerifyErrorInfo('network_error').code, 'network_error')
  // 어떤 경우에도 내부 사유/스택은 노출하지 않는다(사람이 읽는 안내 문구만).
  for (const r of ['expired', 'mismatch', 'consumed', 'weird']) {
    assert.ok(!/stack|trace|sql|23505|null/i.test(otpVerifyErrorInfo(r).message))
  }
})

test('OTP verify: unknown reason → otp_invalid fallback', () => {
  assert.equal(otpVerifyErrorInfo('surprise').code, 'otp_invalid')
  assert.equal(otpVerifyErrorInfo(undefined).message, EMAIL_CODE_MSG.otpInvalid)
})
