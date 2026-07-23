import { test } from 'node:test'
import assert from 'node:assert/strict'
import { teamChangeErrorKey, teamChangeUiState, nextWindowText } from './teamChangePolicy.js'

test('teamChangeErrorKey: 서버 코드 → i18n 키', () => {
  assert.equal(teamChangeErrorKey('TEAM_CHANGE_WINDOW_CLOSED'), 'team.err.windowClosed')
  assert.equal(teamChangeErrorKey('TEAM_CHANGE_ALREADY_USED'), 'team.err.alreadyUsed')
  assert.equal(teamChangeErrorKey('SAME_TEAM'), 'team.err.sameTeam')
  assert.equal(teamChangeErrorKey('INVALID_TEAM'), 'team.err.invalidTeam')
  assert.equal(teamChangeErrorKey('NOT_ALLOWED'), 'team.err.notAllowed')
  assert.equal(teamChangeErrorKey('WHATEVER'), 'team.err.generic')
})

test('teamChangeUiState: can_change 이면 변경 가능', () => {
  const s = teamChangeUiState({ ok: true, can_change: true, current_team: 'seoul', role: 'user', window_open: true })
  assert.equal(s.canChange, true)
  assert.equal(s.reasonKey, null)
})

test('teamChangeUiState: 이미 사용 → alreadyUsed 사유', () => {
  const s = teamChangeUiState({ ok: true, can_change: false, current_team: 'seoul', role: 'user', window_open: true, already_used: true })
  assert.equal(s.canChange, false)
  assert.equal(s.reasonKey, 'team.reason.alreadyUsed')
})

test('teamChangeUiState: window 닫힘 → windowClosed 사유', () => {
  const s = teamChangeUiState({ ok: true, can_change: false, current_team: 'seoul', role: 'user', window_open: false })
  assert.equal(s.reasonKey, 'team.reason.windowClosed')
})

test('teamChangeUiState: 팬 아님 → notFan', () => {
  const s = teamChangeUiState({ ok: true, can_change: false, current_team: 'seoul', role: 'admin', window_open: true })
  assert.equal(s.reasonKey, 'team.reason.notFan')
})

test('teamChangeUiState: status 없음 → 안전하게 불가', () => {
  assert.equal(teamChangeUiState(null).canChange, false)
  assert.equal(teamChangeUiState({ ok: false }).canChange, false)
})

test('nextWindowText: next window 있으면 날짜, 없으면 null', () => {
  const fmt = (s) => s.slice(0, 10)
  assert.equal(nextWindowText({ next_start: '2027-01-10T00:00:00Z', next_end: '2027-01-20T00:00:00Z' }, fmt), '2027-01-10 ~ 2027-01-20')
  assert.equal(nextWindowText({ next_start: null, next_end: null }, fmt), null)
})
