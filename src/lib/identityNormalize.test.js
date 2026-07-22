import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeEmail, normalizeNickname, sameNormalized } from './identityNormalize.js'

test('email: case + surrounding whitespace collapse to one canonical', () => {
  assert.equal(normalizeEmail(' User@Example.COM '), 'user@example.com')
  assert.equal(normalizeEmail('user@example.com'), 'user@example.com')
  assert.equal(normalizeEmail('USER@EXAMPLE.COM'), 'user@example.com')
})

test('email: empty / whitespace-only / null / non-string → null', () => {
  assert.equal(normalizeEmail(''), null)
  assert.equal(normalizeEmail('   '), null)
  assert.equal(normalizeEmail(null), null)
  assert.equal(normalizeEmail(undefined), null)
  assert.equal(normalizeEmail(123), null)
})

test('email: NFC-equivalent forms collapse (é composed vs decomposed)', () => {
  const composed = 'josé@x.com'                 // U+00E9
  const decomposed = 'josé@x.com'          // e + combining acute
  assert.equal(normalizeEmail(composed), normalizeEmail(decomposed))
})

test('nickname: FanCluv / fancluv / " FANCLUV " are the same normalized', () => {
  assert.equal(normalizeNickname('FanCluv'), 'fancluv')
  assert.equal(normalizeNickname('fancluv'), 'fancluv')
  assert.equal(normalizeNickname(' FANCLUV '), 'fancluv')
  assert.ok(sameNormalized('FanCluv', ' fancluv '))
})

test('nickname: NFC-equivalent Hangul forms collapse', () => {
  // 각(composed) vs ㄱ+ㅏ+ㄱ(decomposed jamo) → NFC 후 동일
  const composed = '각'                      // 각
  const decomposed = '각'        // ᄀ ᅡ ᆨ
  assert.equal(normalizeNickname(composed), normalizeNickname(decomposed))
})

test('nickname: full-width stays distinct under NFC (NFKC not applied — documented)', () => {
  // 요구 기준은 NFC. 전각 문자는 ASCII 로 접히지 않는다(NFKC 미도입).
  assert.notEqual(normalizeNickname('ＦＡＮＣＬＵＶ'), normalizeNickname('FANCLUV'))
})

test('nickname: empty / whitespace-only / null → null', () => {
  assert.equal(normalizeNickname(''), null)
  assert.equal(normalizeNickname('   '), null)
  assert.equal(normalizeNickname(null), null)
})

test('sameNormalized: null-safe (both empty → not "same")', () => {
  assert.equal(sameNormalized('', ''), false)
  assert.equal(sameNormalized('a', 'A'), true)
  assert.equal(sameNormalized('a', 'b'), false)
})
