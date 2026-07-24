import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  toClubId, normalizeStatus, kickoffToUtcIso, normalizeStanding, normalizeMatch,
  normalizeStandings, normalizeMatches, KLEAGUE_CODE_TO_CLUB,
} from './kleagueNormalize.js'

test('team mapping: all 12 FANCLUV clubs covered by K-codes', () => {
  const clubs = new Set(Object.values(KLEAGUE_CODE_TO_CLUB))
  for (const c of ['seoul','ulsan','jeonbuk','pohang','daejeon','gwangju','gangwon','gimcheon','jeju','anyang','incheon','bucheon']) {
    assert.ok(clubs.has(c), `missing club ${c}`)
  }
  assert.equal(clubs.size, 12)
})
test('toClubId: code first, name fallback, unknown → null', () => {
  assert.equal(toClubId('K09'), 'seoul')
  assert.equal(toClubId('K05', '전북'), 'jeonbuk')
  assert.equal(toClubId('', '울산'), 'ulsan')       // name fallback
  assert.equal(toClubId('K99', '천안'), null)        // K리그2 상대 → 미매핑
})
test('normalizeStatus: FE/endYn=Y → finished, empty → scheduled', () => {
  assert.equal(normalizeStatus('FE', 'Y'), 'finished')
  assert.equal(normalizeStatus('', 'Y'), 'finished')
  assert.equal(normalizeStatus('', 'N'), 'scheduled')
  assert.equal(normalizeStatus('', ''), 'scheduled')
  assert.equal(normalizeStatus('PP', 'N'), 'postponed')
})
test('kickoffToUtcIso: KST 19:30 → UTC 10:30 (no naive +9)', () => {
  assert.equal(kickoffToUtcIso('2026.07.04', '19:30'), '2026-07-04T10:30:00.000Z')
  assert.equal(kickoffToUtcIso('2026.08.01', '19:30'), '2026-08-01T10:30:00.000Z')
  assert.equal(kickoffToUtcIso('bad', '19:30'), null)
  // 자정 넘김: KST 00:30 → 전날 UTC 15:30
  assert.equal(kickoffToUtcIso('2026.03.01', '00:30'), '2026-02-28T15:30:00.000Z')
})
test('normalizeStanding: real 서울 row', () => {
  const s = normalizeStanding({ teamId:'K09', teamName:'서울', rank:1, gainPoint:42, winCnt:13, tieCnt:3, lossCnt:3, gainGoal:34, lossGoal:14, gapCnt:20, gameCount:19, game01:'승', game02:'승', game03:'무', game04:'승', game05:'승' })
  assert.equal(s.clubId, 'seoul'); assert.equal(s.rank, 1); assert.equal(s.points, 42)
  assert.equal(s.played, 19); assert.equal(s.wins, 13); assert.equal(s.draws, 3); assert.equal(s.losses, 3)
  assert.equal(s.goalsFor, 34); assert.equal(s.goalsAgainst, 14); assert.equal(s.goalDifference, 20)
  assert.deepEqual(s.form, ['W','W','D','W','W'])
})
test('normalizeMatch: finished keeps score; scheduled nulls score', () => {
  const fin = normalizeMatch({ gameId:91, gameDate:'2026.07.04', gameTime:'19:30', roundId:16, homeTeam:'K05', homeTeamName:'전북', awayTeam:'K21', awayTeamName:'강원', homeGoal:1, awayGoal:2, gameStatus:'FE', endYn:'Y', fieldName:'전주 월드컵', leagueId:1, year:2026 })
  assert.equal(fin.externalId, '91'); assert.equal(fin.status, 'finished')
  assert.equal(fin.homeClubId, 'jeonbuk'); assert.equal(fin.awayClubId, 'gangwon')
  assert.equal(fin.homeScore, 1); assert.equal(fin.awayScore, 2); assert.equal(fin.round, 16)
  assert.equal(fin.kickoffAt, '2026-07-04T10:30:00.000Z'); assert.equal(fin.stadium, '전주 월드컵')
  const sch = normalizeMatch({ gameId:200, gameDate:'2026.08.01', gameTime:'19:30', homeTeam:'K21', homeTeamName:'강원', awayTeam:'K26', awayTeamName:'부천', homeGoal:0, awayGoal:0, gameStatus:'', endYn:'N', leagueId:1, year:2026 })
  assert.equal(sch.status, 'scheduled'); assert.equal(sch.homeScore, null); assert.equal(sch.awayScore, null)
})
test('normalizeMatches: drops rows without externalId', () => {
  const out = normalizeMatches([{ gameId:1, gameDate:'2026.07.04', gameTime:'19:00', homeTeam:'K09', awayTeam:'K01', gameStatus:'FE', endYn:'Y', homeGoal:2, awayGoal:0 }, { gameId:'', homeTeam:'K09' }], { leagueId:1, year:2026 })
  assert.equal(out.length, 1)
})
test('normalizeStandings: sorts by rank asc', () => {
  const out = normalizeStandings([{ teamId:'K21', rank:2 }, { teamId:'K09', rank:1 }])
  assert.deepEqual(out.map(r => r.rank), [1, 2])
})
