// FANCLUV — Edge League Provider (실제 K리그 데이터, 운영 기본).
//
// 브라우저에서 외부 API 를 직접 부르지 않고(키 노출/CORS 방지), Supabase Edge Function
// `league-fetcher`(서버)가 수집·정규화·캐시한 결과를 받아온다.
//   요청: { resource:'standings' } | { resource:'fixtures', teamId }
//   응답(표준): standings:[{rank,clubId,teamName,played,wins,draws,losses,goalsFor,
//               goalsAgainst,goalDifference,points,form}] | fixtures:[표준경기]
//
// 이 Provider 는 표준(외부 계약) 형태를 **내부 Provider 표준**(teamId/win/goalDiff/date/
// kickoff/homeTeamId...)으로 매핑해 mock/api Provider 와 동일한 형태로 반환한다.
// → 화면(matchRepo)·facade 코드는 전혀 바뀌지 않는다.
//
// 활성 조건: Supabase 설정됨 + VITE_LEAGUE_PROVIDER=edge (facade 에서 판단).
import { isSupabaseConfigured } from '../../lib/supabase.js'
import { invokeFunction } from '../../lib/edgeFunctions.js'
import { logger } from '../../lib/logger.js'
import { getTeam } from '../../teams.jsx'
import { stadiumOf } from './mockLeagueProvider.js'

export const isEdgeLeagueEnabled =
  isSupabaseConfigured &&
  String(import.meta.env?.VITE_LEAGUE_PROVIDER || import.meta.env?.LEAGUE_PROVIDER || '').toLowerCase() === 'edge'

const nameOf = (id, fallback) => getTeam(id)?.name || fallback || id

// 표준(계약) 순위 행 → 내부 Provider 표준 순위 행.
function toInternalStanding(r) {
  return {
    rank: r.rank,
    teamId: r.clubId,
    teamName: r.teamName || nameOf(r.clubId),
    played: r.played, win: r.wins, draw: r.draws, loss: r.losses,
    goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst,
    goalDiff: r.goalDifference, points: r.points,
    form: r.form || [],
  }
}

// 표준(계약) 경기 → 내부 Provider 표준 경기.
function toInternalMatch(m) {
  const status = m.status || 'scheduled'
  return {
    id: m.id,
    date: m.matchDate || '',
    kickoff: m.matchTime || '',
    homeTeamId: m.homeClubId,
    awayTeamId: m.awayClubId,
    homeTeamName: m.homeTeamName || nameOf(m.homeClubId),
    awayTeamName: m.awayTeamName || nameOf(m.awayClubId),
    stadium: m.stadium || stadiumOf(m.homeClubId),
    status,
    homeScore: m.homeScore ?? null,
    awayScore: m.awayScore ?? null,
    finished: status === 'finished',
    round: m.round || '',
    competition: m.competition || 'K League 1',
  }
}

const dnum = d => Number(String(d || '').replace(/\D/g, '')) || 0

// 표준 경기 배열 → 내부 { next, live, upcoming[], recent[] } 로 그룹핑.
function groupFixtures(matches) {
  const items = matches.map(toInternalMatch)
  const live = items.find(m => m.status === 'live') || null
  const upcoming = items.filter(m => m.status === 'scheduled').sort((a, b) => dnum(a.date) - dnum(b.date))
  const recent = items.filter(m => m.status === 'finished').sort((a, b) => dnum(b.date) - dnum(a.date)).slice(0, 5)
  return { next: upcoming[0] || null, live, upcoming: upcoming.slice(0, 5), recent }
}

export async function getStandings() {
  if (!isEdgeLeagueEnabled) return []
  const { data, error } = await invokeFunction('league-fetcher', { body: { resource: 'standings' } })
  if (error || !data?.ok) {
    if (error) logger.warn('league-fetcher(standings) 실패 → 폴백', { error })
    return []   // facade 가 lastGood → Mock 으로 폴백
  }
  return Array.isArray(data.standings) ? data.standings.map(toInternalStanding) : []
}

export async function getFixtures(teamId) {
  if (!isEdgeLeagueEnabled) return null
  const { data, error } = await invokeFunction('league-fetcher', { body: { resource: 'fixtures', teamId } })
  if (error || !data?.ok) {
    if (error) logger.warn('league-fetcher(fixtures) 실패 → 폴백', { error, context: { teamId } })
    return null  // facade 가 lastGood → Mock 으로 폴백
  }
  return groupFixtures(Array.isArray(data.fixtures) ? data.fixtures : [])
}

export const isApiConfigured = isEdgeLeagueEnabled
export const edgeLeagueProvider = { key: 'edge', getStandings, getFixtures }
