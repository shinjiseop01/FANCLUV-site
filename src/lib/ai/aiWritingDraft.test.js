import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initDraft, editCurrent, setPreview, clearPreview, applyPreview, undo,
  restoreOriginal, canUndo, canRestore, hasPreview, aiMeta,
} from './aiWritingDraft.js'

const preview = { operation: 'improve', outputText: '개선된 문장입니다.', titleSuggestions: [], warnings: [], requestId: 'req-1' }

test('AI result does not overwrite editor until applied', () => {
  let s = initDraft('원문입니다')
  s = setPreview(s, preview)
  assert.equal(s.current, '원문입니다')   // 입력창 그대로
  assert.ok(hasPreview(s))
})

test('apply updates current and records ai meta', () => {
  let s = initDraft('원문입니다')
  s = setPreview(s, preview)
  s = applyPreview(s)
  assert.equal(s.current, '개선된 문장입니다.')
  assert.equal(s.aiAssisted, true)
  assert.deepEqual(aiMeta(s), { aiAssisted: true, aiOperation: 'improve', aiRequestId: 'req-1' })
})

test('undo restores previous and clears ai flag when stack empties', () => {
  let s = initDraft('원문입니다')
  s = applyPreview(setPreview(s, preview))
  assert.ok(canUndo(s))
  s = undo(s)
  assert.equal(s.current, '원문입니다')
  assert.equal(s.aiAssisted, false)
  assert.equal(aiMeta(s).aiOperation, null)
})

test('restoreOriginal returns to pre-AI text', () => {
  let s = initDraft('진짜 원문')
  s = applyPreview(setPreview(s, preview))
  s = applyPreview(setPreview(s, { ...preview, outputText: '두번째 적용', requestId: 'req-2' }))
  assert.equal(s.current, '두번째 적용')
  assert.ok(canRestore(s))
  s = restoreOriginal(s)
  assert.equal(s.current, '진짜 원문')
  assert.equal(s.aiAssisted, false)
})

test('editing invalidates a pending preview (new original)', () => {
  let s = initDraft('원문입니다')
  s = setPreview(s, preview)
  s = editCurrent(s, '사용자가 새로 씀')
  assert.equal(hasPreview(s), false)  // 이전 AI 결과 무효화
  assert.equal(s.current, '사용자가 새로 씀')
})

test('cancel preview keeps current untouched', () => {
  let s = initDraft('원문입니다')
  s = setPreview(s, preview)
  s = clearPreview(s)
  assert.equal(hasPreview(s), false)
  assert.equal(s.current, '원문입니다')
})

test('no-op guards: undo/restore without history', () => {
  let s = initDraft('원문')
  assert.equal(canUndo(s), false)
  assert.deepEqual(undo(s), s)
  assert.equal(canRestore(s), false)
  assert.deepEqual(restoreOriginal(s), s)
})

test('apply of a selected title (explicit text) overrides outputText', () => {
  let s = initDraft('원문')
  s = setPreview(s, { ...preview, operation: 'titles', titleSuggestions: ['제목A', '제목B'] })
  s = applyPreview(s, '제목A')
  assert.equal(s.current, '제목A')
  assert.equal(s.aiOperation, 'titles')
})
