// 회귀 테스트 — 스테이징 안전 가드 (node --test).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateGuard, refFromUrl, PROD_REF } from './guard.mjs'

const staging = {
  STAGING_URL: 'https://abcdefghijklmnop.supabase.co',
  STAGING_CONFIRM: 'yes',
  TEST_DATA_PREFIX: 'TEST_',
  SERVICE_ROLE: 'sr-xyz',
}

test('정상 스테이징 env 는 통과', () => {
  assert.equal(evaluateGuard(staging, { requireServiceRole: true }).ok, true)
})

test('프로덕션 ref/URL 은 차단', () => {
  const prod = { ...staging, STAGING_URL: `https://${PROD_REF}.supabase.co` }
  const r = evaluateGuard(prod)
  assert.equal(r.ok, false)
  assert.match(r.reason, /프로덕션/)
})

test('STAGING_CONFIRM 없으면 차단', () => {
  assert.equal(evaluateGuard({ ...staging, STAGING_CONFIRM: '' }).ok, false)
})

test('TEST_DATA_PREFIX 가 TEST_ 아니면 차단', () => {
  assert.equal(evaluateGuard({ ...staging, TEST_DATA_PREFIX: 'X' }).ok, false)
})

test('쓰기 작업에 SERVICE_ROLE 없으면 차단', () => {
  assert.equal(evaluateGuard({ ...staging, SERVICE_ROLE: '' }, { requireServiceRole: true }).ok, false)
})

test('STAGING_URL 없으면 차단', () => {
  assert.equal(evaluateGuard({ ...staging, STAGING_URL: '' }).ok, false)
})

test('refFromUrl 추출', () => {
  assert.equal(refFromUrl('https://abc123.supabase.co'), 'abc123')
  assert.equal(refFromUrl('not-a-url'), '')
})
