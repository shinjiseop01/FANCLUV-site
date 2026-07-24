// FANCLUV — League Provider (DB). 브라우저는 K리그 공식 사이트를 직접 호출하지 않는다.
//   kleague-sync Edge(서버) 가 공식 소스를 수집·정규화해 league_* 테이블에 저장 → 이 Provider 는
//   공개 read RPC(league_standings_view / league_matches_view)로 DB 만 읽는다(외부 호출 0, §9/§23).
import { supabase, isSupabaseConfigured } from '../../lib/supabase.js'

export const isDbLeagueEnabled = isSupabaseConfigured

// 표준 순위행: matchRepo/화면이 기대하는 형태로 매핑.
function toStandingRow(r) {
  return {
    rank: r.rank, teamId: r.clubId || r.teamCode, teamName: r.teamName,
    played: r.played, win: r.wins, draw: r.draws, loss: r.losses,
    goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, goalDiff: r.goalDifference,
    points: r.points, form: r.form || [],
  }
}

export async function getStandings() {
  if (!isSupabaseConfigured) return []
  const { data, error } = await supabase.rpc('league_standings_view', { p_league: 1 })
  if (error || !data) return []
  return (data.rows || []).map(toStandingRow)
}

// ISO(UTC) → D-day (KST 자정 기준 근사). 경기 카드의 D-N 표시용.
function ddayOf(iso) {
  if (!iso) return null
  const now = Date.now(); const t = new Date(iso).getTime()
  if (isNaN(t)) return null
  const days = Math.ceil((t - now) / 86400000)
  return days > 0 ? `D-${days}` : days === 0 ? 'D-DAY' : null
}

function toMatch(m) {
  const finished = m.status === 'finished'
  return {
    id: m.externalId, date: m.gameDate, kickoff: m.gameTime,
    homeTeamId: m.homeClubId, awayTeamId: m.awayClubId,
    homeTeamName: m.homeTeamName, awayTeamName: m.awayTeamName,
    stadium: m.stadium, status: m.status,
    homeScore: m.homeScore, awayScore: m.awayScore, finished,
    kickoffAt: m.kickoffAt, dday: ddayOf(m.kickoffAt), minute: null,
  }
}

// 구단별 일정/결과 → { next, live, upcoming[], recent[] }.
export async function getFixtures(teamId) {
  if (!isSupabaseConfigured || !teamId) return { next: null, live: null, upcoming: [], recent: [] }
  const { data, error } = await supabase.rpc('league_matches_view', { p_league: 1, p_club: teamId })
  if (error || !Array.isArray(data)) return { next: null, live: null, upcoming: [], recent: [] }
  const matches = data.map(toMatch)
  const ts = m => new Date(m.kickoffAt || 0).getTime()
  const live = matches.find(m => m.status === 'live') || null
  const upcoming = matches.filter(m => m.status === 'scheduled').sort((a, b) => ts(a) - ts(b))
  const recent = matches.filter(m => m.status === 'finished').sort((a, b) => ts(b) - ts(a)).slice(0, 5)
  return { next: upcoming[0] || null, live, upcoming: upcoming.slice(0, 5), recent }
}

// 경기 단건 상세 — read RPC(league_match_detail) 만 조회(외부 호출 0). null=미존재.
export async function getMatchDetail(externalId) {
  if (!isSupabaseConfigured || !externalId) return null
  const { data, error } = await supabase.rpc('league_match_detail', { p_external_id: String(externalId) })
  if (error || !data) return null
  return data
}

export const dbLeagueProvider = { key: 'db', getStandings, getFixtures, getMatchDetail }
