// 핵심 회귀 테스트 — 입력/리다이렉트 안전 (node --test, 무설치).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeClubId, teamOrFilter, isSafePath, safeRedirectPath } from './safety.js'

test('safeClubId: 정상 club id 는 그대로', () => {
  assert.equal(safeClubId('seoul'), 'seoul')
  assert.equal(safeClubId('daejeon-hana'), 'daejeon-hana')
})

test('safeClubId: PostgREST 필터 인젝션 문자 제거(쉼표/점/괄호)', () => {
  assert.equal(safeClubId('x,status.eq.draft'), 'xstatuseqdraft')
  assert.equal(safeClubId('a)b(c'), 'abc')
  assert.equal(safeClubId('seoul,is_public.eq.false'), 'seoulispubliceqfalse') // 쉼표/밑줄/점 제거
})

test('teamOrFilter: 안전한 or-filter 생성 + 빈 값은 null 만', () => {
  assert.equal(teamOrFilter('seoul'), 'team_id.eq.seoul,team_id.is.null')
  assert.equal(teamOrFilter(''), 'team_id.is.null')
  assert.equal(teamOrFilter(null), 'team_id.is.null')
  // 인젝션 시도: 추가 필터를 넣을 쉼표가 살아남지 않는다(쉼표는 1개 = 정상 구분자뿐)
  const f = teamOrFilter('evil,is_public.eq.false')
  assert.equal((f.match(/,/g) || []).length, 1)
})

test('isSafePath: 내부 경로만 허용', () => {
  assert.equal(isSafePath('/club/seoul'), true)
  assert.equal(isSafePath('/reset-password'), true)
  assert.equal(isSafePath('//evil.com'), false)          // protocol-relative
  assert.equal(isSafePath('http://evil.com'), false)
  assert.equal(isSafePath('javascript:alert(1)'), false)
  assert.equal(isSafePath('/\\evil.com'), false)          // backslash trick
  assert.equal(isSafePath(''), false)
  assert.equal(isSafePath(null), false)
})

test('safeRedirectPath: 안전하지 않으면 fallback', () => {
  assert.equal(safeRedirectPath('/club/seoul'), '/club/seoul')
  assert.equal(safeRedirectPath('//evil.com'), '/')
  assert.equal(safeRedirectPath('http://evil.com', '/home'), '/home')
})
