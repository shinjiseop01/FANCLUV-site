// FANCLUV — API League Provider (실제 리그 데이터 API 연결 지점).
//
// 특정 벤더에 종속되지 않도록 표준 형태(mockLeagueProvider 와 동일)로 정규화만 맞추면
// 어떤 API 든 교체 가능하다. API Key/Base 는 환경변수로 주입한다.
//
// ▶ 실제 API 연결 방법 (요구사항 7)
//   1) .env 에 VITE_LEAGUE_API_BASE, VITE_LEAGUE_API_KEY 를 넣고 LEAGUE_PROVIDER=api 로 지정.
//   2) fetchJson() 이 `${BASE}${path}` 를 호출(인증 헤더 자동 첨부).
//   3) 벤더 응답이 표준과 다르면 normalizeStandings/normalizeFixtures 만 교체.
//      → 화면(MatchCenterPage/ClubHomePage) 코드는 그대로.
//   지원 대상 예: API-Football, Sportmonks, Football-data, K리그 공식 데이터, 자체 수집 데이터.
import { getTeam } from '../../teams.jsx'
import { withRetry } from '../../lib/retry.js'

const BASE = import.meta.env?.VITE_LEAGUE_API_BASE || ''
const KEY = import.meta.env?.VITE_LEAGUE_API_KEY || ''
export const isApiConfigured = !!BASE

// 일시적 오류(네트워크/5xx)만 최대 3회 재시도. 4xx(클라이언트 오류)는 즉시 중단.
async function fetchJson(path) {
  const headers = { Accept: 'application/json' }
  if (KEY) { headers.Authorization = `Bearer ${KEY}`; headers['X-API-Key'] = KEY }
  return withRetry(async () => {
    const res = await fetch(`${BASE}${path}`, { headers })
    if (!res.ok) {
      const err = new Error(`league api ${res.status}`)
      err.status = res.status
      throw err
    }
    return res.json()
  }, {
    retries: 3,
    label: `league:${path}`,
    // 4xx 는 재시도 무의미(요청 자체 문제) → 5xx/네트워크만 재시도.
    shouldRetry: err => !err?.status || err.status >= 500,
  })
}

// 벤더 순위 응답 → 표준 순위 행.
function normalizeStandings(raw) {
  const rows = raw?.standings || raw?.data || raw || []
  return rows.map((r, i) => {
    const teamId = r.teamId || r.team_id || r.team?.id || ''
    const team = getTeam(teamId)
    const gf = r.goalsFor ?? r.gf ?? r.scored ?? 0
    const ga = r.goalsAgainst ?? r.ga ?? r.conceded ?? 0
    return {
      rank: r.rank ?? r.position ?? i + 1,
      teamId,
      teamName: team?.name || r.teamName || r.name || teamId,
      played: r.played ?? r.games ?? r.matches ?? 0,
      win: r.win ?? r.w ?? r.wins ?? 0,
      draw: r.draw ?? r.d ?? r.draws ?? 0,
      loss: r.loss ?? r.l ?? r.losses ?? 0,
      goalsFor: gf,
      goalsAgainst: ga,
      goalDiff: r.goalDiff ?? r.gd ?? (gf - ga),
      points: r.points ?? r.pts ?? 0,
    }
  })
}

// 벤더 경기 응답 → 표준 경기.
function normalizeMatch(m) {
  const homeId = m.homeTeamId || m.home?.id || m.home_team_id || ''
  const awayId = m.awayTeamId || m.away?.id || m.away_team_id || ''
  const status = m.status || (m.finished ? 'finished' : m.live ? 'live' : 'scheduled')
  return {
    id: m.id || `${homeId}-${awayId}-${m.date || ''}`,
    date: m.date || m.matchDate || '',
    kickoff: m.kickoff || m.time || '',
    homeTeamId: homeId,
    awayTeamId: awayId,
    homeTeamName: getTeam(homeId)?.name || m.homeTeamName || homeId,
    awayTeamName: getTeam(awayId)?.name || m.awayTeamName || awayId,
    stadium: m.stadium || m.venue || '',
    status,
    homeScore: m.homeScore ?? m.home_score ?? null,
    awayScore: m.awayScore ?? m.away_score ?? null,
    finished: status === 'finished',
    dday: m.dday,
    minute: m.minute,
  }
}

// 벤더 fixtures 응답 → { next, live, upcoming[], recent[] }
function normalizeFixtures(raw) {
  if (!raw) return null
  return {
    next: raw.next ? normalizeMatch(raw.next) : null,
    live: raw.live ? normalizeMatch(raw.live) : null,
    upcoming: (raw.upcoming || []).map(normalizeMatch),
    recent: (raw.recent || []).map(normalizeMatch),
  }
}

export async function getStandings() {
  if (!isApiConfigured) throw new Error('league api not configured')
  return normalizeStandings(await fetchJson('/standings'))
}

export async function getFixtures(teamId) {
  if (!isApiConfigured) throw new Error('league api not configured')
  return normalizeFixtures(await fetchJson(`/fixtures/${teamId}`))
}

export const apiLeagueProvider = { key: 'api', getStandings, getFixtures }
