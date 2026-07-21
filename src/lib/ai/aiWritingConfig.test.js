import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AI_OPERATIONS, AI_DEFAULTS, resolveAiConfig, isValidOperation, isValidLocale,
  normalizeLocale, validateInputLength, limitsForRole,
} from './aiWritingConfig.js'

test('operations list is fixed and closed', () => {
  assert.deepEqual(AI_OPERATIONS, ['improve', 'constructive', 'summarize', 'titles', 'structure'])
  assert.ok(isValidOperation('improve'))
  assert.ok(!isValidOperation('generate'))
  assert.ok(!isValidOperation('translate'))
})

test('locale validation + normalize', () => {
  assert.ok(isValidLocale('ko'))
  assert.ok(isValidLocale('en'))
  assert.ok(!isValidLocale('ja'))
  assert.equal(normalizeLocale('ja'), 'ko')
  assert.equal(normalizeLocale('en'), 'en')
})

test('resolveAiConfig uses defaults when env empty', () => {
  const c = resolveAiConfig({})
  assert.equal(c.ratePerMin, AI_DEFAULTS.ratePerMin)
  assert.equal(c.maxInputChars, AI_DEFAULTS.maxInputChars)
  assert.equal(c.provider, 'mock')
})

test('resolveAiConfig applies env overrides (VITE_ and bare)', () => {
  const c = resolveAiConfig({ VITE_AI_RATE_MIN: '3', AI_MAX_INPUT: '500', VITE_AI_PROVIDER: 'OpenAI' })
  assert.equal(c.ratePerMin, 3)
  assert.equal(c.maxInputChars, 500)
  assert.equal(c.provider, 'openai')
})

test('validateInputLength rejects empty/short/long', () => {
  assert.equal(validateInputLength('').code, 'too_short')
  assert.equal(validateInputLength('   ').code, 'too_short')
  assert.equal(validateInputLength('짧음').code, 'too_short')
  assert.equal(validateInputLength('a'.repeat(AI_DEFAULTS.maxInputChars + 1)).code, 'too_long')
  assert.ok(validateInputLength('이 정도면 충분히 긴 유효한 입력입니다.').ok)
})

test('limitsForRole gives admins higher but finite limits', () => {
  const user = limitsForRole('user')
  const admin = limitsForRole('admin')
  assert.equal(user.perMin, AI_DEFAULTS.ratePerMin)
  assert.equal(admin.perMin, AI_DEFAULTS.adminRatePerMin)
  assert.ok(admin.perDay > user.perDay)
  assert.ok(Number.isFinite(admin.perDay)) // 무제한 금지
})
