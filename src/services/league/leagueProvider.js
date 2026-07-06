// FANCLUV — League Provider (facade).
//
// K리그1 순위/일정/결과의 단일 진입점. 화면(matchRepo 경유) 은 이 파일만 호출한다.
// 환경변수로 Provider 를 선택하고(기본 mock), 5분 캐시 + 실패 폴백을 적용한다.
//
// Provider 선택 (요구사항 1/2/10)
//   - VITE_LEAGUE_PROVIDER=edge → Edge Function league-fetcher (운영 권장: API 키 서버 보관)
//   - LEAGUE_PROVIDER=api        → 클라이언트 직접 API (VITE_LEAGUE_API_BASE, 공개/키없는 소스용)
//   - LEAGUE_PROVIDER=mock       → Mock (기본값)
//   - 미지정 시: edge 가능하면 edge, API Base 있으면 api, 아니면 mock 자동 선택.
//   (LEAGUE_PROVIDER 노출을 위해 vite.config 의 envPrefix 에 'LEAGUE_' 추가)
//
// 캐시/폴백 (요구사항 8/10/11)
//   - 순위 5분 / 경기 5분 캐시(withCache). Edge Function 도 서버에서 동일 TTL 로 캐시.
//   - 실패 시: 마지막 성공 데이터(lastGood) → 없으면 Mock. 사용자엔 에러 대신 폴백 데이터.
import { withCache, invalidate } from '../../lib/cache.js'
import * as mock from './mockLeagueProvider.js'
import * as api from './apiLeagueProvider.js'
import * as edge from './edgeLeagueProvider.js'

const STANDINGS_TTL = 5 * 60 * 1000  // 순위 5분
const FIXTURES_TTL = 5 * 60 * 1000   // 경기(일정+결과) 5분 — 결과 신선도 우선(일정 10분 요건 포함)

const MODE = String(import.meta.env?.LEAGUE_PROVIDER || import.meta.env?.VITE_LEAGUE_PROVIDER || '').toLowerCase()
// 우선순위: edge(명시 또는 가능+미지정) → api(명시 또는 base 설정) → mock
const active =
  (MODE === 'edge' && edge.isEdgeLeagueEnabled) ? edge
  : (MODE !== 'mock' && MODE !== 'api' && edge.isEdgeLeagueEnabled) ? edge
  : (MODE === 'api' || (MODE !== 'mock' && api.isApiConfigured)) ? api
  : mock

// 현재 활성 Provider 종류 ('edge' | 'api' | 'mock')
export function leagueMode() { return active === edge ? 'edge' : active === api ? 'api' : 'mock' }
// 실데이터(비-Mock) 활성 여부 — 화면의 실시간 배지 등에 사용.
export const isLeagueApiActive = active !== mock

const lastGood = new Map()

// primary(활성 Provider) 시도 → 유효하면 캐시/반환, 실패·빈값이면 lastGood → Mock.
async function withFallback(key, primaryFn, mockFn, isValid) {
  try {
    const value = await primaryFn()
    if (isValid(value)) { lastGood.set(key, value); return { source: leagueMode(), value } }
  } catch { /* 폴백으로 진행 */ }
  if (lastGood.has(key)) return { source: 'cache', value: lastGood.get(key) }
  return { source: 'mock', value: await mockFn() }
}

// ── 표준 순위표 ── { source, rows: StandingRow[] }
export function getStandings() {
  return withCache('league:standings', async () => {
    const { source, value } = await withFallback(
      'standings', active.getStandings, mock.getStandings,
      v => Array.isArray(v) && v.length > 0,
    )
    return { source, rows: value }
  }, STANDINGS_TTL)
}

// ── 구단별 경기 일정/결과 ── { source, next, live, upcoming[], recent[] }
export function getFixtures(teamId) {
  return withCache(`league:fixtures:${teamId}`, async () => {
    const { source, value } = await withFallback(
      `fixtures:${teamId}`, () => active.getFixtures(teamId), () => mock.getFixtures(teamId),
      v => v && (v.next || (v.upcoming && v.upcoming.length) || (v.recent && v.recent.length)),
    )
    return { source, ...value }
  }, FIXTURES_TTL)
}

// ── 구단 시즌 성적 (순위표에서 해당 구단 행) ──
export async function getTeamSeason(teamId) {
  const { source, rows } = await getStandings()
  const row = rows.find(r => r.teamId === teamId) || null
  return { source, row }
}

// 새로고침 등에서 캐시 무효화.
export function refreshLeague(teamId) {
  invalidate('league:standings')
  if (teamId) invalidate(`league:fixtures:${teamId}`)
}
