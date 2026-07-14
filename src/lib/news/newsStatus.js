// FANCLUV — 팀 뉴스 상태/태그/필터 순수 로직(프론트·테스트 공유). 서버(0060 RPC)와 규칙 동일.

export const NEWS_STATUSES = ['draft', 'scheduled', 'published', 'archived']

// 상태 전이 매트릭스 — news_transition_status RPC 와 1:1.
//   published→draft 금지, archived→published 금지.
export const NEWS_TRANSITIONS = {
  draft:     ['scheduled', 'published', 'archived'],
  scheduled: ['published', 'draft', 'archived'],
  published: ['archived'],
  archived:  ['draft'], // 복원(restore)
}

// 상태 표시 메타(아이콘/색상 tone/라벨키).
export const NEWS_STATUS_META = {
  draft:     { tone: 'muted', labelKey: 'news.st.draft' },
  scheduled: { tone: 'info',  labelKey: 'news.st.scheduled' },
  published: { tone: 'ok',    labelKey: 'news.st.published' },
  archived:  { tone: 'warn',  labelKey: 'news.st.archived' },
}

export function canTransition(from, to) {
  return (NEWS_TRANSITIONS[from] || []).includes(to)
}

// 전이 → audit 액션(표시/검증용, 서버 트리거와 동일 규칙).
export function transitionAction(from, to) {
  if (to === 'published') return 'news.publish'
  if (to === 'scheduled') return 'news.schedule'
  if (to === 'archived') return 'news.archive'
  if (to === 'draft') return from === 'archived' ? 'news.restore' : 'news.draft'
  return null
}

// 추천 태그(사용자 정의도 허용).
export const SUGGESTED_TAGS = ['선수', '감독', '이적', '부상', '경기', '팬서비스', '이벤트', '유소년', '구단공지']

export const MAX_PINNED = 3

// 태그 정규화: 트림 + 빈값 제거 + 대소문자 무시 중복 제거(첫 표기 유지) + 입력 순서 유지.
export function normalizeTags(tags) {
  const out = []
  const seen = new Set()
  for (const raw of tags || []) {
    const t = String(raw ?? '').trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

// 관리자 필터/정렬 → 서버 쿼리 파라미터(순수). LIKE 남발 대신 상태/팀/태그/기간 인덱스 활용.
export const NEWS_SORTS = {
  newest:   { column: 'created_at', ascending: false },
  oldest:   { column: 'created_at', ascending: true },
  views:    { column: 'view_count', ascending: false },
  schedule: { column: 'publish_at', ascending: true },
}

export function sortSpec(sort) {
  return NEWS_SORTS[sort] || NEWS_SORTS.newest
}

// 필터 객체 유효성/정규화(빈 값 제거). status 는 유효값만.
export function normalizeFilters(f = {}) {
  const out = {}
  if (NEWS_STATUSES.includes(f.status)) out.status = f.status
  if (f.team) out.team = String(f.team)
  if (f.author) out.author = String(f.author)
  if (f.tag) out.tag = String(f.tag).trim()
  if (f.pinned === true) out.pinned = true
  if (f.q && String(f.q).trim()) out.q = String(f.q).trim()
  if (f.from) out.from = f.from
  if (f.to) out.to = f.to
  return out
}
