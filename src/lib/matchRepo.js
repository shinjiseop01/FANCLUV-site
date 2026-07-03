// FANCLUV — 경기센터(순위표 / 경기 일정) 데이터 소스.
//
// leagueProvider(실제 API) 를 우선 시도하고, 미설정/실패 시 Mock 으로 fallback 한다.
// 결과는 cache.js 로 30초 캐시한다. 화면(MatchCenterPage)은 이 repo 만 호출한다.
import { TEAMS, getTeam } from '../teams.jsx'
import { withCache, invalidate } from './cache.js'
import { fetchStandings, fetchFixtures, isLeagueApiConfigured } from './providers/leagueProvider.js'

export { isLeagueApiConfigured }

const STADIUMS = {
  seoul: '서울월드컵경기장', ulsan: '울산문수경기장', jeonbuk: '전주월드컵경기장',
  pohang: '포항스틸야드', daejeon: '대전월드컵경기장', gwangju: '광주축구전용구장',
  gangwon: '강릉종합운동장', gimcheon: '김천종합스포츠타운', jeju: '제주월드컵경기장',
  anyang: '안양종합운동장', incheon: '인천축구전용경기장', bucheon: '부천종합운동장',
}
export const stadiumOf = id => STADIUMS[id] || ''

function seedOf(id) {
  return id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
}

// 상대 구단 몇 개를 결정적으로 선택.
function opponentsFor(teamId) {
  const others = TEAMS.filter(t => t.id !== teamId)
  const seed = seedOf(teamId)
  const pick = n => others[(seed * (n + 1)) % others.length]
  return [pick(0), pick(2), pick(4), pick(6), pick(8), pick(1), pick(3)]
}

// ── Mock: 전체 순위표(순위·경기수·승·무·패·득실차·승점) ──
function mockStandings() {
  const rows = TEAMS.map(team => {
    const s = seedOf(team.id)
    const played = 22
    const win = 4 + (s % 12)
    const draw = (s >> 2) % (played - win + 1)
    const loss = played - win - draw
    const gf = win * 2 + draw + (s % 7)
    const ga = loss * 2 + draw + ((s >> 3) % 6)
    return {
      team,
      played, win, draw, loss,
      gd: gf - ga,
      points: win * 3 + draw,
    }
  })
  rows.sort((a, b) => b.points - a.points || b.gd - a.gd)
  return rows.map((r, i) => ({ rank: i + 1, ...r }))
}

// ── Mock: 구단별 경기 일정/결과 ──
function mockFixtures(team) {
  const opp = opponentsFor(team.id)
  return {
    next: { home: team, away: opp[0], date: '2026.07.02', time: '19:30', stadium: STADIUMS[team.id], dday: 'D-3' },
    live: { home: team, away: opp[5], homeScore: 1, awayScore: 1, minute: "67'", stadium: STADIUMS[team.id] },
    upcoming: [
      { id: 'u1', date: '2026.07.06', time: '19:00', home: opp[1], away: team, stadium: STADIUMS[opp[1].id] },
      { id: 'u2', date: '2026.07.13', time: '18:30', home: team, away: opp[2], stadium: STADIUMS[team.id] },
      { id: 'u3', date: '2026.07.20', time: '20:00', home: opp[3], away: team, stadium: STADIUMS[opp[3].id] },
    ],
    recent: [
      { id: 'r1', date: '2026.06.24', home: team, away: opp[0], homeScore: 2, awayScore: 1, stadium: STADIUMS[team.id] },
      { id: 'r2', date: '2026.06.18', home: opp[4], away: team, homeScore: 0, awayScore: 0, stadium: STADIUMS[opp[4].id] },
      { id: 'r3', date: '2026.06.11', home: opp[6], away: team, homeScore: 3, awayScore: 2, stadium: STADIUMS[opp[6].id] },
    ],
  }
}

// ── 공개 API (async, 캐시 30초, Provider→Mock fallback) ──

// 실시간 순위표. API 미설정/실패 시 Mock.
export function loadStandings() {
  return withCache('match:standings', async () => {
    if (isLeagueApiConfigured) {
      const rows = await fetchStandings().catch(() => null)
      if (rows && rows.length) return { source: 'live', rows }
    }
    return { source: 'mock', rows: mockStandings() }
  })
}

// 구단별 경기 일정/결과. API 미설정/실패 시 Mock.
export function loadMatchData(teamId) {
  return withCache(`match:data:${teamId}`, async () => {
    const team = getTeam(teamId)
    if (!team) return null
    if (isLeagueApiConfigured) {
      const data = await fetchFixtures(teamId).catch(() => null)
      if (data) return { source: 'live', ...data }
    }
    return { source: 'mock', ...mockFixtures(team) }
  })
}

// 새로고침 버튼 등에서 캐시를 비운다.
export function refreshMatch(teamId) {
  invalidate('match:standings')
  invalidate(`match:data:${teamId}`)
  invalidate('league:')
}
