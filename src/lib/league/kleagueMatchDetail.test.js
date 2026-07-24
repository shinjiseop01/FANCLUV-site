import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  absMinute, normalizeGoals, normalizeCards, normalizeSubs, buildTimeline,
  normalizeTeamStats, normalizeMatchDetail,
} from './kleagueMatchDetail.js'

// 실제 www.kleague.com 응답에서 확인한 형태의 축약 픽스처(gameId 91 전북 1:2 강원 기반).
const matchInfo = {
  gameStatus: '2', homeGoal: 1, awayGoal: 2,
  homeScorer: [{ name: '이승우', isOwnGoal: false, time: 74 }],
  awayScorer: [{ name: '송준석', isOwnGoal: false, time: 25 }, { name: '이유현', isOwnGoal: false, time: 53 }],
  firstHalf: [
    { eventName: '전반시작', homeOrAway: 'AWAY', halfType: 1, timeMin: 0 },
    { eventName: '득점', teamName: '강원', playerName: '송준석', homeOrAway: 'AWAY', halfType: 1, timeMin: 25 },
    { eventName: '파울', playerName: '김대원', homeOrAway: 'AWAY', halfType: 1, timeMin: 30 },
  ],
  secondHalf: [
    { eventName: '득점', teamName: '강원', playerName: '이유현', homeOrAway: 'AWAY', halfType: 2, timeMin: 8 },
    { eventName: '도움', teamName: '강원', playerName: '모재현', homeOrAway: 'AWAY', halfType: 2, timeMin: 8 },
    { eventName: '교체', teamName: '전북', playerName: '김승섭', playerName2: '이승우', homeOrAway: 'HOME', halfType: 2, timeMin: 11 },
    { eventName: '득점', teamName: '전북', playerName: '이승우', homeOrAway: 'HOME', halfType: 2, timeMin: 29 },
    { eventName: '경고', teamName: '강원', playerName: '김도현', homeOrAway: 'AWAY', halfType: 2, timeMin: 50 },
    { eventName: '경기종료', homeOrAway: 'AWAY', halfType: 2, timeMin: 52 },
  ],
}
const matchRecord = {
  home: { fouls: 6, corners: 1, onTarget: 3, possession: 61, freeKicks: 4, yellowCards: 0, attempts: 14, doubleYellowCards: 0, redCards: 0, offsides: 0 },
  away: { fouls: 12, corners: 7, onTarget: 6, possession: 39, freeKicks: 6, yellowCards: 1, attempts: 13, doubleYellowCards: 0, redCards: 0, offsides: 1 },
}

test('absMinute: 전반/후반/연장 절대 분', () => {
  assert.equal(absMinute(1, 25), 25)
  assert.equal(absMinute(2, 8), 53)
  assert.equal(absMinute(3, 5), 95)   // 연장 전반
  assert.equal(absMinute(4, 2), 107)  // 연장 후반
  assert.equal(absMinute(undefined, 3), 3)
})

test('normalizeGoals: 득점자·분·자책·도움 매칭', () => {
  const goals = normalizeGoals(matchInfo)
  assert.equal(goals.length, 3)
  const own = goals.find(g => g.player === '이승우')
  assert.equal(own.side, 'home'); assert.equal(own.minute, 74); assert.equal(own.ownGoal, false)
  const g2 = goals.find(g => g.player === '이유현')
  assert.equal(g2.side, 'away'); assert.equal(g2.minute, 53); assert.equal(g2.assist, '모재현')  // 도움 side+분 매칭
})

test('normalizeGoals: 자책골 플래그', () => {
  const goals = normalizeGoals({ homeScorer: [{ name: 'X', isOwnGoal: true, time: 10 }], awayScorer: [] })
  assert.equal(goals[0].ownGoal, true)
})

test('normalizeSubs: playerName=OUT, playerName2=IN', () => {
  const subs = normalizeSubs(matchInfo)
  assert.equal(subs.length, 1)
  assert.equal(subs[0].playerOut, '김승섭')
  assert.equal(subs[0].playerIn, '이승우')
  assert.equal(subs[0].minute, 56)  // 후반 11분
})

test('normalizeCards: 경고=yellow, 퇴장=red', () => {
  const cards = normalizeCards(matchInfo)
  assert.equal(cards.length, 1)
  assert.equal(cards[0].type, 'yellow')
  assert.equal(cards[0].player, '김도현')
  const red = normalizeCards({ secondHalf: [{ eventName: '퇴장', playerName: 'Y', homeOrAway: 'HOME', halfType: 2, timeMin: 5 }] })
  assert.equal(red[0].type, 'red')
})

test('normalizeTeamStats: 지원 10필드만, 값 있으면 유지', () => {
  const s = normalizeTeamStats(matchRecord)
  assert.equal(s.home.possession, 61)
  assert.equal(s.away.corners, 7)
  assert.equal(s.home.attempts, 14)
  assert.ok(!('doubleYellowCards' in s.home))  // 미노출 필드
})

test('normalizeTeamStats: 빈/누락 → null', () => {
  assert.equal(normalizeTeamStats(null), null)
  assert.equal(normalizeTeamStats({ home: {}, away: {} }), null)
})

test('buildTimeline: 분 오름차순 + 동시각 득점>카드>교체', () => {
  const tl = buildTimeline({
    goals: [{ side: 'home', player: 'A', minute: 10 }],
    cards: [{ side: 'away', player: 'B', minute: 10, type: 'yellow' }],
    subs: [{ side: 'home', playerIn: 'C', playerOut: 'D', minute: 5 }],
  })
  assert.deepEqual(tl.map(x => x.kind), ['sub', 'goal', 'card'])
})

test('normalizeMatchDetail: 부분 성공(이벤트만/기록만)', () => {
  const eventsOnly = normalizeMatchDetail({ matchInfo, matchRecord: null })
  assert.equal(eventsOnly.hasEvents, true)
  assert.equal(eventsOnly.hasStats, false)
  assert.equal(eventsOnly.stats, null)
  const statsOnly = normalizeMatchDetail({ matchInfo: null, matchRecord })
  assert.equal(statsOnly.hasStats, true)
  assert.equal(statsOnly.hasEvents, false)
  assert.deepEqual(statsOnly.goals, [])
})

test('normalizeMatchDetail: 알 수 없는/누락 데이터 안전', () => {
  const empty = normalizeMatchDetail({})
  assert.deepEqual(empty.goals, [])
  assert.deepEqual(empty.timeline, [])
  assert.equal(empty.stats, null)
  assert.equal(empty.hasEvents, false)
  // 알 수 없는 eventName 은 무시(카드/교체/득점 아님)
  const junk = normalizeMatchDetail({ matchInfo: { secondHalf: [{ eventName: '기타이벤트', playerName: 'Z', homeOrAway: 'HOME', halfType: 2, timeMin: 3 }] } })
  assert.deepEqual(junk.cards, []); assert.deepEqual(junk.subs, [])
})

test('normalizeMatchDetail: full 통합', () => {
  const d = normalizeMatchDetail({ matchInfo, matchRecord })
  assert.equal(d.goals.length, 3)
  assert.equal(d.subs.length, 1)
  assert.equal(d.cards.length, 1)
  assert.equal(d.timeline.length, 5)
  assert.equal(d.hasStats, true)
})
