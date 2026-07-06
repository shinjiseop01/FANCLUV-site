// FANCLUV — League Provider (facade).
//
// K리그1 순위/일정/결과의 단일 진입점. 화면(matchRepo 경유) 은 이 파일만 호출한다.
// 환경변수로 Provider 를 선택하고(기본 mock), 5분 캐시 + 실패 폴백을 적용한다.
//
// Provider 선택 (요구사항 1/10)
//   - LEAGUE_PROVIDER=mock  → Mock (기본값)
//   - LEAGUE_PROVIDER=api   → 실제 API (VITE_LEAGUE_API_BASE 필요)
//   - 미지정 시: API Base 가 설정돼 있으면 api, 아니면 mock 자동 선택.
//   (LEAGUE_PROVIDER 노출을 위해 vite.config 의 envPrefix 에 'LEAGUE_' 추가)
//
// 캐시/폴백 (요구사항 8)
//   - 구단/전체별 5분 캐시(withCache).
//   - 실패 시: 마지막 성공 데이터(lastGood) → 없으면 Mock.
import { withCache, invalidate } from '../../lib/cache.js'
import * as mock from './mockLeagueProvider.js'
import * as api from './apiLeagueProvider.js'

const TTL = 5 * 60 * 1000 // 5분

const MODE = String(import.meta.env?.LEAGUE_PROVIDER || import.meta.env?.VITE_LEAGUE_PROVIDER || '').toLowerCase()
const useApi = MODE === 'api' || (MODE !== 'mock' && api.isApiConfigured)
const active = useApi ? api : mock

// 현재 활성 Provider 종류 ('api' | 'mock')
export function leagueMode() { return active === api ? 'api' : 'mock' }
export const isLeagueApiActive = active === api

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
  }, TTL)
}

// ── 구단별 경기 일정/결과 ── { source, next, live, upcoming[], recent[] }
export function getFixtures(teamId) {
  return withCache(`league:fixtures:${teamId}`, async () => {
    const { source, value } = await withFallback(
      `fixtures:${teamId}`, () => active.getFixtures(teamId), () => mock.getFixtures(teamId),
      v => v && (v.next || (v.upcoming && v.upcoming.length) || (v.recent && v.recent.length)),
    )
    return { source, ...value }
  }, TTL)
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
