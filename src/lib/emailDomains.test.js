import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ALLOWED_EMAIL_DOMAINS, isAllowedEmailDomain, emailDomain } from './emailDomains.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '..', '..')

// ── 허용 도메인 예시(스펙) ──
const ALLOWED = [
  'user@gmail.com', 'user.name+test@gmail.com', 'user@googlemail.com',
  'user@naver.com', 'user@daum.net', 'user@hanmail.net', 'user@kakao.com',
  'user@yahoo.com', 'user@yahoo.co.kr', 'user@msn.com', 'user@outlook.com',
  'user@hotmail.com', 'user@zum.com', 'user@nate.com', 'user@icloud.com',
]
for (const e of ALLOWED) {
  test(`allow: ${e}`, () => assert.equal(isAllowedEmailDomain(e), true))
}

// ── 차단 예시(스펙) ──
const BLOCKED = [
  'user@asd.com', 'user@gmail.co', 'user@daum.com', 'user@gmail.com.fake.com',
  'user@naver.org', 'user@company.com', 'user@school.ac.kr', 'user@', '@gmail.com',
  'user..name@gmail.com', 'user@mail.gmail.com' /* 서브도메인 */, 'user@naver.com.example.org',
  'user@xn--test.com' /* punycode */, 'notanemail',
]
for (const e of BLOCKED) {
  test(`block: ${e}`, () => assert.equal(isAllowedEmailDomain(e), false))
}

// ── 정규화: 대소문자/공백 ──
test('대소문자 혼용 도메인 정규화 후 허용', () => {
  assert.equal(isAllowedEmailDomain('User@GMAIL.CoM'), true)
})
test('앞뒤 공백 제거 후 허용', () => {
  assert.equal(isAllowedEmailDomain('  user@naver.com  '), true)
})
test('+ 별칭 로컬파트 허용', () => {
  assert.equal(isAllowedEmailDomain('user+beta@daum.net'), true)
})
test('emailDomain 추출', () => {
  assert.equal(emailDomain('a@b.com'), 'b.com')
  assert.equal(emailDomain('bad'), null)
})

// ── 드리프트 방지: Edge 사본이 JS 정본과 정확히 일치 ──
function extractEdgeList(relPath) {
  const src = readFileSync(join(root, relPath), 'utf8')
  const m = src.match(/ALLOWED_EMAIL_DOMAINS\s*=\s*\[([\s\S]*?)\]/)
  assert.ok(m, `ALLOWED_EMAIL_DOMAINS not found in ${relPath}`)
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
}
for (const edge of [
  'supabase/functions/send-email-code/index.ts',
  'supabase/functions/complete-signup/index.ts',
]) {
  test(`domain drift guard: ${edge} == emailDomains.js`, () => {
    assert.deepEqual(extractEdgeList(edge), ALLOWED_EMAIL_DOMAINS)
  })
}
