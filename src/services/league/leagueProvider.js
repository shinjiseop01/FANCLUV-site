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
import { isSupabaseConfigured } from '../../lib/supabase.js'
import * as mock from './mockLeagueProvider.js'
import * as api from './apiLeagueProvider.js'
import * as edge from './edgeLeagueProvider.js'
import * as db from './dbLeagueProvider.js'

const STANDINGS_TTL = 5 * 60 * 1000  // 순위 5분
const FIXTURES_TTL = 5 * 60 * 1000   // 경기(일정+결과) 5분 — 결과 신선도 우선(일정 10분 요건 포함)

const MODE = String(import.meta.env?.LEAGUE_PROVIDER || import.meta.env?.VITE_LEAGUE_PROVIDER || '').toLowerCase()
// 우선순위(명시 MODE 우선): db(K리그 공식→DB, 프로덕션 기본) → edge → api → mock.
//   미지정 + Supabase 설정 = db(동기화된 league_* 테이블). Supabase 없음(DEV) = mock.
const active =
  MODE === 'mock' ? mock
  : MODE === 'db' ? db
  : (MODE === 'edge' && edge.isEdgeLeagueEnabled) ? edge
  : MODE === 'api' ? api
  : isSupabaseConfigured ? db
  : mock

// 현재 활성 Provider 종류 ('db' | 'edge' | 'api' | 'mock')
export function leagueMode() { return active === db ? 'db' : active === edge ? 'edge' : active === api ? 'api' : 'mock' }
// 실데이터(비-Mock) 활성 여부 — 화면의 실시간 배지 등에 사용.
export const isLeagueApiActive = active !== mock

// ⚠️ 프로덕션(Supabase 설정)인데 실 Provider(edge/api)가 없으면 Mock 을 절대 노출하지 않는다.
//   이 경우 화면은 "데이터 공급원 연결 준비 중"(unconfigured)을 표시한다. DEV 에서만 Mock 사용.
export const isLeagueProdUnconfigured = isSupabaseConfigured && active === mock
// 구성 상태: 'live'(실 Provider) | 'unconfigured'(프로덕션·공급원 없음) | 'dev-mock'(개발 Mock)
export function leagueConfigState() {
  if (active !== mock) return 'live'
  return isSupabaseConfigured ? 'unconfigured' : 'dev-mock'
}

const EMPTY_STANDINGS = []
const EMPTY_FIXTURES = { next: null, live: null, upcoming: [], recent: [] }
const lastGood = new Map()

// primary(활성 Provider) 시도 → 유효하면 캐시/반환, 실패·빈값이면 lastGood(stale) → 상태별 처리.
//   · 프로덕션: Mock 금지. 캐시 없으면 unconfigured(공급원 없음) / unavailable(공급원 오류).
//   · DEV: 기존처럼 Mock 폴백.
async function withFallback(key, primaryFn, mockFn, isValid, emptyValue) {
  try {
    const value = await primaryFn()
    if (isValid(value)) { lastGood.set(key, value); return { source: leagueMode(), value } }
  } catch { /* 폴백으로 진행 */ }
  if (lastGood.has(key)) return { source: 'stale', value: lastGood.get(key) }
  if (isSupabaseConfigured) {
    return { source: active === mock ? 'unconfigured' : 'unavailable', value: emptyValue }
  }
  return { source: 'mock', value: await mockFn() }
}

// ── 표준 순위표 ── { source, rows: StandingRow[] }
export function getStandings() {
  if (isLeagueProdUnconfigured) return Promise.resolve({ source: 'unconfigured', rows: [] })
  return withCache('league:standings', async () => {
    const { source, value } = await withFallback(
      'standings', active.getStandings, mock.getStandings,
      v => Array.isArray(v) && v.length > 0, EMPTY_STANDINGS,
    )
    return { source, rows: value }
  }, STANDINGS_TTL)
}

// ── 구단별 경기 일정/결과 ── { source, next, live, upcoming[], recent[] }
export function getFixtures(teamId) {
  if (isLeagueProdUnconfigured) return Promise.resolve({ source: 'unconfigured', ...EMPTY_FIXTURES })
  return withCache(`league:fixtures:${teamId}`, async () => {
    const { source, value } = await withFallback(
      `fixtures:${teamId}`, () => active.getFixtures(teamId), () => mock.getFixtures(teamId),
      v => v && (v.next || (v.upcoming && v.upcoming.length) || (v.recent && v.recent.length)), EMPTY_FIXTURES,
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

// ── 관리자 진단용 ─────────────────────────────────────────────────────────
// 현재 Provider 구성 정보(모드/활성/베이스 URL).
export function leagueProviderInfo() {
  return {
    mode: leagueMode(),                 // 'edge' | 'api' | 'mock'
    edgeEnabled: edge.isEdgeLeagueEnabled,
    apiConfigured: api.isApiConfigured,
    // api 모드의 base URL 만 프론트에 노출됨(edge 는 서버 시크릿이라 값 없음).
    apiBaseUrl: import.meta.env?.VITE_LEAGUE_API_BASE || '',
  }
}

// 캐시를 거치지 않고 활성 Provider 를 1회 프로브(관리자 연결 테스트용).
// 반환: { primaryOk, source, value, error } — primaryOk=실 Provider 성공 여부,
//   source: 'edge'|'api'|'mock'(성공) | 'cache'(lastGood 폴백) | 'mock'(최종 폴백).
export async function probeLeague(resource, teamId) {
  const key = resource === 'standings' ? 'standings' : `fixtures:${teamId || 'all'}`
  const isValid = resource === 'standings'
    ? v => Array.isArray(v) && v.length > 0
    : v => v && (v.next || (v.upcoming && v.upcoming.length) || (v.recent && v.recent.length))
  let error = null
  try {
    const value = resource === 'standings' ? await active.getStandings() : await active.getFixtures(teamId)
    if (isValid(value)) { lastGood.set(key, value); return { primaryOk: true, source: leagueMode(), value, error: null } }
    error = 'empty'
  } catch (e) { error = String(e?.message || e) }
  // 실 Provider 실패 → 마지막 성공(lastGood) → (프로덕션은 Mock 금지) 상태 반환 / DEV 만 Mock.
  if (lastGood.has(key)) return { primaryOk: false, source: 'stale', value: lastGood.get(key), error }
  if (isSupabaseConfigured) {
    const empty = resource === 'standings' ? EMPTY_STANDINGS : EMPTY_FIXTURES
    return { primaryOk: false, source: active === mock ? 'unconfigured' : 'unavailable', value: empty, error }
  }
  const value = resource === 'standings' ? await mock.getStandings() : await mock.getFixtures(teamId)
  return { primaryOk: false, source: 'mock', value, error }
}
