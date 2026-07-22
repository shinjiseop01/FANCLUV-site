// FANCLUV — AI 의견 작성 지원 패널(의견 작성 화면 내 임베드).
//
// 정책(§9, §10, §13): 사용자가 먼저 원문 입력 → AI 기능 선택 → loading → preview(원문/결과
// 비교) → 사용자가 "적용"해야 반영. 자동 게시 없음. 원문 보존·Undo·복원 지원. AI 결과는
// 받자마자 입력창을 덮어쓰지 않는다. kill switch 가 꺼지면 패널을 숨기고 수동 작성은 유지.
import { useState, useEffect, useRef } from 'react'
import { useLang } from '../../contexts/LanguageContext.jsx'
import { requestAiWriting, getAiEnabled } from '../../lib/ai/aiWritingRepo.js'
import { AI_DEFAULTS } from '../../lib/ai/aiWritingConfig.js'
import './AiWritingAssist.css'

const OPS = [
  { op: 'improve', icon: '✎' },
  { op: 'constructive', icon: '☺' },
  { op: 'summarize', icon: '≡' },
  { op: 'titles', icon: '“' },
  { op: 'structure', icon: '▤' },
]

// 안전성/오류 코드 → 사용자 안내(원문은 유지, 내부 오류 원문 미노출).
const ERROR_KEYS = {
  too_short: 'aiw.err.tooShort', too_long: 'aiw.err.tooLong', unsupported_operation: 'aiw.err.unsupported',
  rate_limited: 'aiw.err.rateLimited', daily_limit: 'aiw.err.dailyLimit', safety_blocked: 'aiw.err.safety',
  disabled: 'aiw.err.disabled', timeout: 'aiw.err.timeout', unavailable: 'aiw.err.unavailable',
  provider_error: 'aiw.err.provider', server_error: 'aiw.err.server', network_error: 'aiw.err.network',
}

export default function AiWritingAssist({ teamId, value, onApplyBody, onApplyTitle, onAiMeta, disabled }) {
  const { t, lang } = useLang()
  const [enabled, setEnabled] = useState(null) // null=확인중
  const [loadingOp, setLoadingOp] = useState(null)
  const [error, setError] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [preview, setPreview] = useState(null) // { operation, outputText, titleSuggestions, requestId, base }
  const [undoStack, setUndoStack] = useState([])
  const [preAiOriginal, setPreAiOriginal] = useState(null)
  const previewRef = useRef(null)

  useEffect(() => { let on = true; getAiEnabled().then(v => { if (on) setEnabled(v) }); return () => { on = false } }, [])

  // 새 원문 작성(외부 편집)으로 preview 무효화(§10).
  useEffect(() => {
    if (preview && value !== preview.base && value !== preview.outputText) setPreview(null)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  // preview 도착 시 포커스 이동(접근성).
  useEffect(() => { if (preview && previewRef.current) previewRef.current.focus() }, [preview])

  if (enabled === false) return null // kill switch OFF → 패널 숨김(수동 작성은 정상)

  const canRun = !disabled && !loadingOp && String(value || '').trim().length >= AI_DEFAULTS.minInputChars

  async function run(op) {
    if (loadingOp) return // 단일화(버튼 연타 방지)
    setError(null); setWarnings([])
    const text = String(value || '')
    if (text.trim().length < AI_DEFAULTS.minInputChars) { setError('too_short'); return }
    if (text.length > AI_DEFAULTS.maxInputChars) { setError('too_long'); return }
    setLoadingOp(op)
    const base = text
    const res = await requestAiWriting({ operation: op, sourceText: text, locale: lang, teamId })
    setLoadingOp(null)
    if (!res.ok) { setError(res.code || 'server_error'); setWarnings(res.warnings || []); return }
    setWarnings(res.warnings || [])
    setPreview({ operation: op, outputText: res.outputText, titleSuggestions: res.titleSuggestions || [], requestId: res.requestId, base })
  }

  function applyBody() {
    if (!preview) return
    setUndoStack(s => [...s, value])
    if (preAiOriginal === null) setPreAiOriginal(value)
    onApplyBody?.(preview.outputText)
    onAiMeta?.({ aiAssisted: true, aiOperation: preview.operation, aiRequestId: preview.requestId })
    setPreview(null)
  }
  function chooseTitle(tt) {
    onApplyTitle?.(tt)
    onAiMeta?.({ aiAssisted: true, aiOperation: 'titles', aiRequestId: preview?.requestId || null })
    setPreview(null)
  }
  function undo() {
    if (!undoStack.length) return
    const prev = undoStack[undoStack.length - 1]
    setUndoStack(s => s.slice(0, -1))
    onApplyBody?.(prev)
    if (undoStack.length - 1 === 0) onAiMeta?.({ aiAssisted: false, aiOperation: null, aiRequestId: null })
  }
  function restore() {
    if (preAiOriginal === null) return
    onApplyBody?.(preAiOriginal)
    setUndoStack([]); setPreAiOriginal(null); setPreview(null)
    onAiMeta?.({ aiAssisted: false, aiOperation: null, aiRequestId: null })
  }
  function cancel() { setPreview(null); setError(null) }

  const warnMsgs = (warnings || []).map(w => t(`aiw.warn.${w}`)).filter(m => m && !m.startsWith('aiw.warn.'))

  return (
    <section className="aiw" aria-label={t('aiw.panelLabel')}>
      <div className="aiw-head">
        <span className="aiw-title"><span className="aiw-spark" aria-hidden="true">✨</span>{t('aiw.title')}</span>
      </div>
      <p className="aiw-guide">{t('aiw.guide')}</p>

      <div className="aiw-ops" role="group" aria-label={t('aiw.opsLabel')}>
        {OPS.map(({ op, icon }) => (
          <button key={op} type="button" className="aiw-op" disabled={!!loadingOp || !canRun}
            aria-busy={loadingOp === op} onClick={() => run(op)} aria-label={t(`aiw.op.${op}`)}>
            <span className="aiw-op-ic" aria-hidden="true">{icon}</span>{t(`aiw.op.${op}`)}
            {loadingOp === op && <span className="aiw-spin" aria-hidden="true" />}
          </button>
        ))}
      </div>

      {!canRun && !loadingOp && String(value || '').trim().length < AI_DEFAULTS.minInputChars && (
        <p className="aiw-hint">{t('aiw.needInput')}</p>
      )}

      {/* loading 안내(aria-live) */}
      <div className="aiw-live" aria-live="polite">
        {loadingOp && <span className="aiw-loading">{t('aiw.loading')}</span>}
      </div>

      {/* 오류(원문은 유지) */}
      {error && (
        <div className="aiw-error" role="alert">
          <span>{t(ERROR_KEYS[error] || 'aiw.err.server')}</span>
          <button type="button" className="aiw-error-x" onClick={() => setError(null)} aria-label={t('common.close')}>×</button>
        </div>
      )}

      {/* preview / 비교 */}
      {preview && (
        <div className="aiw-preview" role="group" aria-label={t('aiw.previewLabel')} tabIndex={-1} ref={previewRef}
          onKeyDown={(e) => { if (e.key === 'Escape') cancel() }}>
          <div className="aiw-preview-badge" role="status">{t('aiw.draftBadge')}</div>

          {preview.operation === 'titles' ? (
            <div className="aiw-titles">
              <p className="aiw-sub">{t('aiw.titlesSub')}</p>
              <ul className="aiw-title-list">
                {preview.titleSuggestions.map((tt, i) => (
                  <li key={i} className="aiw-title-item">
                    <span className="aiw-title-text">{tt}</span>
                    <button type="button" className="aiw-mini" onClick={() => chooseTitle(tt)}>{t('aiw.chooseTitle')}</button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="aiw-compare">
              <div className="aiw-col">
                <span className="aiw-col-label">{t('aiw.original')}</span>
                <div className="aiw-col-box aiw-col-orig">{preview.base}</div>
              </div>
              <div className="aiw-col">
                <span className="aiw-col-label">{t('aiw.result')}</span>
                <div className="aiw-col-box aiw-col-result">{preview.outputText}</div>
              </div>
            </div>
          )}

          {warnMsgs.length > 0 && (
            <ul className="aiw-warnings">{warnMsgs.map((m, i) => <li key={i}>{m}</li>)}</ul>
          )}

          {preview.operation !== 'titles' && (
            <div className="aiw-actions">
              <button type="button" className="aiw-apply" onClick={applyBody}>{t('aiw.apply')}</button>
              <button type="button" className="aiw-ghost" onClick={() => run(preview.operation)}>{t('aiw.retry')}</button>
              <button type="button" className="aiw-ghost" onClick={cancel}>{t('aiw.cancel')}</button>
            </div>
          )}
          {preview.operation === 'titles' && (
            <div className="aiw-actions">
              <button type="button" className="aiw-ghost" onClick={() => run('titles')}>{t('aiw.retry')}</button>
              <button type="button" className="aiw-ghost" onClick={cancel}>{t('aiw.cancel')}</button>
            </div>
          )}
        </div>
      )}

      {/* Undo / 원문 복원 */}
      {(undoStack.length > 0 || preAiOriginal !== null) && (
        <div className="aiw-undo">
          {undoStack.length > 0 && <button type="button" className="aiw-ghost sm" onClick={undo}>{t('aiw.undo')}</button>}
          {preAiOriginal !== null && <button type="button" className="aiw-ghost sm" onClick={restore}>{t('aiw.restore')}</button>}
        </div>
      )}
    </section>
  )
}
