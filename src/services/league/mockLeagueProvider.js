// FANCLUV — Mock League Provider (K리그1 순위/일정 데모 데이터).
//
// 실제 리그 API 가 없을 때 사용하는 기본 Provider. leagueProvider(facade)가 우선으로
// 시도하거나, apiLeagueProvider 실패 시 fallback 으로 사용한다.
// 반환 형태는 API Provider 와 동일한 "표준 형태"로 통일한다.
import { TEAMS, getTeam } from '../../teams.jsx'

const STADIUMS = {
  seoul: '서울월드컵경기장', ulsan: '울산문수경기장', jeonbuk: '전주월드컵경기장',
  pohang: '포항스틸야드', daejeon: '대전월드컵경기장', gwangju: '광주축구전용구장',
  gangwon: '강릉종합운동장', gimcheon: '김천종합스포츠타운', jeju: '제주월드컵경기장',
  anyang: '안양종합운동장', incheon: '인천축구전용경기장', bucheon: '부천종합운동장',
}
export const stadiumOf = id => STADIUMS[id] || ''

function seedOf(id) {
  return String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
}
function opponentsFor(teamId) {
  const others = TEAMS.filter(t => t.id !== teamId)
  const seed = seedOf(teamId)
  const pick = n => others[(seed * (n + 1)) % others.length]
  return [pick(0), pick(2), pick(4), pick(6), pick(8), pick(1), pick(3)]
}

const nameOf = id => getTeam(id)?.name || id

// 표준 순위 행: 순위·팀명·경기수·승·무·패·득점·실점·득실차·승점
export async function getStandings() {
  const rows = TEAMS.map(team => {
    const s = seedOf(team.id)
    const played = 22
    const win = 4 + (s % 12)
    const draw = (s >> 2) % (played - win + 1)
    const loss = played - win - draw
    const goalsFor = win * 2 + draw + (s % 7)
    const goalsAgainst = loss * 2 + draw + ((s >> 3) % 6)
    // 최근 5경기 폼(데모, 결정적) — 표준 필드 form.
    const forms = [['W', 'W', 'D', 'L', 'W'], ['D', 'W', 'W', 'L', 'D'], ['L', 'D', 'W', 'W', 'W'], ['W', 'L', 'L', 'D', 'W']]
    return {
      teamId: team.id, teamName: team.name,
      played, win, draw, loss,
      goalsFor, goalsAgainst, goalDiff: goalsFor - goalsAgainst,
      points: win * 3 + draw,
      form: forms[s % forms.length],
    }
  })
  rows.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor)
  return rows.map((r, i) => ({ rank: i + 1, ...r }))
}

// 표준 경기: id·경기일·시작시간·홈팀·원정팀·경기장·상태·점수·종료여부
function match(o) {
  return {
    id: o.id,
    date: o.date,
    kickoff: o.kickoff || '',
    homeTeamId: o.homeTeamId,
    awayTeamId: o.awayTeamId,
    homeTeamName: nameOf(o.homeTeamId),
    awayTeamName: nameOf(o.awayTeamId),
    stadium: o.stadium || stadiumOf(o.homeTeamId),
    status: o.status || 'scheduled',           // 'scheduled' | 'live' | 'finished'
    homeScore: o.homeScore ?? null,
    awayScore: o.awayScore ?? null,
    finished: o.status === 'finished',
    round: o.round || '2026 K리그1',
    competition: o.competition || 'K League 1',
    dday: o.dday,
    minute: o.minute,
  }
}

// 구단별 경기 일정/결과 (다음/진행중/예정/최근)
export async function getFixtures(teamId) {
  const opp = opponentsFor(teamId)
  return {
    next: match({ id: `n-${teamId}`, homeTeamId: teamId, awayTeamId: opp[0].id, date: '2026.07.02', kickoff: '19:30', status: 'scheduled', dday: 'D-3' }),
    live: match({ id: `l-${teamId}`, homeTeamId: teamId, awayTeamId: opp[5].id, date: '2026.06.30', kickoff: '19:00', status: 'live', homeScore: 1, awayScore: 1, minute: "67'" }),
    upcoming: [
      match({ id: `u1-${teamId}`, date: '2026.07.06', kickoff: '19:00', homeTeamId: opp[1].id, awayTeamId: teamId, status: 'scheduled' }),
      match({ id: `u2-${teamId}`, date: '2026.07.13', kickoff: '18:30', homeTeamId: teamId, awayTeamId: opp[2].id, status: 'scheduled' }),
      match({ id: `u3-${teamId}`, date: '2026.07.20', kickoff: '20:00', homeTeamId: opp[3].id, awayTeamId: teamId, status: 'scheduled' }),
    ],
    recent: [
      match({ id: `r1-${teamId}`, date: '2026.06.24', homeTeamId: teamId, awayTeamId: opp[0].id, status: 'finished', homeScore: 2, awayScore: 1 }),
      match({ id: `r2-${teamId}`, date: '2026.06.18', homeTeamId: opp[4].id, awayTeamId: teamId, status: 'finished', homeScore: 0, awayScore: 0 }),
      match({ id: `r3-${teamId}`, date: '2026.06.11', homeTeamId: opp[6].id, awayTeamId: teamId, status: 'finished', homeScore: 3, awayScore: 2 }),
    ],
  }
}

export const mockLeagueProvider = { key: 'mock', getStandings, getFixtures }
