// FANCLUV — AI 작성 지원: 원문 보호 + Preview/적용/Undo 상태 머신(순수 함수).
//
// 정책(§9, §10):
//  - AI 결과는 받자마자 입력창을 덮어쓰지 않는다 → preview 단계를 거쳐 "적용"해야 반영.
//  - AI 적용 전 원문을 안전하게 보존(preAiOriginal) → "원문으로 복원" 가능.
//  - 적용 취소(undo) 지원(단계별). 새로운 원문 작성 시 이전 preview 무효화.
//  - 자동 게시 없음 — 이 머신은 편집 텍스트만 다루고 게시는 별도 사용자 행동.
//
// 모든 함수는 입력 state 를 변형하지 않고 새 state 를 반환한다.

export function initDraft(text = '') {
  return {
    current: String(text),        // 편집창의 현재 텍스트
    preview: null,                // { operation, outputText, titleSuggestions, warnings, requestId }
    previewBase: null,            // preview 가 기준으로 삼은 current(변경 감지용)
    undoStack: [],               // 적용 이력(단계별 undo)
    preAiOriginal: null,          // 최초 AI 적용 직전의 원문(복원 기준). null=아직 AI 미적용
    aiAssisted: false,
    aiOperation: null,
    aiRequestId: null,
  }
}

// 사용자가 편집창을 직접 수정. preview 기준과 달라지면 이전 preview 를 무효화한다.
export function editCurrent(state, text) {
  const current = String(text)
  const invalidate = state.preview && current !== state.previewBase
  return {
    ...state,
    current,
    preview: invalidate ? null : state.preview,
    previewBase: invalidate ? null : state.previewBase,
  }
}

// AI 결과 수신 → preview 로 보관(입력창은 덮어쓰지 않음).
export function setPreview(state, preview) {
  return { ...state, preview, previewBase: state.current }
}

// preview 취소(적용하지 않음).
export function clearPreview(state) {
  return { ...state, preview: null, previewBase: null }
}

// preview 적용 → current 갱신. text 미지정 시 preview.outputText 사용.
// (제목 추천처럼 본문 대체가 아닌 경우 컴포넌트가 별도 처리하고 이 함수는 쓰지 않는다.)
export function applyPreview(state, text) {
  if (!state.preview) return state
  const applied = text !== undefined ? String(text) : String(state.preview.outputText || '')
  const preAiOriginal = state.preAiOriginal === null ? state.current : state.preAiOriginal
  return {
    ...state,
    preAiOriginal,
    undoStack: [...state.undoStack, state.current],
    current: applied,
    aiAssisted: true,
    aiOperation: state.preview.operation,
    aiRequestId: state.preview.requestId || null,
    preview: null,
    previewBase: null,
  }
}

// 적용 취소(단계별). 스택이 비면 AI 표시 해제.
export function undo(state) {
  if (!state.undoStack.length) return state
  const undoStack = state.undoStack.slice(0, -1)
  const current = state.undoStack[state.undoStack.length - 1]
  const emptied = undoStack.length === 0
  return {
    ...state,
    current,
    undoStack,
    aiAssisted: emptied ? false : state.aiAssisted,
    aiOperation: emptied ? null : state.aiOperation,
    aiRequestId: emptied ? null : state.aiRequestId,
    preview: null,
    previewBase: null,
  }
}

// 원문으로 복원(최초 AI 적용 직전 텍스트로). AI 미적용이면 변화 없음.
export function restoreOriginal(state) {
  if (state.preAiOriginal === null) return state
  return {
    ...state,
    current: state.preAiOriginal,
    undoStack: [],
    preAiOriginal: null,
    aiAssisted: false,
    aiOperation: null,
    aiRequestId: null,
    preview: null,
    previewBase: null,
  }
}

// ── 셀렉터 ───────────────────────────────────────────────────────────
export function canUndo(state) { return state.undoStack.length > 0 }
export function canRestore(state) { return state.preAiOriginal !== null }
export function hasPreview(state) { return !!state.preview }

// 게시 시 opinions 에 기록할 메타(최종 확정 텍스트는 별도).
export function aiMeta(state) {
  return {
    aiAssisted: !!state.aiAssisted,
    aiOperation: state.aiOperation || null,
    aiRequestId: state.aiRequestId || null,
  }
}
