// FANCLUV — profiles privileged-column 가드(0055) 정적 회귀 테스트.
//
// 성격: 정적(SQL 파싱) 단위 테스트. 마이그레이션 SQL 을 읽어 보호 컬럼 집합과 가드 방식이
//   회귀하지 않았는지 검증한다. 실제 DB 차단 동작은 스테이징 통합 테스트
//   (tests/staging/di-guard.mjs)에서 실 REST 로 검증한다.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(resolve(here, '../../supabase/migrations/0055_extend_privileged_profile_guard.sql'), 'utf8')

// 반드시 서버가 관리하는(팬 직접 수정 금지) 컬럼 — 가드에 포함되어야 함.
const MUST_PROTECT = [
  'role', 'deactivated_at', 'verification_status', 'is_email_verified',
  'identity_verified', 'identity_verified_at', 'identity_provider',
  'identity_ci', 'identity_di', 'identity_di_hash',
  'linked_providers', 'provider', 'provider_user_id', 'email',
]
// 팬이 직접 수정 가능한 컬럼 — 가드가 이것들을 막으면 정상 UX 회귀.
const MUST_ALLOW = [
  'nickname', 'nickname_updated_at', 'avatar_url', 'selected_team',
  'gender', 'age_group', 'notification_prefs', 'updated_at',
]

test('0055 가드가 모든 서버 신뢰 컬럼을 보호한다', () => {
  for (const col of MUST_PROTECT) {
    assert.match(sql, new RegExp(`NEW\\.${col}\\s+is distinct from\\s+OLD\\.${col}`, 'i'), `보호 누락: ${col}`)
  }
})

test('0055 가드가 사용자 편집 컬럼을 막지 않는다(과잉차단 방지)', () => {
  for (const col of MUST_ALLOW) {
    assert.doesNotMatch(sql, new RegExp(`NEW\\.${col}\\s+is distinct from`, 'i'), `과잉차단: ${col}`)
  }
})

test('0055 가드는 SECURITY INVOKER + current_user 판정 + is_admin 예외', () => {
  assert.match(sql, /security invoker/i, 'SECURITY INVOKER 아님(정의자 RPC 회귀 위험)')
  assert.match(sql, /current_user\s*<>\s*'authenticated'/i, 'current_user 신뢰 컨텍스트 판정 없음')
  assert.match(sql, /public\.is_admin\(\)/i, 'is_admin 예외 없음')
  assert.match(sql, /set search_path/i, 'search_path 고정 없음')
})

test('0055 가드 오류 메시지에 값(컬럼/민감정보)을 삽입하지 않는다', () => {
  // raise exception '<메시지>' ... 의 메시지 리터럴만 추출.
  const msg = (sql.match(/raise exception\s+'([^']*)'/i)?.[1] ?? '').toLowerCase()
  assert.ok(msg.length > 0, 'raise 메시지 없음')
  // 메시지는 고정 문구여야 하며 NEW/OLD 값이나 컬럼 값을 문자열 연결(||)로 넣지 않아야 한다.
  assert.doesNotMatch(msg, /new\.|old\.|\|\|/, '오류 메시지에 행 값 삽입 의심')
  for (const bad of ['password', 'token', 'jwt', 'service_role', 'select ']) {
    assert.ok(!msg.includes(bad), `오류 메시지에 민감 토큰 포함: ${bad}`)
  }
})
