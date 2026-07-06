// FANCLUV — 경기센터/홈 화면용 표시 어댑터.
//
// 데이터는 League Provider(src/services/league)에서 가져오고(표준 형태, teamId 기반),
// 여기서 화면 렌더에 쓰기 좋은 형태(team 객체 포함)로 변환한다. 화면은 이 repo 만 호출한다.
// 실제 API↔Mock 전환·5분 캐시·폴백은 leagueProvider(facade)가 담당한다.
import { getTeam } from '../teams.jsx'
import { getStandings, getFixtures, getTeamSeason, refreshLeague, leagueMode } from '../services/league/leagueProvider.js'
import { stadiumOf } from '../services/league/mockLeagueProvider.js'

export { stadiumOf, getTeamSeason, leagueMode }
// 실데이터(비-Mock: edge/api) 활성 여부.
export const isLeagueApiConfigured = leagueMode() !== 'mock'

// 표준 경기 → 화면 경기(홈/원정 team 객체 포함)
function toDisplayMatch(m) {
  if (!m) return null
  return {
    id: m.id,
    date: m.date,
    time: m.kickoff,
    home: getTeam(m.homeTeamId) || { id: m.homeTeamId, name: m.homeTeamName, color: '#888', colorDeep: '#888' },
    away: getTeam(m.awayTeamId) || { id: m.awayTeamId, name: m.awayTeamName, color: '#888', colorDeep: '#888' },
    stadium: m.stadium,
    status: m.status,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    finished: m.finished,
    dday: m.dday,
    minute: m.minute,
  }
}

// ── 순위표 (Provider→Mock, 5분 캐시). { source, rows:[{rank,team,played,win,draw,loss,gf,ga,gd,points}] } ──
export async function loadStandings() {
  const { source, rows } = await getStandings()
  return {
    source,
    rows: (rows || []).map(r => ({
      rank: r.rank,
      team: getTeam(r.teamId) || { id: r.teamId, name: r.teamName, color: '#888', colorDeep: '#888' },
      played: r.played, win: r.win, draw: r.draw, loss: r.loss,
      gf: r.goalsFor, ga: r.goalsAgainst, gd: r.goalDiff, points: r.points,
    })),
  }
}

// ── 구단별 경기 일정/결과 (Provider→Mock, 5분 캐시) ──
export async function loadMatchData(teamId) {
  const team = getTeam(teamId)
  if (!team) return null
  const { source, next, live, upcoming, recent } = await getFixtures(teamId)
  return {
    source,
    next: toDisplayMatch(next),
    live: toDisplayMatch(live),
    upcoming: (upcoming || []).map(toDisplayMatch),
    recent: (recent || []).map(toDisplayMatch),
  }
}

// 새로고침 버튼 등에서 캐시를 비운다.
export function refreshMatch(teamId) {
  refreshLeague(teamId)
}
