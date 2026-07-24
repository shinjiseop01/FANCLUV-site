// FANCLUV Feedback Loop — 순수 판정 헬퍼(팬 공개 규칙). DB RPC(fan_club_feedback / club_publish_action)의
// WHERE·검증과 동일한 규칙을 클라이언트에서도 일관되게 적용/테스트하기 위한 모듈.
//
// 팬 공개(구단 피드백) 노출 규칙:
//   is_published === true  AND  status === 'done'  AND  공개 제목/요약이 모두 비어있지 않음.
//   (status 가 done 이 아니게 되면 서버 트리거가 is_published 를 자동 해제하지만, read 도 이중 방어.)

const COMPLETED_STATUS = 'done'

export function nonEmpty(s) {
  return typeof s === 'string' && s.trim().length > 0
}

// 팬에게 공개 노출 가능한 조치인가.
export function isFanVisible(action) {
  if (!action) return false
  return action.is_published === true
    && action.status === COMPLETED_STATUS
    && nonEmpty(action.public_title)
    && nonEmpty(action.public_summary)
}

// 공개 시도 가능한 상태인가(완료된 조치만 공개 가능).
export function canPublish(action) {
  return !!action && action.status === COMPLETED_STATUS
}

// 공개 입력(제목/요약) 검증 — 서버 RPC 와 동일한 실패 코드 반환.
export function validatePublicFields({ title, summary } = {}) {
  if (!nonEmpty(title) || !nonEmpty(summary)) return { ok: false, code: 'missing_public_fields' }
  return { ok: true }
}

// 팬 응답에 노출해도 되는 공개 필드 화이트리스트(내부 필드 유입 방지용 참고 상수).
export const FAN_PUBLIC_FIELDS = ['id', 'club_id', 'public_title', 'public_summary', 'category', 'completed_at', 'published_at']

// 내부 전용 필드(팬 응답에 절대 포함 금지) — 방어적 sanitize 에 사용.
export const INTERNAL_FIELDS = ['description', 'result_note', 'before_kpi', 'after_kpi', 'ai_insight_id', 'report_id', 'created_by', 'published_by', 'week']

// 방어적 sanitize: 어떤 이유로든 내부 필드가 섞인 객체에서 공개 필드만 추린다.
export function toFanFeedback(row) {
  if (!row) return null
  const out = {}
  for (const k of FAN_PUBLIC_FIELDS) if (k in row) out[k] = row[k]
  return out
}
