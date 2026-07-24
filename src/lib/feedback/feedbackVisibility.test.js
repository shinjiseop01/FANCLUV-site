import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isFanVisible, canPublish, validatePublicFields, toFanFeedback,
  FAN_PUBLIC_FIELDS, INTERNAL_FIELDS, nonEmpty,
} from './feedbackVisibility.js'

const base = (over = {}) => ({
  id: 1, club_id: 'seoul', status: 'done', is_published: true,
  public_title: '매점 대기시간을 개선했습니다',
  public_summary: '팬 의견을 반영해 동선을 개선했습니다.',
  category: 'match', ...over,
})

// 1) private(비공개) Action → 팬 미노출
test('private action is not fan-visible', () => {
  assert.equal(isFanVisible(base({ is_published: false })), false)
})

// 2) published + completed(done) → 팬 노출
test('published + completed is fan-visible', () => {
  assert.equal(isFanVisible(base()), true)
})

// 3) published + in_progress → 팬 미노출(완료 아님)
test('published but in_progress is not fan-visible', () => {
  assert.equal(isFanVisible(base({ status: 'in_progress' })), false)
})

// 4) public_title 없는 published → 미노출
test('published without public_title is not visible', () => {
  assert.equal(isFanVisible(base({ public_title: '' })), false)
  assert.equal(isFanVisible(base({ public_title: '   ' })), false)
})

// 5) public_summary 없는 published → 미노출
test('published without public_summary is not visible', () => {
  assert.equal(isFanVisible(base({ public_summary: null })), false)
})

// 6) completed 아니면 공개 불가(canPublish)
test('canPublish requires done status', () => {
  assert.equal(canPublish(base({ status: 'planned' })), false)
  assert.equal(canPublish(base({ status: 'in_progress' })), false)
  assert.equal(canPublish(base({ status: 'done' })), true)
  assert.equal(canPublish(base({ status: 'closed' })), false)
})

// 7) 공개 입력 검증 — 제목/요약 필수
test('validatePublicFields rejects empty title/summary', () => {
  assert.equal(validatePublicFields({ title: '', summary: 'x' }).code, 'missing_public_fields')
  assert.equal(validatePublicFields({ title: 'x', summary: '  ' }).code, 'missing_public_fields')
  assert.equal(validatePublicFields({ title: '제목', summary: '요약' }).ok, true)
})

// 8) completed→in_progress 로 바뀌면 미노출(트리거 미반영 상태에서도 read 방어)
test('reverting to in_progress hides even if is_published still true', () => {
  assert.equal(isFanVisible(base({ status: 'in_progress', is_published: true })), false)
})

// 9) closed 상태는 노출 아님(완료=done 만)
test('closed status is not fan-visible', () => {
  assert.equal(isFanVisible(base({ status: 'closed' })), false)
})

// 10) toFanFeedback 는 내부 필드를 제거하고 공개 필드만 남긴다
test('toFanFeedback strips internal fields', () => {
  const row = base({ description: '내부메모', result_note: '비공개', before_kpi: { x: 1 }, ai_insight_id: 'ins_1', created_by: 'uid' })
  const out = toFanFeedback(row)
  for (const f of INTERNAL_FIELDS) assert.equal(f in out, false, `${f} must be stripped`)
  for (const f of FAN_PUBLIC_FIELDS) if (f in row) assert.equal(out[f], row[f])
})

// 11) 공개 화이트리스트와 내부 필드 목록이 겹치지 않음(구조 불변식)
test('public and internal field sets are disjoint', () => {
  const overlap = FAN_PUBLIC_FIELDS.filter(f => INTERNAL_FIELDS.includes(f))
  assert.deepEqual(overlap, [])
})

// 12) nonEmpty 경계
test('nonEmpty handles null/whitespace', () => {
  assert.equal(nonEmpty(''), false)
  assert.equal(nonEmpty('   '), false)
  assert.equal(nonEmpty(null), false)
  assert.equal(nonEmpty(undefined), false)
  assert.equal(nonEmpty('a'), true)
})

// 13) null-safe
test('isFanVisible null-safe', () => {
  assert.equal(isFanVisible(null), false)
  assert.equal(isFanVisible(undefined), false)
})
