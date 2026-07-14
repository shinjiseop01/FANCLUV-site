// FANCLUV — 팀 뉴스 상태/태그/필터 순수 로직 테스트.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NEWS_STATUSES, canTransition, transitionAction, normalizeTags,
  sortSpec, normalizeFilters, NEWS_TRANSITIONS,
} from './newsStatus.js'

test('상태 4종', () => {
  assert.deepEqual([...NEWS_STATUSES].sort(), ['archived', 'draft', 'published', 'scheduled'])
})

test('canTransition: 허용 전이', () => {
  assert.equal(canTransition('draft', 'published'), true)
  assert.equal(canTransition('draft', 'scheduled'), true)
  assert.equal(canTransition('scheduled', 'published'), true)
  assert.equal(canTransition('published', 'archived'), true)
  assert.equal(canTransition('archived', 'draft'), true)
})

test('canTransition: 금지 전이 (published→draft, archived→published)', () => {
  assert.equal(canTransition('published', 'draft'), false)
  assert.equal(canTransition('archived', 'published'), false)
  assert.equal(canTransition('published', 'scheduled'), false)
  assert.equal(canTransition('draft', 'draft'), false)
  assert.equal(canTransition('nope', 'published'), false)
})

test('전이 매트릭스 대칭성 확인(published 는 archived 만)', () => {
  assert.deepEqual(NEWS_TRANSITIONS.published, ['archived'])
  assert.deepEqual(NEWS_TRANSITIONS.archived, ['draft'])
})

test('transitionAction 매핑', () => {
  assert.equal(transitionAction('draft', 'published'), 'news.publish')
  assert.equal(transitionAction('draft', 'scheduled'), 'news.schedule')
  assert.equal(transitionAction('published', 'archived'), 'news.archive')
  assert.equal(transitionAction('archived', 'draft'), 'news.restore')
  assert.equal(transitionAction('scheduled', 'draft'), 'news.draft')
})

test('normalizeTags: 트림 + 대소문자무시 중복제거 + 순서유지 + 빈값제거', () => {
  assert.deepEqual(normalizeTags(['선수', ' 감독 ', '선수', 'MD', 'md', '']), ['선수', '감독', 'MD'])
  assert.deepEqual(normalizeTags(['A', 'b', 'a', 'B']), ['A', 'b'])
  assert.deepEqual(normalizeTags([]), [])
  assert.deepEqual(normalizeTags(null), [])
})

test('sortSpec', () => {
  assert.deepEqual(sortSpec('newest'), { column: 'created_at', ascending: false })
  assert.deepEqual(sortSpec('oldest'), { column: 'created_at', ascending: true })
  assert.deepEqual(sortSpec('views'), { column: 'view_count', ascending: false })
  assert.deepEqual(sortSpec('schedule'), { column: 'publish_at', ascending: true })
  assert.deepEqual(sortSpec('bogus'), { column: 'created_at', ascending: false }) // fallback
})

test('normalizeFilters: 유효값만 통과', () => {
  const f = normalizeFilters({ status: 'published', team: 'fcseoul', q: ' hi ', pinned: true, bad: 'x', junk: 1 })
  assert.deepEqual(f, { status: 'published', team: 'fcseoul', pinned: true, q: 'hi' })
  assert.deepEqual(normalizeFilters({ status: 'invalid' }), {})
  assert.deepEqual(normalizeFilters({ pinned: false }), {})
})
