// FANCLUV — Quick Poll 순수 로직 테스트.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  QP_STATES, QP_TRANSITIONS, canTransition, transitionAction, validateOptions, optionsFromLabels,
  contextNeedsId, validateContext, voterMode, shouldShowResults, computeRatios, remainingLabel, voteErrorKey,
} from './quickPollStatus.js'

test('상태 4종', () => assert.deepEqual([...QP_STATES].sort(), ['active', 'archived', 'closed', 'draft']))

test('canTransition 매트릭스', () => {
  assert.equal(canTransition('draft', 'active'), true)
  assert.equal(canTransition('active', 'closed'), true)
  assert.equal(canTransition('closed', 'active'), true)
  assert.equal(canTransition('active', 'archived'), true)
  assert.equal(canTransition('archived', 'draft'), true)
  assert.equal(canTransition('archived', 'active'), false)
  assert.equal(canTransition('active', 'draft'), false)
  assert.deepEqual(QP_TRANSITIONS.archived, ['draft'])
})

test('transitionAction', () => {
  assert.equal(transitionAction('active'), 'quick_poll.activate')
  assert.equal(transitionAction('closed'), 'quick_poll.close')
  assert.equal(transitionAction('archived'), 'quick_poll.archive')
  assert.equal(transitionAction('draft'), 'quick_poll.restore')
})

test('validateOptions: 2~4, {id,label}, 중복금지', () => {
  assert.equal(validateOptions([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]).ok, true)
  assert.equal(validateOptions([{ id: 'a', label: 'A' }]).code, 'invalid_options')
  assert.equal(validateOptions(Array.from({ length: 5 }, (_, i) => ({ id: 'o' + i, label: 'x' }))).code, 'invalid_options')
  assert.equal(validateOptions([{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }]).code, 'dup_option')
  assert.equal(validateOptions([{ id: 'a', label: '' }, { id: 'b', label: 'B' }]).code, 'empty_option')
})

test('optionsFromLabels', () => {
  assert.deepEqual(optionsFromLabels(['예', '아니오', '']), [{ id: 'a', label: '예' }, { id: 'b', label: '아니오' }])
})

test('context validation: match 비활성, news/opinion id 필수', () => {
  assert.equal(contextNeedsId('news'), true); assert.equal(contextNeedsId('home'), false)
  assert.equal(validateContext('match', 'x').code, 'match_unavailable')
  assert.equal(validateContext('news', null).code, 'invalid_context')
  assert.equal(validateContext('news', 'abc').ok, true)
  assert.equal(validateContext('home', null).ok, true)
  assert.equal(validateContext('bogus', null).code, 'invalid_context_type')
})

test('voterMode: DI 우선, 없으면 user', () => {
  assert.equal(voterMode({ identity_di_hash: 'H' }), 'di')
  assert.equal(voterMode({ identityDiHash: 'H' }), 'di')
  assert.equal(voterMode({}), 'user')
  assert.equal(voterMode(null), 'user')
})

test('shouldShowResults: 공개 정책', () => {
  assert.equal(shouldShowResults({ resultVisibility: 'always' }), true)
  assert.equal(shouldShowResults({ resultVisibility: 'after_vote', hasVoted: false }), false)
  assert.equal(shouldShowResults({ resultVisibility: 'after_vote', hasVoted: true }), true)
  assert.equal(shouldShowResults({ resultVisibility: 'after_close', status: 'active' }), false)
  assert.equal(shouldShowResults({ resultVisibility: 'after_close', status: 'closed' }), true)
  assert.equal(shouldShowResults({ resultVisibility: 'after_vote', hasVoted: false, isAdmin: true }), true)
  assert.equal(shouldShowResults({ resultVisibility: 'after_vote', hasVoted: false, allowResultBeforeVote: true }), true)
})

test('computeRatios + 0 division', () => {
  const r = computeRatios([{ id: 'a', votes: 3 }, { id: 'b', votes: 1 }], 4)
  assert.equal(r[0].ratio, 75); assert.equal(r[1].ratio, 25)
  assert.equal(computeRatios([{ id: 'a', votes: 0 }], 0)[0].ratio, 0)
})

test('remainingLabel', () => {
  const t = (k, o) => (o ? `${k}:${o.n}` : k)
  assert.equal(remainingLabel(null, t), null)
  assert.equal(remainingLabel(new Date(Date.now() - 1000).toISOString(), t), 'qp.ended')
  assert.equal(remainingLabel(new Date(Date.now() + 2 * 86400e3).toISOString(), t), 'qp.dleft:2')
  assert.equal(remainingLabel(new Date(Date.now() + 3 * 3600e3).toISOString(), t), 'qp.hleft:3')
})

test('voteErrorKey', () => {
  assert.equal(voteErrorKey('already_voted'), 'qp.err.already_voted')
  assert.equal(voteErrorKey('expired'), 'qp.err.expired')
  assert.equal(voteErrorKey('unauthorized'), 'qp.err.login')
  assert.equal(voteErrorKey('weird'), 'qp.err.generic')
})
