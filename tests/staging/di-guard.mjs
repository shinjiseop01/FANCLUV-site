// FANCLUV — profiles privileged-column 가드(0055) 스테이징 통합 테스트 (실 REST).
// 성격: 실 DB 통합 테스트. 스테이징 전용(프로덕션 URL 이면 즉시 중단). TEST_DI_GUARD_ 계정 사용 후 정리.
// 실행:
//   STAGING_URL=https://frerrxntbtcapapvbqwb.supabase.co \
//   ANON=<anon> SERVICE_ROLE=<service_role> node tests/staging/di-guard.mjs
import { PROD_REF } from './guard.mjs'

const BASE = process.env.STAGING_URL
const ANON = process.env.ANON
const SR = process.env.SERVICE_ROLE
if (!BASE || !ANON || !SR) { console.error('STAGING_URL / ANON / SERVICE_ROLE 필요'); process.exit(1) }
if (BASE.includes(PROD_REF)) { console.error('⛔ 프로덕션 URL 감지 — 중단'); process.exit(1) }

const admin = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' }
const H = t => ({ apikey: ANON, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' })
const PW = 'Di_' + Math.random().toString(36).slice(2) + '!A9'
const R = []; const say = (n, ok, d = '') => { R.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`) }
const mk = async (tag, role) => {
  const id = (await (await fetch(`${BASE}/auth/v1/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email: `test+TEST_DI_GUARD_${tag}@fancluv.test`, password: PW, email_confirm: true }) })).json()).id
  if (role && role !== 'user') await fetch(`${BASE}/rest/v1/profiles?id=eq.${id}`, { method: 'PATCH', headers: { ...admin, Prefer: 'return=minimal' }, body: JSON.stringify({ role }) })
  return id
}
const login = async (tag) => (await (await fetch(`${BASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `test+TEST_DI_GUARD_${tag}@fancluv.test`, password: PW }) })).json()).access_token
const readP = async (id, cols) => (await (await fetch(`${BASE}/rest/v1/profiles?id=eq.${id}&select=${cols}`, { headers: admin })).json())[0]
const patch = (id, jwt, body) => fetch(`${BASE}/rest/v1/profiles?id=eq.${id}`, { method: 'PATCH', headers: { ...H(jwt), Prefer: 'return=minimal' }, body: JSON.stringify(body) })

const PROTECTED = [['role', 'admin'], ['deactivated_at', new Date().toISOString()], ['verification_status', 'phone_verified'], ['is_email_verified', false], ['identity_verified', true], ['identity_verified_at', new Date().toISOString()], ['identity_provider', 'HACK'], ['identity_ci', 'HACK'], ['identity_di', 'HACK'], ['identity_di_hash', 'HACK'], ['linked_providers', ['hack']], ['provider', 'HACK'], ['provider_user_id', 'HACK'], ['email', 'hacked@x.com']]

async function main() {
  const fanA = await mk('fanA', 'user'), fanB = await mk('fanB', 'user'), adm = await mk('admin', 'admin')
  const aJwt = await login('fanA')

  for (const [col, val] of PROTECTED) {
    const b = await readP(fanA, col)
    const r = await patch(fanA, aJwt, { [col]: val })
    const a = await readP(fanA, col)
    say(`차단 ${col}`, r.status === 403 && JSON.stringify(a[col]) === JSON.stringify(b[col]), `HTTP ${r.status}`)
  }
  // 혼합 원자성
  const nb = await readP(fanA, 'nickname')
  const rm = await patch(fanA, aJwt, { nickname: 'MIXHACK', identity_di_hash: 'X' })
  const na = await readP(fanA, 'nickname,identity_di_hash')
  say('혼합 PATCH partial 0', rm.status === 403 && na.nickname === nb.nickname && na.identity_di_hash == null)
  // 정상 self-update
  const ok = await patch(fanA, aJwt, { nickname: 'TEST_DI_ok', selected_team: 'ulsan' })
  say('정상 self-update 허용', ok.status === 204)
  // claim_profile_email 회귀
  await fetch(`${BASE}/rest/v1/profiles?id=eq.${fanA}`, { method: 'PATCH', headers: { ...admin, Prefer: 'return=minimal' }, body: JSON.stringify({ is_email_verified: false, verification_status: 'unverified', email: null }) })
  const cr = await (await fetch(`${BASE}/rest/v1/rpc/claim_profile_email`, { method: 'POST', headers: H(aJwt), body: JSON.stringify({ p_email: 'claim_di@example.com' }) })).json()
  say('claim_profile_email 정상(DEFINER 통과)', cr.ok === true)
  // 타인 수정 차단
  const bb = await readP(fanB, 'role')
  await fetch(`${BASE}/rest/v1/profiles?id=eq.${fanB}`, { method: 'PATCH', headers: { ...H(aJwt), Prefer: 'return=minimal' }, body: JSON.stringify({ role: 'admin' }) })
  say('타인 행 수정 차단(RLS)', (await readP(fanB, 'role')).role === bb.role)
  // service_role 허용
  const sr = await fetch(`${BASE}/rest/v1/profiles?id=eq.${fanB}`, { method: 'PATCH', headers: { ...admin, Prefer: 'return=minimal' }, body: JSON.stringify({ identity_di_hash: 'srv' }) })
  say('service_role privileged 변경 허용', sr.ok)

  for (const id of [fanA, fanB, adm]) await fetch(`${BASE}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: admin })
  console.log(`\n=== DI-GUARD: ${R.filter(Boolean).length}/${R.length} PASS ===`)
  process.exit(R.every(Boolean) ? 0 : 2)
}
main().catch(e => { console.error(e); process.exit(1) })
