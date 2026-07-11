// FANCLUV — 스테이징 테스트 계정/데이터 정리 (service_role, 스테이징 전용). raw fetch.
import { guardStaging } from '../staging/guard.mjs'
const g = guardStaging({ requireServiceRole: true, sizeLabel: 'CLEANUP' })
const URL = g.URL || process.env.STAGING_URL
const SR = g.serviceRole
const H = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' }

async function main() {
  const r = await fetch(`${URL}/auth/v1/admin/users?per_page=1000`, { headers: H })
  const j = await r.json().catch(() => ({}))
  const targets = (j.users || []).filter(u => (u.email || '').startsWith('test+TEST_'))
  let deleted = 0
  for (const u of targets) {
    // auth.users 삭제 → profiles/opinions/comments/likes/responses/notifications cascade
    const d = await fetch(`${URL}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: H })
    if (d.ok) deleted++
  }
  console.log(JSON.stringify({ found: targets.length, deleted }, null, 2))
}
main().catch(e => { console.error(e); process.exit(1) })
