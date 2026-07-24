// FANCLUV — K리그 공식 경기 상세(www.kleague.com) 정규화 (순수 함수, 테스트 가능).
//
// 공식 소스(확인된 엔드포인트, form-urlencoded POST, params: year/leagueId/gameId/meetSeq):
//   · /api/ddf/match/matchInfo.do   → data.{gameStatus,homeGoal,awayGoal,homeScorer[],awayScorer[],
//                                            firstHalf[],secondHalf[],EfirstHalf[],EsecondHalf[]}
//       homeScorer/awayScorer: [{name, isOwnGoal, time(절대 분)}]  ← 득점 요약(확인됨)
//       half 이벤트: {eventName,teamId,teamName,playerId,backNo,playerName,playerId2,playerName2,
//                     halfType,timeMin,timeSec,homeOrAway}  ← 득점/도움/교체/경고/퇴장/유효슈팅/파울
//       교체 방향(확인됨): playerName = OUT, playerName2 = IN.
//   · /api/ddf/match/matchRecord.do → data.home/away: {possession, attempts, onTarget, corners,
//                                            fouls, offsides, freeKicks, yellowCards, redCards, doubleYellowCards}
//
// 미지원(관측): possession.do(세그먼트 전부 0), getAttackDirection.do(빈값), 라인업(JSON 미제공, HTML 전용).
// → 추측/Mock 없음. 이 모듈은 실제 확인된 필드만 표준형으로 변환한다.
// Edge(Deno) 수집기와 동일 규칙을 공유하기 위해 순수 JS 로 분리한다(kleagueNormalize.js 와 동일 패턴).

const numOrNull = v => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const sideOf = v => (String(v || '').toUpperCase() === 'HOME' ? 'home' : String(v || '').toUpperCase() === 'AWAY' ? 'away' : null)
const clean = v => String(v ?? '').trim()

// 하프 내 분(timeMin) → 경기 절대 분(전반 0~, 후반 45+, 연장 90+/105+). 표시용 근사.
export function absMinute(halfType, timeMin) {
  const h = Number(halfType) || 1
  const m = Number(timeMin) || 0
  const base = h === 2 ? 45 : h === 3 ? 90 : h === 4 ? 105 : 0
  return base + m
}

// 이벤트 배열(전/후반 + 연장) 하나로 합침. 순서 보존.
function allEvents(info) {
  return [
    ...(Array.isArray(info?.firstHalf) ? info.firstHalf : []),
    ...(Array.isArray(info?.secondHalf) ? info.secondHalf : []),
    ...(Array.isArray(info?.EfirstHalf) ? info.EfirstHalf : []),
    ...(Array.isArray(info?.EsecondHalf) ? info.EsecondHalf : []),
  ]
}

// 득점: homeScorer/awayScorer(확인된 요약)에서. isOwnGoal/time 보존. 도움은 이벤트(도움)에서 side+분 매칭(있으면).
export function normalizeGoals(info) {
  const assistByKey = {}
  for (const e of allEvents(info)) {
    if (clean(e.eventName) === '도움') {
      const side = sideOf(e.homeOrAway)
      const min = absMinute(e.halfType, e.timeMin)
      if (side) assistByKey[`${side}:${min}`] = clean(e.playerName) || null
    }
  }
  const build = (list, side) => (Array.isArray(list) ? list : []).map(g => {
    const minute = numOrNull(g.time)
    return {
      side,
      player: clean(g.name),
      minute,
      ownGoal: g.isOwnGoal === true,
      assist: (minute != null && assistByKey[`${side}:${minute}`]) || null,
    }
  }).filter(g => g.player)
  return [...build(info?.homeScorer, 'home'), ...build(info?.awayScorer, 'away')]
}

// 카드: 이벤트 경고(yellow)/퇴장(red). 2차 경고 누적도 퇴장으로.
export function normalizeCards(info) {
  const out = []
  for (const e of allEvents(info)) {
    const name = clean(e.eventName)
    let type = null
    if (name === '경고') type = 'yellow'
    else if (name === '퇴장' || name === '경고누적' || name.includes('퇴장')) type = 'red'
    if (!type) continue
    const side = sideOf(e.homeOrAway)
    const player = clean(e.playerName)
    if (!side || !player) continue
    out.push({ side, player, minute: absMinute(e.halfType, e.timeMin), type })
  }
  return out
}

// 교체: 이벤트 교체. playerName=OUT, playerName2=IN(확인됨).
export function normalizeSubs(info) {
  const out = []
  for (const e of allEvents(info)) {
    if (clean(e.eventName) !== '교체') continue
    const side = sideOf(e.homeOrAway)
    const playerOut = clean(e.playerName)
    const playerIn = clean(e.playerName2)
    if (!side || (!playerOut && !playerIn)) continue
    out.push({ side, playerOut: playerOut || null, playerIn: playerIn || null, minute: absMinute(e.halfType, e.timeMin) })
  }
  return out
}

// 통합 타임라인(득점/카드/교체) — 분 오름차순. 동일 분은 득점 > 카드 > 교체 순.
export function buildTimeline({ goals = [], cards = [], subs = [] }) {
  const order = { goal: 0, card: 1, sub: 2 }
  const items = [
    ...goals.map(g => ({ kind: 'goal', minute: g.minute ?? 0, side: g.side, player: g.player, ownGoal: g.ownGoal, assist: g.assist })),
    ...cards.map(c => ({ kind: 'card', minute: c.minute ?? 0, side: c.side, player: c.player, cardType: c.type })),
    ...subs.map(s => ({ kind: 'sub', minute: s.minute ?? 0, side: s.side, playerIn: s.playerIn, playerOut: s.playerOut })),
  ]
  return items.sort((a, b) => (a.minute - b.minute) || (order[a.kind] - order[b.kind]))
}

// 팀 경기기록: matchRecord.home/away → 지원 필드만(확인된 10종). 하나도 없으면 null.
const STAT_FIELDS = ['possession', 'attempts', 'onTarget', 'corners', 'fouls', 'offsides', 'freeKicks', 'yellowCards', 'redCards']
export function normalizeTeamStats(record) {
  const side = raw => {
    if (!raw || typeof raw !== 'object') return null
    const o = {}
    let any = false
    for (const k of STAT_FIELDS) {
      const v = numOrNull(raw[k])
      o[k] = v
      if (v != null) any = true
    }
    return any ? o : null
  }
  const home = side(record?.home)
  const away = side(record?.away)
  if (!home && !away) return null
  return { home, away }
}

// matchInfo + matchRecord → 저장/표시용 compact 상세. 부분 성공 허용(둘 중 하나만 있어도 그 부분만).
export function normalizeMatchDetail({ matchInfo, matchRecord } = {}) {
  const info = matchInfo || null
  const goals = normalizeGoals(info)
  const cards = normalizeCards(info)
  const subs = normalizeSubs(info)
  const stats = normalizeTeamStats(matchRecord)
  const timeline = buildTimeline({ goals, cards, subs })
  const hasEvents = goals.length > 0 || cards.length > 0 || subs.length > 0
  return {
    goals,
    cards,
    subs,
    timeline,
    stats,
    hasEvents,
    hasStats: !!stats,
    // 원본 스코어(대조용, 저장은 league_matches 를 신뢰).
    homeGoal: numOrNull(info?.homeGoal),
    awayGoal: numOrNull(info?.awayGoal),
  }
}
