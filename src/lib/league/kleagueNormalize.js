// FANCLUV — K리그 공식 데이터(www.kleague.com) 정규화 (순수 함수, 테스트 가능).
//
// 공식 소스(확인된 엔드포인트):
//   · 순위: POST /record/teamRank.do?leagueId=1&year=YYYY&stadium=all&recordType=rank → data.teamRank[]
//   · 일정/결과: POST /getScheduleList.do {leagueId,year,month} → data.scheduleList[]
// 이 모듈은 소스 원시 행을 FANCLUV 표준형으로 변환한다(팀코드→clubId, status enum, KST→UTC).
// Edge(Deno) 수집기와 동일 규칙을 공유하기 위해 순수 JS 로 분리한다.

// K리그 공식 팀코드(teamId "K09") ↔ FANCLUV clubId. 실제 teamRank.do 응답으로 확정한 매핑(12구단).
export const KLEAGUE_CODE_TO_CLUB = {
  K01: 'ulsan', K03: 'pohang', K04: 'jeju', K05: 'jeonbuk', K09: 'seoul', K10: 'daejeon',
  K18: 'incheon', K21: 'gangwon', K22: 'gwangju', K26: 'bucheon', K27: 'anyang', K35: 'gimcheon',
}
export const CLUB_TO_KLEAGUE_CODE = Object.fromEntries(
  Object.entries(KLEAGUE_CODE_TO_CLUB).map(([code, club]) => [club, code]),
)
// 이름 폴백(코드 없을 때만). 코드 매핑을 1차로 쓰고, 문자열 비교는 최후수단.
const NAME_TO_CLUB = {
  '울산': 'ulsan', '포항': 'pohang', '제주': 'jeju', '전북': 'jeonbuk', '서울': 'seoul', '대전': 'daejeon',
  '인천': 'incheon', '강원': 'gangwon', '광주': 'gwangju', '부천': 'bucheon', '안양': 'anyang', '김천': 'gimcheon',
}

// 공식 팀코드/이름 → FANCLUV clubId. 미매핑이면 null(=수집 대상 아님, 예: K리그2/컵 상대).
export function toClubId(code, name) {
  const c = String(code || '').toUpperCase().trim()
  if (KLEAGUE_CODE_TO_CLUB[c]) return KLEAGUE_CODE_TO_CLUB[c]
  const n = String(name || '').trim()
  return NAME_TO_CLUB[n] || null
}

// 경기 상태 정규화. FE 또는 endYn='Y' → finished. 그 외/빈값 → scheduled.
//   (공식 소스에서 안정적 LIVE 코드가 확인되지 않아 Phase 1 은 live 를 만들지 않는다.)
export function normalizeStatus(gameStatus, endYn) {
  const s = String(gameStatus || '').toUpperCase().trim()
  if (s === 'FE' || String(endYn || '').toUpperCase() === 'Y') return 'finished'
  if (s === 'PP' || s === 'PE') return 'postponed'   // 연기(관측 시 대비 — 없으면 미도달)
  if (s === 'CE' || s === 'CC') return 'cancelled'
  return 'scheduled'
}

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const numOrNull = v => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

// "2026.07.04" + "19:30" (Asia/Seoul 로컬 경기시각) → UTC ISO. tz 없는 문자열이므로 +09:00 로 해석.
//   임의 +9시간 산술이 아니라 KST 오프셋을 명시한 Date 파싱으로 UTC 를 얻는다(§13).
export function kickoffToUtcIso(gameDate, gameTime) {
  const d = String(gameDate || '').replace(/\./g, '-').replace(/-+$/, '')   // 2026-07-04
  const t = String(gameTime || '').trim()
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(d)) return null
  const hm = /^\d{1,2}:\d{2}$/.test(t) ? t : '00:00'
  const [y, mo, da] = d.split('-').map(Number)
  const [hh, mm] = hm.split(':').map(Number)
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`
  const dt = new Date(iso)
  return isNaN(dt.getTime()) ? null : dt.toISOString()
}

// 순위 원시행 → 표준 standing.
export function normalizeStanding(r) {
  const clubId = toClubId(r.teamId, r.teamName)
  const form = ['game01', 'game02', 'game03', 'game04', 'game05']
    .map(k => ({ '승': 'W', '무': 'D', '패': 'L' }[String(r[k] || '').trim()] || null))
    .filter(Boolean)
  return {
    clubId,
    teamCode: String(r.teamId || '').toUpperCase(),
    teamName: r.teamName || '',
    rank: num(r.rank),
    played: num(r.gameCount),
    wins: num(r.winCnt),
    draws: num(r.tieCnt),
    losses: num(r.lossCnt),
    goalsFor: num(r.gainGoal),
    goalsAgainst: num(r.lossGoal),
    goalDifference: num(r.gapCnt),
    points: num(r.gainPoint),
    form,
  }
}

// 일정/결과 원시행 → 표준 match. finished 가 아니면 스코어는 null(예정 경기 0:0 오인 방지).
export function normalizeMatch(r, { leagueId = 1, year } = {}) {
  const status = normalizeStatus(r.gameStatus, r.endYn)
  const finished = status === 'finished'
  return {
    externalId: String(r.gameId ?? ''),
    leagueId: num(r.leagueId ?? leagueId) || 1,
    seasonYear: num(r.year ?? year),
    round: numOrNull(r.roundId),
    kickoffAt: kickoffToUtcIso(r.gameDate, r.gameTime),
    gameDate: String(r.gameDate || ''),
    gameTime: String(r.gameTime || ''),
    homeClubId: toClubId(r.homeTeam, r.homeTeamName),
    awayClubId: toClubId(r.awayTeam, r.awayTeamName),
    homeCode: String(r.homeTeam || '').toUpperCase(),
    awayCode: String(r.awayTeam || '').toUpperCase(),
    homeTeamName: r.homeTeamName || '',
    awayTeamName: r.awayTeamName || '',
    homeScore: finished ? numOrNull(r.homeGoal) : null,
    awayScore: finished ? numOrNull(r.awayGoal) : null,
    status,
    stadium: r.fieldName || r.fieldNameFull || '',
  }
}

// 전체 순위 배열 정규화 + rank 오름차순 + 미매핑(clubId null)은 제외하지 않고 유지(리그 전체 표시).
export function normalizeStandings(list) {
  return (Array.isArray(list) ? list : []).map(normalizeStanding).sort((a, b) => a.rank - b.rank)
}
// 경기 배열 정규화 + externalId 없는 행 제외.
export function normalizeMatches(list, ctx) {
  return (Array.isArray(list) ? list : []).map(m => normalizeMatch(m, ctx)).filter(m => m.externalId)
}
