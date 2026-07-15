// FANCLUV — Fan Pulse 상태/옵션/집계 순수 로직 테스트.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PULSE_STATES, PULSE_TRANSITIONS, canTransition, transitionAction,
  validateOptions, optionsFromLabels, computeRatios,
} from './pulseStatus.js'

test('상태 3종', () => {
  assert.deepEqual([...PULSE_STATES].sort(), ['active', 'archived', 'closed'])
})

test('canTransition: active↔closed, →archived; archived 종단', () => {
  assert.equal(canTransition('active', 'closed'), true)
  assert.equal(canTransition('closed', 'active'), true)   // 재개
  assert.equal(canTransition('active', 'archived'), true)
  assert.equal(canTransition('closed', 'archived'), true)
  assert.equal(canTransition('archived', 'active'), false)
  assert.equal(canTransition('archived', 'closed'), false)
  assert.deepEqual(PULSE_TRANSITIONS.archived, [])
})

test('transitionAction 매핑', () => {
  assert.equal(transitionAction('closed'), 'pulse.close')
  assert.equal(transitionAction('active'), 'pulse.reopen')
  assert.equal(transitionAction('archived'), 'pulse.archive')
})

test('validateOptions: 2~6, {id,label}, id 중복 금지', () => {
  assert.equal(validateOptions([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]).ok, true)
  assert.equal(validateOptions([{ id: 'a', label: 'A' }]).code, 'invalid_options') // 1개
  assert.equal(validateOptions(Array.from({ length: 7 }, (_, i) => ({ id: 'o' + i, label: 'x' }))).code, 'invalid_options') // 7개
  assert.equal(validateOptions([{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }]).code, 'dup_option')
  assert.equal(validateOptions([{ id: 'a', label: '' }, { id: 'b', label: 'B' }]).code, 'empty_option')
  assert.equal(validateOptions('nope').code, 'invalid_options')
})

test('optionsFromLabels: 라벨→{id,label} + 빈값 제거 + 순서 id', () => {
  assert.deepEqual(optionsFromLabels(['찬성', '반대', '']), [{ id: 'a', label: '찬성' }, { id: 'b', label: '반대' }])
  assert.deepEqual(optionsFromLabels([]), [])
})

test('computeRatios: 비율 계산 + 0 division 안전', () => {
  const r = computeRatios([{ id: 'a', votes: 3 }, { id: 'b', votes: 1 }], 4)
  assert.equal(r[0].ratio, 75); assert.equal(r[1].ratio, 25)
  const z = computeRatios([{ id: 'a', votes: 0 }, { id: 'b', votes: 0 }], 0)
  assert.equal(z[0].ratio, 0)
  // total 미제공 시 합산
  const s = computeRatios([{ id: 'a', votes: 1 }, { id: 'b', votes: 1 }])
  assert.equal(s[0].ratio, 50)
})
