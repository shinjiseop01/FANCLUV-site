// 핵심 회귀 테스트 — 닉네임 형식 검증 (node --test).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateNicknameFormat, isValidNickname } from './nicknameValidation.js'

test('유효한 닉네임', () => {
  assert.equal(validateNicknameFormat('민준').ok, true)
  assert.equal(validateNicknameFormat('Fan99').ok, true)
  assert.equal(isValidNickname('축구팬'), true)
})

test('빈 값 / 공백', () => {
  assert.equal(validateNicknameFormat('').code, 'empty')
  assert.equal(validateNicknameFormat('   ').code, 'empty')
  assert.equal(validateNicknameFormat('가 나').code, 'has_space')
})

test('자음/모음 단독 거부', () => {
  assert.equal(validateNicknameFormat('ㅋㅋ').code, 'has_jamo')
})

test('허용 안 되는 문자(특수문자/이모지)', () => {
  assert.equal(validateNicknameFormat('a@b').code, 'invalid_char')
  assert.equal(validateNicknameFormat('팬😀').code, 'invalid_char')
  assert.equal(validateNicknameFormat('<script>').code, 'invalid_char')
})

test('너무 짧음', () => {
  assert.equal(validateNicknameFormat('a').code, 'too_short')
})

test('길이 초과', () => {
  assert.equal(validateNicknameFormat('가나다라마바사아자차').code, 'too_long_ko')
  assert.equal(validateNicknameFormat('a'.repeat(40)).code, 'too_long_en')
})
