// FANCLUV — 스테이징 테스트 계정 생성 (service_role, 스테이징 전용). raw fetch(ws 의존성 회피).
// 이메일: test+TEST_<role>@fancluv.test / 비밀번호: env TEST_PW.
import { guardStaging } from '../staging/guard.mjs'
const g = guardStaging({ requireServiceRole: true, sizeLabel: 'test-accounts', cleanupCmd: 'node tests/seed/cleanup.mjs' })
const URL = g.URL || process.env.STAGING_URL
const SR = g.serviceRole
const PW = process.env.TEST_PW
if (!PW) { console.error('TEST_PW env 필요'); process.exit(1) }
const H = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' }

const ACCOUNTS = [
  ['fan-a', 'user', 'seoul', false], ['fan-b', 'user', 'seoul', false], ['fan-c', 'user', 'ulsan', false],
  ['admin', 'admin', null, false], ['staff', 'staff', null, false], ['superadmin', 'superadmin', null, false],
  ['club-seoul', 'club', 'seoul', false], ['club-ulsan', 'club', 'ulsan', false],
  ['club-admin-seoul', 'club_admin', 'seoul', false], ['disabled-user', 'user', 'seoul', true],
]
const emailFor = k => `test+TEST_${k}@fancluv.test`

async function findUser(email) {
  const r = await fetch(`${URL}/auth/v1/admin/users?per_page=200`, { headers: H })
  const j = await r.json().catch(() => ({}))
  return (j.users || []).find(u => u.email === email)?.id
}

async function main() {
  const out = {}
  for (const [key, role, team, deact] of ACCOUNTS) {
    const email = emailFor(key)
    const r = await fetch(`${URL}/auth/v1/admin/users`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ email, password: PW, email_confirm: true, user_metadata: { nickname: `TEST_${key}` } }),
    })
    const j = await r.json().catch(() => ({}))
    let id = j?.id
    if (!id) id = await findUser(email)          // 이미 존재 시
    if (!id) { out[key] = 'ERROR:' + (j?.msg || j?.error_description || r.status) ; continue }
    const patch = { role, selected_team: team, ...(deact ? { deactivated_at: new Date().toISOString() } : {}) }
    const pr = await fetch(`${URL}/rest/v1/profiles?id=eq.${id}`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(patch),
    })
    out[key] = pr.ok ? `ok(${role})` : `profile_err(${pr.status})`
  }
  console.log(JSON.stringify(out, null, 2))
}
main().catch(e => { console.error(e); process.exit(1) })
