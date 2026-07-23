import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateInquiry, inquiryErrorKey, categoryKey, statusKey, statusBadgeClass } from './supportPolicy.js'

test('validateInquiry: 통과', () => {
  assert.equal(validateInquiry({ category: 'bug', subject: '로그인 오류', content: '로그인이 계속 실패합니다.' }), null)
})
test('validateInquiry: 잘못된 카테고리', () => {
  assert.equal(validateInquiry({ category: 'quickpoll', subject: '제목입니다', content: '충분히 긴 내용입니다.' }), 'support.err.invalidCategory')
})
test('validateInquiry: 제목 경계(1자 실패 / 100자 통과 / 101자 실패)', () => {
  assert.equal(validateInquiry({ category: 'etc', subject: 'a', content: '충분히 긴 내용입니다.' }), 'support.err.invalidSubject')
  assert.equal(validateInquiry({ category: 'etc', subject: 'a'.repeat(100), content: '충분히 긴 내용입니다.' }), null)
  assert.equal(validateInquiry({ category: 'etc', subject: 'a'.repeat(101), content: '충분히 긴 내용입니다.' }), 'support.err.invalidSubject')
})
test('validateInquiry: 본문 경계(9자 실패 / 10자 통과 / 5000자 통과 / 5001자 실패)', () => {
  assert.equal(validateInquiry({ category: 'etc', subject: '제목', content: 'a'.repeat(9) }), 'support.err.invalidContent')
  assert.equal(validateInquiry({ category: 'etc', subject: '제목', content: 'a'.repeat(10) }), null)
  assert.equal(validateInquiry({ category: 'etc', subject: '제목', content: 'a'.repeat(5000) }), null)
  assert.equal(validateInquiry({ category: 'etc', subject: '제목', content: 'a'.repeat(5001) }), 'support.err.invalidContent')
})
test('validateInquiry: 공백만 입력 거부', () => {
  assert.equal(validateInquiry({ category: 'etc', subject: '   ', content: '          ' }), 'support.err.invalidSubject')
})
test('inquiryErrorKey: 코드 매핑', () => {
  assert.equal(inquiryErrorKey('RATE_LIMITED'), 'support.err.rateLimited')
  assert.equal(inquiryErrorKey('NEED_REPLY'), 'support.err.needReply')
  assert.equal(inquiryErrorKey('WAT'), 'support.err.generic')
})
test('categoryKey/statusKey/badge', () => {
  assert.equal(categoryKey('bug'), 'support.cat.bug')
  assert.equal(categoryKey('unknown'), 'support.cat.etc')
  assert.equal(statusKey('in_progress'), 'support.status.inProgress')
  assert.equal(statusBadgeClass('resolved'), 'resolved')
  assert.equal(statusBadgeClass('pending'), 'pending')
})
