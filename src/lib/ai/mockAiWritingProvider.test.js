import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runMockOperation, MockAiWritingProvider, mockHealthCheck } from './mockAiWritingProvider.js'

const base = { locale: 'ko', requestId: 'r1' }

test('rejects empty / too short / too long', () => {
  assert.equal(runMockOperation({ ...base, operation: 'improve', sourceText: '' }).code, 'too_short')
  assert.equal(runMockOperation({ ...base, operation: 'improve', sourceText: '짧다' }).code, 'too_short')
  assert.equal(runMockOperation({ ...base, operation: 'improve', sourceText: 'a'.repeat(5000) }).code, 'too_long')
})

test('deterministic: same input → same output', () => {
  const input = { ...base, operation: 'improve', sourceText: '경기장  운영이   너무   불편했어요' }
  const a = runMockOperation(input)
  const b = runMockOperation(input)
  assert.deepEqual(a.outputText, b.outputText)
  assert.deepEqual(a.titleSuggestions, b.titleSuggestions)
})

test('improve: collapses whitespace and fixes endings', () => {
  const r = runMockOperation({ ...base, operation: 'improve', sourceText: '입장   동선이  복잡합니다   안내가 부족해요' })
  assert.ok(r.success)
  assert.ok(!/ {2,}/.test(r.outputText)) // 중복 공백 제거
  assert.ok(/[.]$/.test(r.outputText.trim()))
})

test('constructive: softens aggressive tone, adds no invented facts', () => {
  const r = runMockOperation({ ...base, operation: 'constructive', sourceText: '운영 진짜 최악이다' })
  assert.ok(r.success)
  assert.ok(!r.outputText.includes('최악'))
  assert.ok(/아쉬/.test(r.outputText))
  // 사용자가 언급하지 않은 구체적 숫자/장소를 지어내지 않는다
  assert.ok(!/\d+명|\d+번 게이트/.test(r.outputText))
})

test('summarize: shortens long input', () => {
  const long = '입장 동선이 너무 복잡했습니다. '.repeat(10) + '개선을 요청드립니다.'
  const r = runMockOperation({ ...base, operation: 'summarize', sourceText: long })
  assert.ok(r.success)
  assert.ok(r.outputText.length < long.length)
})

test('titles: up to 3 candidates', () => {
  const r = runMockOperation({ ...base, operation: 'titles', sourceText: '주차장 안내가 부족해서 헤맸습니다. 개선 바랍니다.' })
  assert.ok(r.success)
  assert.ok(r.titleSuggestions.length >= 1 && r.titleSuggestions.length <= 3)
})

test('structure: labels sections, does not fabricate empty ones', () => {
  const r = runMockOperation({ ...base, operation: 'structure', sourceText: '입장할 때 안내가 없어 불편했습니다. 안내판을 늘려주세요.' })
  assert.ok(r.success)
  assert.ok(/개선 요청/.test(r.outputText))
  assert.ok(/직접 작성해 주세요/.test(r.outputText)) // 비어있는 섹션은 placeholder
})

test('safety block short-circuits (RRN)', () => {
  const r = runMockOperation({ ...base, operation: 'improve', sourceText: '제 주민번호는 900101-1234567 이고 개선 요청합니다' })
  assert.equal(r.success, false)
  assert.equal(r.code, 'safety_blocked')
})

test('locale en produces english connectors', () => {
  const r = runMockOperation({ operation: 'constructive', locale: 'en', sourceText: 'the stadium ops are the worst' })
  assert.ok(r.success)
  assert.ok(/disappointing/i.test(r.outputText))
  assert.ok(!/worst/i.test(r.outputText))
})

test('unsupported operation rejected', () => {
  assert.equal(runMockOperation({ ...base, operation: 'translate', sourceText: '충분히 긴 유효 입력입니다' }).code, 'unsupported_operation')
})

test('adapter methods map to operations + healthCheck ok', () => {
  const r = MockAiWritingProvider.improveText({ ...base, sourceText: '충분히 긴 유효한 입력입니다' })
  assert.ok(r.success)
  assert.equal(r.provider, 'mock')
  assert.equal(mockHealthCheck().ok, true)
})

test('output carries usage + provider + requestId contract', () => {
  const r = runMockOperation({ ...base, operation: 'improve', sourceText: '충분히 긴 유효한 입력입니다' })
  assert.equal(r.provider, 'mock')
  assert.equal(r.requestId, 'r1')
  assert.ok(r.usage.estimatedInputUnits > 0)
  assert.ok('safetyResult' in r)
})
