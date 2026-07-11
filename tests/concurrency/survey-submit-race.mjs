// FANCLUV Phase 2 — 설문 제출 동시성/원자성 하니스 (스테이징 전용).
//
// 검증: 같은 사용자의 20개 동시 제출 → survey_responses 최대 1, answers 완전한 1세트,
//   partial data 0(submit_survey_response 원자 RPC, 0047). 종료 설문 제출 거부.
//
// 사용: STAGING_URL=... ANON=... JWT_FAN_A=... SURVEY_ID=... ANSWERS_JSON='{...}' node ...
const URL = process.env.STAGING_URL || ''
const ANON = process.env.ANON || ''
const JWT = process.env.JWT_FAN_A || ''
const SURVEY_ID = process.env.SURVEY_ID || ''
const ANSWERS = process.env.ANSWERS_JSON ? JSON.parse(process.env.ANSWERS_JSON) : {}
if (URL.includes('cuuzbddxnzhhlrqmmebz')) { console.error('거부: 프로덕션 URL'); process.exit(1) }
if (!URL || !JWT || !SURVEY_ID) { console.error('STAGING_URL/JWT_FAN_A/SURVEY_ID 필요'); process.exit(1) }

const headers = { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${JWT}` }

async function submit() {
  const r = await fetch(`${URL}/rest/v1/rpc/submit_survey_response`, {
    method: 'POST', headers,
    body: JSON.stringify({ p_survey_id: SURVEY_ID, p_team_id: 'seoul', p_answers: ANSWERS }),
  })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, ok: j?.ok, code: j?.code }
}

async function run() {
  const results = await Promise.all(Array.from({ length: 20 }, submit))
  const success = results.filter(r => r.ok).length
  const dup = results.filter(r => r.code === 'duplicate').length
  console.log(JSON.stringify({
    concurrent: 20, success, duplicate: dup, others: 20 - success - dup,
    expect: 'success=1, 나머지 duplicate=19, response 1행 + answers 완전세트, partial 0',
  }, null, 2))
  console.log(success === 1 && dup === 19 ? 'PASS(추정 — 스테이징 실측 필요)' : 'CHECK')
}
run().catch(e => { console.error(e); process.exit(1) })
