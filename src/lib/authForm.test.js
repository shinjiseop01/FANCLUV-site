// FANCLUV — 인증 폼 순수 헬퍼 테스트(이메일 형식 / 재전송 쿨다운 / 회원가입 단계).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidEmail, RESEND_COOLDOWN_SEC, resendButtonState, SIGNUP_STEPS, signupProgress, pickStores,
} from './authForm.js'

// 브라우저 Storage 를 흉내내는 순수 mock(테스트 전용).
function mockStore() {
  const m = new Map()
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    get size() { return m.size },
  }
}

// ── 이메일 형식 검증 ──
test('isValidEmail — 유효한 주소 통과', () => {
  for (const e of [
    'a@b.co', 'user@example.com', 'first.last@sub.domain.io',
    'user+tag@gmail.com', 'x_y-z@my-domain.co.kr', 'name123@a.dev',
  ]) assert.equal(isValidEmail(e), true, e)
})

test('isValidEmail — 앞뒤 공백은 trim 후 판정', () => {
  assert.equal(isValidEmail('  user@example.com  '), true)
})

test('isValidEmail — 형식 오류 거부', () => {
  for (const e of [
    '', '   ', 'plainaddress', 'no-at-sign.com', '@no-local.com', 'no-domain@',
    'a@b', 'a@b.c', 'double@@at.com', 'space in@local.com', 'user@dom ain.com',
    'user@-lead.com', 'user@trail-.com', 'user@.dot.com', 'user@dot..com',
    '.lead@example.com', 'trail.@example.com', 'a..b@example.com', 'user@example.c',
  ]) assert.equal(isValidEmail(e), false, e)
})

test('isValidEmail — 과도한 길이 거부', () => {
  const longLocal = 'a'.repeat(65) + '@example.com'
  assert.equal(isValidEmail(longLocal), false)
  const longTotal = 'a'.repeat(250) + '@example.com'
  assert.equal(isValidEmail(longTotal), false)
})

test('isValidEmail — null/undefined 안전', () => {
  assert.equal(isValidEmail(null), false)
  assert.equal(isValidEmail(undefined), false)
})

// ── 세션 저장소 라우팅(로그인 상태 유지) ──
test('pickStores — keep=true 는 local 이 활성, session 이 반대편', () => {
  const local = mockStore(); const session = mockStore()
  const { active, other } = pickStores(true, local, session)
  assert.equal(active, local)
  assert.equal(other, session)
})

test('pickStores — keep=false 는 session 이 활성, local 이 반대편', () => {
  const local = mockStore(); const session = mockStore()
  const { active, other } = pickStores(false, local, session)
  assert.equal(active, session)
  assert.equal(other, local)
})

test('저장소 정책 — keep=false 는 sessionStorage 에만 쓰고 local 잔재 제거', () => {
  const local = mockStore(); const session = mockStore()
  // 이전에 영구 세션이 local 에 남아있었다고 가정
  local.setItem('tok', 'old')
  const { active, other } = pickStores(false, local, session)
  other.removeItem('tok'); active.setItem('tok', 'new')
  assert.equal(local.getItem('tok'), null)      // local 잔재 제거됨
  assert.equal(session.getItem('tok'), 'new')   // session 에만 존재
})

test('저장소 정책 — keep=true 는 localStorage 에 쓰고 session 잔재 제거', () => {
  const local = mockStore(); const session = mockStore()
  session.setItem('tok', 'sess')
  const { active, other } = pickStores(true, local, session)
  other.removeItem('tok'); active.setItem('tok', 'perm')
  assert.equal(session.getItem('tok'), null)
  assert.equal(local.getItem('tok'), 'perm')
})

// ── 재전송 쿨다운 ──
test('RESEND_COOLDOWN_SEC 는 60초', () => assert.equal(RESEND_COOLDOWN_SEC, 60))

test('resendButtonState — 발송 중이면 비활성(sending)', () => {
  assert.deepEqual(resendButtonState({ sending: true, cooldown: 0, codeSent: false }),
    { disabled: true, key: 'sending', seconds: 0 })
})

test('resendButtonState — 쿨다운 중이면 비활성 + 남은 초', () => {
  assert.deepEqual(resendButtonState({ sending: false, cooldown: 42, codeSent: true }),
    { disabled: true, key: 'cooldown', seconds: 42 })
})

test('resendButtonState — 발송 이력 있으면 재전송 활성', () => {
  assert.deepEqual(resendButtonState({ sending: false, cooldown: 0, codeSent: true }),
    { disabled: false, key: 'resend', seconds: 0 })
})

test('resendButtonState — 최초 상태는 발송(send)', () => {
  assert.deepEqual(resendButtonState({}),
    { disabled: false, key: 'send', seconds: 0 })
})

test('resendButtonState — sending 이 cooldown 보다 우선', () => {
  assert.equal(resendButtonState({ sending: true, cooldown: 30 }).key, 'sending')
})

// ── 회원가입 단계 ──
test('SIGNUP_STEPS 순서', () => assert.deepEqual(SIGNUP_STEPS, ['email', 'code', 'profile', 'done']))

test('signupProgress — 초기(아무 입력 없음)는 ① 이메일 active', () => {
  const { currentIndex, steps } = signupProgress({})
  assert.equal(currentIndex, 1)
  assert.equal(steps[0].status, 'active')
  assert.equal(steps[1].status, 'todo')
})

test('signupProgress — 이메일 형식 OK → ② 인증 active, ① done', () => {
  const { currentIndex, steps } = signupProgress({ emailValid: true })
  assert.equal(currentIndex, 2)
  assert.equal(steps[0].status, 'done')
  assert.equal(steps[1].status, 'active')
})

test('signupProgress — 코드 발송(미검증)도 여전히 ② 인증 단계', () => {
  const { currentIndex } = signupProgress({ emailValid: true, codeSent: true })
  assert.equal(currentIndex, 2)
})

test('signupProgress — 이메일 인증 완료 → ③ 프로필 active', () => {
  const { currentIndex, steps } = signupProgress({ emailValid: true, codeSent: true, emailVerified: true })
  assert.equal(currentIndex, 3)
  assert.equal(steps[1].status, 'done')
  assert.equal(steps[2].status, 'active')
})

test('signupProgress — 프로필 완료 → ④ 완료 active', () => {
  const { currentIndex, steps } = signupProgress({
    emailValid: true, codeSent: true, emailVerified: true, profileComplete: true,
  })
  assert.equal(currentIndex, 4)
  assert.equal(steps[2].status, 'done')
  assert.equal(steps[3].status, 'active')
})

test('signupProgress — done 이면 모든 단계 done', () => {
  const { currentIndex, steps } = signupProgress({
    emailValid: true, codeSent: true, emailVerified: true, profileComplete: true, done: true,
  })
  assert.equal(currentIndex, 4)
  assert.ok(steps.every(s => s.status === 'done'))
})

test('signupProgress — 프로필 먼저 채워도 인증 전이면 ③ 로 건너뛰지 않음', () => {
  // emailVerified=false 인데 profileComplete=true → 여전히 ② 인증 단계에 머문다.
  const { currentIndex } = signupProgress({ emailValid: true, profileComplete: true })
  assert.equal(currentIndex, 2)
})
