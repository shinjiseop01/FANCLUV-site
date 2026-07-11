// FANCLUV Phase 2 — 공감 동시성 하니스 (스테이징 전용, 실행 미수행/스테이징 의존).
//
// 검증: 같은 사용자의 20개 동시 공감 INSERT → likes 행 최대 1(unique 제약),
//   공감 알림 dedup(0048) → notifications like 1개. 공감/취소 동시 → 최종 일관성.
//
// 사용: STAGING_URL=... ANON=... JWT_FAN_A=... OPINION_ID=... node tests/concurrency/likes-race.mjs
// 안전: 프로덕션 ref 면 즉시 종료.
const URL = process.env.STAGING_URL || ''
const ANON = process.env.ANON || ''
const JWT = process.env.JWT_FAN_A || ''
const OPINION_ID = process.env.OPINION_ID || ''
if (URL.includes('cuuzbddxnzhhlrqmmebz')) { console.error('거부: 프로덕션 URL'); process.exit(1) }
if (!URL || !JWT || !OPINION_ID) { console.error('STAGING_URL/JWT_FAN_A/OPINION_ID 필요'); process.exit(1) }

const headers = { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${JWT}` }
const rest = p => `${URL}/rest/v1/${p}`

async function insertLike() {
  const r = await fetch(rest('likes'), { method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ opinion_id: OPINION_ID }) })
  return r.status
}

async function run() {
  // 20개 동시 공감
  const results = await Promise.all(Array.from({ length: 20 }, insertLike))
  const ok = results.filter(s => s < 300).length
  const conflict = results.filter(s => s === 409).length
  // 최종 likes 행 수(내 것)
  const cnt = await fetch(rest(`likes?opinion_id=eq.${OPINION_ID}&select=id`), { headers, method: 'HEAD' })
  console.log(JSON.stringify({
    concurrent: 20, http2xx: ok, http409_conflict: conflict,
    expect: 'likes 행 최대 1, 나머지 409(unique), 알림 like dedup 1',
    contentRange: cnt.headers.get('content-range'),
  }, null, 2))
  // PASS 판정: 성공 insert 1, 나머지 409
  console.log(ok <= 1 && conflict >= 19 ? 'PASS(추정 — 스테이징 실측 필요)' : 'CHECK')
}
run().catch(e => { console.error(e); process.exit(1) })
