// FANCLUV — K리그1 데이터 Provider (순위표 / 경기 일정).
//
// 실제 리그 데이터 API 연결 지점. 지금은 API 가 없으므로 "미설정" 상태이며,
// 각 함수는 null 을 반환한다 → 호출측(matchRepo)이 기존 Mock 데이터로 fallback.
//
// ▶ 실제 API 연결 방법
//   1) .env 에 VITE_LEAGUE_API_BASE 를 넣으면 isLeagueApiConfigured 가 true 가 된다.
//   2) fetchJson() 이 `${BASE}${path}` 를 호출한다. 인증 헤더 등이 필요하면 여기에 추가.
//   3) 응답 형태가 표준(normalize*) 과 다르면 normalizeStandings/normalizeFixtures 만 교체.
//   → 화면(MatchCenterPage) 코드는 그대로 유지된다.
import { withCache } from '../cache.js'
import { getTeam } from '../../teams.jsx'

const BASE = import.meta.env?.VITE_LEAGUE_API_BASE || ''
export const isLeagueApiConfigured = !!BASE

async function fetchJson(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`league api ${res.status}`)
  return res.json()
}

// API row → 화면 순위 항목. team id 는 FANCLUV 구단 id 와 매칭(getTeam).
function normalizeStandings(rows) {
  return (rows || []).map((r, i) => {
    const team = getTeam(r.teamId || r.team_id) || { id: r.teamId, name: r.teamName || r.name, color: '#888', colorDeep: '#888' }
    return {
      rank: r.rank || i + 1,
      team,
      played: r.played ?? r.games ?? 0,
      win: r.win ?? r.w ?? 0,
      draw: r.draw ?? r.d ?? 0,
      loss: r.loss ?? r.l ?? 0,
      gd: r.gd ?? r.goalDiff ?? 0,
      points: r.points ?? r.pts ?? 0,
    }
  })
}

function normalizeFixtures(data) {
  // 표준 응답: { next, live, upcoming: [], recent: [] } 형태를 그대로 신뢰.
  return data || null
}

// 실시간 순위표. 미설정 시 null → Mock fallback. 캐시 30초.
export function fetchStandings() {
  if (!isLeagueApiConfigured) return Promise.resolve(null)
  return withCache('league:standings', async () => normalizeStandings(await fetchJson('/standings')))
}

// 구단별 경기 일정/결과. 미설정 시 null → Mock fallback. 캐시 30초.
export function fetchFixtures(teamId) {
  if (!isLeagueApiConfigured) return Promise.resolve(null)
  return withCache(`league:fixtures:${teamId}`, async () => normalizeFixtures(await fetchJson(`/fixtures/${teamId}`)))
}
