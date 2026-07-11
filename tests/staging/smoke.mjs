// FANCLUV — 스테이징 Smoke Test (실 JWT 로 REST/RPC 검증). 스테이징 전용.
// 필요 env: STAGING_URL, ANON, STAGING_CONFIRM=yes, TEST_DATA_PREFIX=TEST_, TEST_PW, (SERVICE_ROLE)
import { evaluateGuard } from './guard.mjs'

const URL = process.env.STAGING_URL
const ANON = process.env.ANON
const PW = process.env.TEST_PW
const SR = process.env.SERVICE_ROLE
const g = evaluateGuard(process.env)
if (!g.ok) { console.error('⛔', g.reason); process.exit(1) }
if (!ANON || !PW) { console.error('ANON/TEST_PW 필요'); process.exit(1) }

const email = k => `test+TEST_${k}@fancluv.test`
const results = []
const rec = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`) }

async function login(k) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email(k), password: PW }),
  })
  const j = await r.json().catch(() => ({}))
  return { token: j.access_token, id: j.user?.id, status: r.status }
}
const auth = t => ({ apikey: ANON, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' })
const srH = () => ({ apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' })

async function main() {
  // 1) 로그인
  const fanA = await login('fan-a'); const fanB = await login('fan-b')
  const club = await login('club-seoul'); const clubU = await login('club-ulsan')
  rec('로그인 fan-a/b + club', !!(fanA.token && fanB.token && club.token), `a:${fanA.status} b:${fanB.status}`)

  // 2) fan-a 의견 작성
  let opId = null
  {
    const r = await fetch(`${URL}/rest/v1/opinions`, { method: 'POST', headers: { ...auth(fanA.token), Prefer: 'return=representation' },
      body: JSON.stringify({ title: 'TEST_smoke 의견', body: 'TEST 본문', team_id: 'seoul', author_id: fanA.id, status: 'visible', category: '기타' }) })
    const j = await r.json().catch(() => ([]))
    opId = Array.isArray(j) ? j[0]?.id : j?.id
    rec('fan-a 의견 작성', r.ok && !!opId, `http:${r.status}`)
  }

  // 3) fan-b 댓글 + 공감
  if (opId) {
    const c = await fetch(`${URL}/rest/v1/comments`, { method: 'POST', headers: auth(fanB.token),
      body: JSON.stringify({ opinion_id: opId, author_id: fanB.id, content: 'TEST 댓글', status: 'visible' }) })
    rec('fan-b 댓글 작성', c.ok, `http:${c.status}`)
    const l = await fetch(`${URL}/rest/v1/likes`, { method: 'POST', headers: auth(fanB.token),
      body: JSON.stringify({ opinion_id: opId, user_id: fanB.id }) })
    rec('fan-b 공감', l.ok, `http:${l.status}`)
    // 자기공감 차단(fan-a 가 자기 의견 공감 → 실패해야)
    const self = await fetch(`${URL}/rest/v1/likes`, { method: 'POST', headers: auth(fanA.token),
      body: JSON.stringify({ opinion_id: opId, user_id: fanA.id }) })
    rec('자기공감 차단(fan-a)', !self.ok, `http:${self.status}(거부 기대)`)
  }

  // 4) fan-a 알림 수신(트리거) — 최소 1개
  await new Promise(r => setTimeout(r, 800))
  {
    const r = await fetch(`${URL}/rest/v1/notifications?select=id,type&user_id=eq.${fanA.id}`, { headers: auth(fanA.token) })
    const j = await r.json().catch(() => ([]))
    rec('fan-a 알림 수신', Array.isArray(j) && j.length >= 1, `${j.length}건`)
  }

  // 5) RLS 격리 — fan-b 가 fan-a 알림 조회 시 0건
  {
    const r = await fetch(`${URL}/rest/v1/notifications?select=id&user_id=eq.${fanA.id}`, { headers: auth(fanB.token) })
    const j = await r.json().catch(() => ([]))
    rec('RLS: fan-b 는 타인 알림 0건', Array.isArray(j) && j.length === 0, `${j.length}건`)
  }

  // 6) 설문 제출 원자 RPC + 중복 차단 (published 설문 필요)
  {
    const sr = await fetch(`${URL}/rest/v1/surveys?select=id&status=eq.published&limit=1`, { headers: auth(fanA.token) })
    const surveys = await sr.json().catch(() => ([]))
    const sid = surveys?.[0]?.id
    if (sid) {
      const q = await fetch(`${URL}/rest/v1/survey_questions?select=id&survey_id=eq.${sid}&limit=1`, { headers: auth(fanA.token) })
      const qs = await q.json().catch(() => ([]))
      const answers = qs?.[0]?.id ? { [qs[0].id]: 'yes' } : {}
      const s1 = await fetch(`${URL}/rest/v1/rpc/submit_survey_response`, { method: 'POST', headers: auth(fanA.token),
        body: JSON.stringify({ p_survey_id: sid, p_team_id: 'seoul', p_answers: answers }) })
      const j1 = await s1.json().catch(() => ({}))
      const s2 = await fetch(`${URL}/rest/v1/rpc/submit_survey_response`, { method: 'POST', headers: auth(fanA.token),
        body: JSON.stringify({ p_survey_id: sid, p_team_id: 'seoul', p_answers: answers }) })
      const j2 = await s2.json().catch(() => ({}))
      rec('설문 제출(원자 RPC)', j1?.ok === true || j2?.code === 'duplicate', `1st:${JSON.stringify(j1).slice(0, 40)}`)
      rec('중복 설문 제출 차단', j2?.code === 'duplicate' || j2?.ok === false, `2nd:${j2?.code}`)
    } else {
      rec('설문 제출/중복(published 설문 없음 — 스킵)', true, 'no published survey')
    }
  }

  // 7) 비로그인(anon) 보호 리소스 접근 차단 — notifications 조회 0 또는 거부
  {
    const r = await fetch(`${URL}/rest/v1/notifications?select=id&limit=1`, { headers: { apikey: ANON } })
    const j = await r.json().catch(() => ([]))
    rec('anon 보호 리소스 차단', (Array.isArray(j) && j.length === 0) || r.status === 401, `http:${r.status} len:${Array.isArray(j) ? j.length : '-'}`)
  }

  const pass = results.filter(r => r.pass).length
  console.log(`\n=== SMOKE: ${pass}/${results.length} PASS ===`)
  process.exit(pass === results.length ? 0 : 2)
}
main().catch(e => { console.error(e); process.exit(1) })
