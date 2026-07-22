// FANCLUV — 실시간 통계 순수 계산/포맷 유틸(단위 테스트 대상, 외부 의존 없음).
//
// 서버(0069)가 집계·bucket 의 원천이며, 여기서는 표시용 파생값/포맷/캐시키/stale 판단만 다룬다.
// 시간대는 파라미터(tz)로 받아 하드코딩을 피한다(기본 Asia/Seoul, KST 는 DST 없음).

export const STATS_TZ = 'Asia/Seoul'

// 평균 평점 — count 0 이면 null(가짜 0 금지). 소수 2자리.
export function computeAverage(sum, count) {
  const c = Number(count) || 0
  if (c <= 0) return null
  return Math.round((Number(sum) / c) * 100) / 100
}

// 비율(0~1) — 반올림 전 원본 기준. total 0 이면 null.
export function computeRatio(part, total) {
  const t = Number(total) || 0
  if (t <= 0) return null
  return Number(part) / t
}

// 표시용 퍼센트(정수). ratio null 이면 null.
export function formatRatioPct(ratio) {
  return ratio == null ? null : Math.round(ratio * 100)
}

// 증감률 — (cur-prev)/prev. 이전 baseline 이 0 이면 정의 불가 → null(무한대/과장 금지).
export function growthRate(current, previous) {
  const p = Number(previous) || 0
  if (p <= 0) return null
  return (Number(current) - p) / p
}

// tz 기준 날짜 키(YYYY-MM-DD) — '오늘' 경계·캐시키용. Intl 로 tz 파라미터화(DST 리그 확장 대비).
export function dayKeyInTz(date, tz = STATS_TZ) {
  const d = date instanceof Date ? date : new Date(date)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const g = (t) => parts.find(p => p.type === t)?.value
  return `${g('year')}-${g('month')}-${g('day')}`
}

// 같은 tz 날짜인지(‘오늘’ 판정).
export function isSameTzDay(a, b, tz = STATS_TZ) {
  return dayKeyInTz(a, tz) === dayKeyInTz(b, tz)
}

// 고유 활성 사용자 수 — user_id 중복 제거(식별자 자체는 노출하지 않음, count 만).
export function dedupeActiveUsers(events) {
  const set = new Set()
  for (const e of events || []) {
    const id = e && (e.user_id ?? e.userId)
    if (id) set.add(String(id))
  }
  return set.size
}

// 최소 집계 인원 게이트 — total < min 이면 숨김(소수 집단 개인추론 방지, §11).
export function applyMinAggregation(segment, total, min = 5) {
  if ((Number(total) || 0) < (Number(min) || 0)) return { suppressed: true, min }
  return { suppressed: false, ...segment }
}

// 캐시키 — team 을 앞에 두어 팀 단위 prefix invalidate 가 가능하게 하고, role 을 포함해
// 권한별 캐시를 분리한다(§13: 팀·권한·기간·metric·bucket 격리).
export function statsCacheKey({ scope = 'summary', teamId = '_', period = '_', metric = '_', bucket = '_', role = 'fan' } = {}) {
  return `stats:${teamId}:${scope}:${role}:${period}:${metric}:${bucket}`
}
// 팀 단위 캐시 무효화 prefix(사용자 행동 후 필요한 범위만).
export function teamCachePrefix(teamId) { return `stats:${teamId}:` }

// stale 판단 — updatedAt 이 ttl 보다 오래되면 stale. updatedAt 없으면 stale 로 본다.
export function isStale(updatedAt, ttlMs, now = Date.now()) {
  if (!updatedAt) return true
  const t = updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt).getTime()
  if (Number.isNaN(t)) return true
  return now - t > ttlMs
}

// 데이터 미수집(null) 과 0 을 구분(§17). value==null → { hasData:false }.
export function metricDisplay(value) {
  if (value == null) return { hasData: false, value: null }
  return { hasData: true, value: Number(value) }
}

// 로케일 숫자 포맷(천단위). 평점은 소수 1자리.
export function formatCount(n, locale = 'ko') {
  if (n == null) return '—'
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'ko-KR').format(Number(n))
}
export function formatRating(n, locale = 'ko') {
  if (n == null) return '—'
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(Number(n))
}

// Realtime 이벤트 병합 — 구독 이벤트가 오면 즉시 재조회가 원칙이지만, 낙관적 병합이
// 필요할 때 기존 stats 에 delta 를 안전히 반영(음수 방지). merge 는 순수.
export function mergeStatsDelta(prev, delta) {
  const out = { ...(prev || {}) }
  for (const [k, d] of Object.entries(delta || {})) {
    out[k] = Math.max(0, (Number(out[k]) || 0) + Number(d))
  }
  return out
}

// timeseries downsampling — 포인트가 많으면 균등 샘플링(차트 성능, §18). 순서 유지.
export function downsample(points, maxPoints = 60) {
  const arr = points || []
  if (arr.length <= maxPoints) return arr
  const step = arr.length / maxPoints
  const out = []
  for (let i = 0; i < maxPoints; i++) out.push(arr[Math.floor(i * step)])
  // 마지막 포인트는 항상 포함(최신값 보존)
  if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1])
  return out
}
