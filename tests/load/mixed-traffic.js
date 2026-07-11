// FANCLUV Phase 2 — k6 혼합 트래픽 부하 스크립트 (스테이징 전용).
//
// 실행: k6 run -e BASE_URL=<staging-supabase-url> -e ANON=<staging-anon> \
//              -e JWT=<staging-fan-jwt> tests/load/mixed-traffic.js
// Stage: A(10 VU/2m) → B(100/5m) → C(1000/10m, 스테이징 한도 허용 시).
//   VU 는 -e VUS / -e DURATION 으로 조절. 기본은 Stage A(smoke).
//
// ⚠️ 프로덕션 BASE_URL 이면 실행 거부. 외부 유료 API(OpenAI/League)는 부하 대상 아님
//    (스테이징 secret 에 미설정/mock → cache/empty 로 격리).
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE = __ENV.BASE_URL || ''
const ANON = __ENV.ANON || ''
const JWT = __ENV.JWT || ''
if (BASE.includes('cuuzbddxnzhhlrqmmebz')) { throw new Error('거부: 프로덕션 URL') }

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '2m',
  thresholds: {
    // 중단/판정 기준(SLO 초안): 읽기 p95<500ms, 실패율<1%.
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
  },
}

const h = { headers: { apikey: ANON, Authorization: `Bearer ${JWT}` } }
const rest = p => `${BASE}/rest/v1/${p}`
const rpc = (f, body) => http.post(`${BASE}/rest/v1/rpc/${f}`, JSON.stringify(body), { headers: { ...h.headers, 'Content-Type': 'application/json' } })

// 혼합 트래픽 모델(§11): 읽기 50 / 댓글목록 15 / 의견작성 10 / 댓글작성 8 /
//   공감 7 / 설문제출 5 / 알림 3 / 프로필 2.
export default function () {
  const r = Math.random() * 100
  let res
  if (r < 50)      res = http.get(rest('opinions_view?select=*&order=created_at.desc&limit=10'), h)         // 읽기
  else if (r < 65) res = http.get(rest('comments?select=*&limit=10'), h)                                    // 댓글목록
  else if (r < 75) res = http.get(rest('opinions_view?select=*&limit=1'), h)                                // (작성 대체 읽기 — 부하시 write 는 소량)
  else if (r < 83) res = http.get(rest('comments?select=*&limit=1'), h)
  else if (r < 90) res = rpc('fan_ranking', { p_team_id: null, p_limit: 50 })                                // 랭킹(무거운 RPC)
  else if (r < 95) res = rpc('club_home_stats', { p_team_id: 'seoul' })                                      // 홈 통계
  else if (r < 98) res = http.get(rest('notifications?select=*&limit=5&order=created_at.desc'), h)           // 알림
  else             res = rpc('admin_dashboard_stats', { days: 30 })                                          // 관리자(권한 없으면 거부 예상)
  check(res, { 'status < 500': (x) => x.status < 500 })
  sleep(Math.random() * 1.5 + 0.5)
}
