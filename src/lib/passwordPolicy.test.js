// passwordPolicy 회귀 방지 테스트 — 비밀번호 최소 길이(8) + 새 비밀번호 폼 검증 우선순위.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MIN_PASSWORD_LENGTH, isPasswordLongEnough, validateNewPassword } from './passwordPolicy.js'

test('MIN_PASSWORD_LENGTH 는 8', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8)
})

test('isPasswordLongEnough: 7자 거부 / 8자·9자 허용', () => {
  assert.equal(isPasswordLongEnough('1234567'), false)   // 7
  assert.equal(isPasswordLongEnough('12345678'), true)   // 8
  assert.equal(isPasswordLongEnough('123456789'), true)  // 9
  assert.equal(isPasswordLongEnough(''), false)
  assert.equal(isPasswordLongEnough(null), false)
})

// P0-1: 7자 → 길이 오류
test('P0-1 7자 제출 → errLen', () => {
  const r = validateNewPassword('1234567', '1234567')
  assert.equal(r.ok, false)
  assert.equal(r.errorKey, 'resetPw.errLen')
})

// P0-2: 정확히 8자 → 길이 오류 미표시(통과)
test('P0-2 정확히 8자 일치 → ok', () => {
  const r = validateNewPassword('abcd1234', 'abcd1234')
  assert.deepEqual(r, { ok: true })
})

// P0-3: 9자 이상 → 통과
test('P0-3 9자 이상 일치 → ok', () => {
  const r = validateNewPassword('abcd12345', 'abcd12345')
  assert.equal(r.ok, true)
})

// P0-4: 8자 이상이지만 확인 불일치 → 불일치 오류(길이 오류 아님)
test('P0-4 8자+ 불일치 → errMatch (길이 아님)', () => {
  const r = validateNewPassword('abcd1234', 'abcd9999')
  assert.equal(r.ok, false)
  assert.equal(r.errorKey, 'resetPw.errMatch')
})

// 붙여넣기(8자 이상) 상황 = 단순 값 검증이므로 동일하게 통과
test('붙여넣기 8자 이상 → ok', () => {
  assert.equal(validateNewPassword('PastedPw1', 'PastedPw1').ok, true)
})

// 검증 우선순위: 미입력 → 길이 → 확인 미입력 → 불일치
test('우선순위: 새 비번 미입력 → errNew', () => {
  assert.equal(validateNewPassword('', '').errorKey, 'resetPw.errNew')
})
test('우선순위: 길이 통과 후 확인 미입력 → errConfirm', () => {
  const r = validateNewPassword('abcd1234', '')
  assert.equal(r.errorKey, 'resetPw.errConfirm')
})

// 8자 미만이 우선(확인 불일치보다 길이 먼저)
test('7자 + 불일치 → 길이 오류가 우선', () => {
  assert.equal(validateNewPassword('12345', '9').errorKey, 'resetPw.errLen')
})
