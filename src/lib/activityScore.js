// FANCLUV — 활동 점수 (다음날 00시 반영).
//
// 요구사항: 의견 작성 / 댓글 작성 / 설문 참여 / 공감 활동은 **다음날 00시**에 활동 점수에
// 반영된다(팬 랭킹). 즉 오늘 한 활동은 "대기(pending)" 상태로, 자정이 지나면 점수에 합산된다.
//
// 구현: 각 활동을 타임스탬프와 함께 로컬 활동 로그(fancluv_activity_log)에 기록하고,
//   - 반영 점수(reflected) = 오늘 00시 "이전" 활동의 점수 합
//   - 대기 점수(pending)   = 오늘(00시 이후) 활동의 점수 합 → 내일 00시에 반영
// 로 계산한다. Mock/Supabase 모드 공통(로그인 사용자 단위 로컬 집계).

const KEY = 'fancluv_activity_log'
const MAX = 2000

// 활동별 점수 가중치.
export const ACTIVITY_POINTS = { opinion: 10, comment: 3, survey: 5, like: 1 }

function read() { try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] } }
function write(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))) } catch { /* ignore */ } }

// 오늘 00:00 (로컬) 타임스탬프.
function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// 활동 기록 (성공한 활동에서 호출). type ∈ ACTIVITY_POINTS.
export function recordActivity(type) {
  if (!ACTIVITY_POINTS[type]) return
  const list = read()
  list.push({ type, at: Date.now() })
  write(list)
}

// 활동 점수 요약: { reflected, pending, total, todayCount }
//   reflected = 어제까지(오늘 00시 이전) 활동 점수 — 팬 랭킹에 반영되는 값
//   pending   = 오늘 한 활동 점수 — 내일 00시에 반영 예정
export function getActivityScore() {
  const cutoff = startOfToday()
  const list = read()
  let reflected = 0, pending = 0, todayCount = 0
  for (const e of list) {
    const pts = ACTIVITY_POINTS[e.type] || 0
    if (e.at < cutoff) reflected += pts
    else { pending += pts; todayCount++ }
  }
  return { reflected, pending, total: reflected + pending, todayCount }
}

// 활동 유형별 집계(반영/대기 구분). 화면 표시용.
export function getActivityBreakdown() {
  const cutoff = startOfToday()
  const list = read()
  const mk = () => ({ opinion: 0, comment: 0, survey: 0, like: 0 })
  const reflected = mk(), pending = mk()
  for (const e of list) {
    if (!(e.type in reflected)) continue
    ;(e.at < cutoff ? reflected : pending)[e.type]++
  }
  return { reflected, pending }
}
