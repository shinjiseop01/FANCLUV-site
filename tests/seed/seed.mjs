// FANCLUV Phase 2 — 대량 테스트 데이터 seed (스테이징 전용, service_role 필요).
//
// 단계: small | medium (large 는 플랜/비용/시간 허용 시에만 — 이 스크립트는 실행 거부).
// 모든 데이터는 TEST_ prefix/test+ 이메일 → cleanup.mjs 로 일괄 삭제.
// 실행: STAGING_URL=... SERVICE_ROLE=... node tests/seed/seed.mjs small
//
// ⚠️ 프로덕션 ref 면 즉시 종료. service_role 은 절대 프론트/Git 에 두지 말 것(env 만).
import { createClient } from '@supabase/supabase-js'
import { guardStaging } from '../staging/guard.mjs'

const stage = process.argv[2] || 'small'
if (stage === 'large') { console.error('large 는 전용 인프라/사전승인 필요 — 이 스크립트는 실행하지 않음'); process.exit(1) }
// 중앙 안전 가드: 프로덕션/미확인/prefix/서비스롤 조건 검증 + 환경 요약 출력.
const g = guardStaging({ requireServiceRole: true, sizeLabel: stage, cleanupCmd: 'node tests/seed/cleanup.mjs' })
const URL = g.URL || process.env.STAGING_URL
const SR = g.serviceRole

const SIZES = {
  small:  { users: 100,  opinions: 1000,  comments: 5000,  likes: 10000,  responses: 1000,  notifs: 10000,  events: 10000 },
  medium: { users: 1000, opinions: 10000, comments: 50000, likes: 100000, responses: 10000, notifs: 100000, events: 100000 },
}
const N = SIZES[stage]
if (!N) { console.error('stage: small | medium'); process.exit(1) }

const db = createClient(URL, SR, { auth: { persistSession: false } })
const TEAMS = ['seoul', 'ulsan', 'jeonbuk', 'pohang', 'daejeon', 'gwangju', 'gangwon', 'gimcheon', 'jeju', 'anyang', 'incheon', 'bucheon']
const pick = a => a[Math.floor(Math.random() * a.length)]
const daysAgo = d => new Date(Date.now() - Math.random() * d * 86400000).toISOString()

// ⚠️ 실제 seed 로직(사용자 생성 → 의견/댓글/공감/응답/알림/이벤트)은 스테이징에서만 실행.
//    FK 유효·팀 분산·기간 분산·중복 제약 준수·삭제/숨김 일부 포함·TEST_ prefix.
async function main() {
  console.log(`seed ${stage}:`, N)
  // 배치 insert 예시(실행은 스테이징에서):
  // 1) auth.admin.createUser × users (test+seed_i@fancluv.test)
  // 2) opinions: title 'TEST_...', team_id 분산, status 10% hidden
  // 3) comments/likes: FK 유효, likes 는 (opinion,user) unique 준수
  // 4) survey_responses: submit_survey_response 또는 직접(unique 준수)
  // 5) notifications/activity_events: 기간 분산
  console.log('※ 이 스크립트는 스테이징 자격증명이 있을 때 실제 insert 를 수행합니다(현재는 설계·가드만).')
}
main().catch(e => { console.error(e); process.exit(1) })
