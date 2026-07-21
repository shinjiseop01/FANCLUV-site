// FANCLUV — AI 의견 작성 지원 (Supabase Edge Function, Deno).
//
// 팬이 직접 입력한 원문을 "정리"하는 작성 보조. AI 가 대신 생성/게시하지 않는다.
// 이번 Phase 는 외부 유료 API 를 연결하지 않고 결정론적 Mock Provider 로 전 흐름을 검증한다.
//
// 서버 강제(§6, §8): 로그인 필수 · operation/길이/크기/locale 검증 · kill switch ·
//   안전성 검사 · rate/일 한도 · 동일요청 중복 억제(모두 ai_writing_begin RPC 원자 처리).
// 개인정보(§6): JWT/이메일/DI/IP/PII 를 Provider 에 전달하지 않는다. 원문/출력은 저장하지 않는다.
// 배포: supabase functions deploy ai-writing-assist (verify_jwt=true — 로그인 팬만).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const OPERATIONS = ['improve', 'constructive', 'summarize', 'titles', 'structure']
const LOCALES = ['ko', 'en']
const MIN_INPUT = 10, MAX_INPUT = 2000, MAX_OUTPUT = 4000, MAX_BYTES = 12000

// ── 안전성(포트: aiWritingSafety.js 미러) ──────────────────────────────
const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const RE_RRN = /\b\d{6}\s?[-]\s?[1-4]\d{6}\b/g
const RE_ACCOUNT = /\b\d{2,6}-\d{2,6}-\d{2,7}\b|\b\d{11,16}\b/g
const RE_PHONE = /(?:\+?82[-\s]?)?0\d{1,2}[-\s]\d{3,4}[-\s]\d{4}\b/g
const RE_ADDR = /(?:[가-힣]{1,10}(?:시|도)\s?)?[가-힣]{1,10}(?:구|군)\s?[가-힣]{0,10}(?:로|길)\s?\d+|\d+\s?(?:번지|동\s?\d+\s?호)/g
const RE_URL = /https?:\/\/[^\s]+/gi
const THREAT = ['죽여', '죽이', '죽여버', '때려죽', '없애버', '패버', '칼로', '총으로', '불질러', '테러', 'kill you', 'i will kill', 'murder you', 'beat you', 'shoot you', 'bomb', 'burn down']
const HATE = ['혐오', '역겨운 종족', 'subhuman', 'go back to your country']
const PROFAN = ['시발', '씨발', '개새끼', '병신', '좆', '엿먹', 'fuck', 'shit', 'asshole', 'bastard']
const INJECTION = [/이전\s*(지시|명령|지침)[\s\S]{0,6}무시/i, /시스템\s*(프롬프트|메시지)[\s\S]{0,6}(보여|출력|공개|알려)/i, /관리자\s*권한[\s\S]{0,6}(실행|접근)/i, /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts)/i, /reveal\s+(your\s+)?(system\s+)?(prompt|instructions)/i, /(act|behave)\s+as\s+(an?\s+)?(admin|developer|dan|system)/i, /developer\s+mode/i]
const has = (l: string, words: string[]) => words.some((w) => l.includes(w.toLowerCase()))

function maskPii(t: string): string {
  return String(t || '').replace(RE_RRN, '[주민번호]').replace(RE_PHONE, '[연락처]').replace(RE_ACCOUNT, '[계좌]').replace(RE_EMAIL, '[이메일]').replace(RE_ADDR, '[주소]')
}
function analyzeSafety(text: string) {
  const s = String(text || ''), lower = s.toLowerCase()
  const cats: { code: string; sev: string }[] = []
  const noPhoneRrn = s.replace(RE_RRN, ' ').replace(RE_PHONE, ' ')
  if (RE_RRN.test(s)) cats.push({ code: 'pii_rrn', sev: 'block' })
  if (RE_ACCOUNT.test(noPhoneRrn)) cats.push({ code: 'pii_account', sev: 'block' })
  if (RE_EMAIL.test(s)) cats.push({ code: 'pii_email', sev: 'warn' })
  if (RE_PHONE.test(s)) cats.push({ code: 'pii_phone', sev: 'warn' })
  if (RE_ADDR.test(s)) cats.push({ code: 'pii_address', sev: 'warn' })
  if (has(lower, THREAT)) cats.push({ code: 'threat', sev: 'block' })
  if (has(lower, HATE)) cats.push({ code: 'hate', sev: 'warn' })
  if (has(lower, PROFAN)) cats.push({ code: 'profanity', sev: 'warn' })
  if (/(.)\1{9,}/.test(s)) cats.push({ code: 'repetition', sev: 'info' })
  if ((s.match(RE_URL) || []).length >= 3) cats.push({ code: 'spam', sev: 'info' })
  if (INJECTION.some((re) => re.test(s))) cats.push({ code: 'prompt_injection', sev: 'info' })
  const rank: Record<string, number> = { none: 0, info: 1, warn: 2, block: 3 }
  let sev = 'none'
  for (const c of cats) if (rank[c.sev] > rank[sev]) sev = c.sev
  return { ok: sev !== 'block', severity: sev, warnings: [...new Set(cats.map((c) => c.code))] }
}

// ── Mock Provider(포트: mockAiWritingProvider.js 미러) ─────────────────
const collapse = (s: string) => String(s || '').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s+([,.!?…])/g, '$1').trim()
const dedupeWords = (s: string) => s.replace(/\b(\S+)(\s+\1\b)+/g, '$1')
const splitSent = (s: string) => String(s || '').split(/(?<=[.!?。])\s+|(?<=다[.!?])\s*|\n+/).map((x) => x.trim()).filter(Boolean)
const endPunct = (s: string) => { const t = s.trim(); return !t || /[.!?…。]$/.test(t) ? t : t + '.' }
const capEn = (s: string) => s.replace(/^([a-z])/, (m) => m.toUpperCase())
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trim() + '…' : s)
const SOFT_KO: [RegExp, string][] = [[/진짜\s*최악[가-힣]*/g, '많이 아쉬웠습니다'], [/최악[가-힣]*/g, '아쉬웠습니다'], [/짜증[가-힣]*/g, '불편했습니다'], [/개판[가-힣]*/g, '정리가 필요해 보였습니다'], [/엉망[가-힣]*/g, '개선이 필요해 보였습니다'], [/화가\s*난다|빡친다[가-힣]*/g, '아쉬웠습니다']]
const SOFT_EN: [RegExp, string][] = [[/\b(the\s+)?worst\b/gi, 'quite disappointing'], [/\bterrible\b/gi, 'disappointing'], [/\bawful\b/gi, 'frustrating'], [/\bhate\b/gi, 'am unhappy with']]
const PROFAN_STRIP = /시발|씨발|개새끼|병신|좆|엿먹|\bfuck\w*\b|\bshit\b|\basshole\b|\bbastard\b/gi
const IMPROVE_HINT = /(개선|바랍|바라|요청|했으면|하면\s*좋|필요|부탁|improve|please|should|need|request)/i
const IMPACT_HINT = /(느꼈|불편|힘들|아쉽|아쉬웠|영향|때문에|difficult|uncomfortable|frustrat|impact|because)/i
const BENEFIT_HINT = /(기대|효과|도움|좋아질|나아질|benefit|expect|help|better)/i
function soften(text: string, locale: string) {
  let s = text
  for (const [re, rep] of (locale === 'en' ? SOFT_EN : SOFT_KO)) s = s.replace(re, rep)
  return collapse(s.replace(PROFAN_STRIP, ' '))
}
function runMock(operation: string, sourceRaw: string, locale: string) {
  const safety = analyzeSafety(sourceRaw)
  if (!safety.ok) return { success: false, code: 'safety_blocked', safety }
  const src = maskPii(sourceRaw)
  let outputText = '', titles: string[] = []
  if (operation === 'improve') {
    outputText = splitSent(dedupeWords(collapse(src))).map((x) => { let t = endPunct(x); if (locale === 'en') t = capEn(t); return t }).join(' ') || collapse(src)
  } else if (operation === 'constructive') {
    const body = splitSent(soften(collapse(src), locale)).map((x) => endPunct(x)).join(' ')
    const closing = locale === 'en' ? 'I would appreciate it if this could be reviewed and improved.' : '해당 부분을 검토하고 개선해 주시면 감사하겠습니다.'
    outputText = IMPROVE_HINT.test(sourceRaw) ? body : `${body} ${closing}`.trim()
  } else if (operation === 'summarize') {
    const ss = splitSent(collapse(src)); const primary = ss.find((s) => IMPROVE_HINT.test(s)) || ss[0]
    const picks = ss.length ? [ss[0]] : [collapse(src)]; if (primary && primary !== ss[0]) picks.push(primary)
    outputText = clip(picks.map((s) => endPunct(s)).join(' '), 140)
  } else if (operation === 'titles') {
    const ss = splitSent(collapse(soften(src, locale))); const first = ss[0] || collapse(src)
    const head = clip(first.split(/\s+/).filter(Boolean).slice(0, 8).join(' '), 30)
    titles = (locale === 'en' ? [clip(first, 40), `Feedback on ${head}`, `Request: ${head}`] : [clip(first, 30), `${head} 관련 의견`, `${head} 개선 요청`]).filter(Boolean).slice(0, 3)
    outputText = titles.join('\n')
  } else if (operation === 'structure') {
    const L = locale === 'en' ? { exp: 'Experience / Issue', impact: 'Impact felt', req: 'Improvement request', benefit: 'Expected effect', todo: '(please add if applicable)' } : { exp: '경험 또는 문제', impact: '팬이 느낀 영향', req: '개선 요청', benefit: '기대 효과', todo: '(해당 시 직접 작성해 주세요)' }
    const b: Record<string, string[]> = { exp: [], impact: [], req: [], benefit: [] }
    for (const s of splitSent(collapse(src))) { if (IMPROVE_HINT.test(s)) b.req.push(s); else if (BENEFIT_HINT.test(s)) b.benefit.push(s); else if (IMPACT_HINT.test(s)) b.impact.push(s); else b.exp.push(s) }
    const line = (label: string, arr: string[]) => `• ${label}: ${arr.length ? arr.map((x) => endPunct(x)).join(' ') : L.todo}`
    outputText = [line(L.exp, b.exp), line(L.impact, b.impact), line(L.req, b.req), line(L.benefit, b.benefit)].join('\n')
  } else {
    return { success: false, code: 'unsupported_operation', safety }
  }
  return { success: true, outputText: outputText.slice(0, MAX_OUTPUT), titles, safety }
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

  // 로그인 사용자만(§6). 비로그인 차단.
  const authHeader = req.headers.get('Authorization') || ''
  const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json({ ok: false, code: 'unauthorized' }, 401)

  // 요청 크기 제한(§6)
  const rawBody = await req.text()
  if (rawBody.length > MAX_BYTES) return json({ ok: false, code: 'too_long' })
  let body: any = {}
  try { body = JSON.parse(rawBody || '{}') } catch { return json({ ok: false, code: 'bad_request' }) }

  const operation = String(body.operation || '')
  const locale = LOCALES.includes(body.locale) ? body.locale : 'ko'
  const sourceText = String(body.sourceText ?? '')
  const clientReqId = body.requestId ? String(body.requestId).slice(0, 64) : null

  if (!OPERATIONS.includes(operation)) return json({ ok: false, code: 'unsupported_operation' })
  const trimmed = sourceText.trim()
  if (trimmed.length < MIN_INPUT) return json({ ok: false, code: 'too_short' })
  if (sourceText.length > MAX_INPUT) return json({ ok: false, code: 'too_long' })

  // 중복 억제 키 = operation + 정규화 원문의 해시(원문 자체는 전송/저장하지 않음).
  const normalized = trimmed.replace(/\s+/g, ' ')
  const dedupeHash = (await sha256Hex(`${operation}\n${normalized}`)).slice(0, 40)

  // 원자 시작: kill switch · rate/일 한도 · 중복 억제 · 직렬화(연타/동시 → 1회).
  const { data: begin, error: beginErr } = await caller.rpc('ai_writing_begin', { p_operation: operation, p_dedupe_hash: dedupeHash })
  if (beginErr) return json({ ok: false, code: 'server_error' }, 500)
  const b = begin as { ok: boolean; code: string; request_id?: string }

  // 중복이면 결정론적 Mock 결과를 재계산해 반환(새 provider 비용 없음, 새 완료기록 없음).
  if (!b.ok && b.code !== 'duplicate') {
    return json({ ok: false, code: b.code }) // rate_limited | daily_limit | disabled | unauthorized 등
  }
  const requestId = b.request_id || clientReqId

  // Provider 실행(Mock, 결정론적). 예외/타임아웃은 내부 원문 노출 없이 일반 코드로.
  let result: any
  try {
    result = runMock(operation, sourceText, locale)
  } catch (_e) {
    if (b.ok && b.request_id) await caller.rpc('ai_writing_complete', { p_request_id: b.request_id, p_status: 'failed', p_provider: 'mock', p_model: 'mock-deterministic-v1', p_source_length: sourceText.length, p_output_length: 0, p_input_units: 0, p_output_units: 0, p_safety: null, p_error_code: 'provider_error' })
    return json({ ok: false, code: 'provider_error' }, 500)
  }

  const status = result.success ? 'success' : (result.code === 'safety_blocked' ? 'safety_blocked' : 'failed')
  const outLen = result.success ? result.outputText.length : 0

  // 완료 기록(메타만) — 중복 경로(b.ok=false)는 begin 이 이미 'duplicate' 행을 남겼으므로 갱신 안 함.
  if (b.ok && b.request_id) {
    await caller.rpc('ai_writing_complete', {
      p_request_id: b.request_id, p_status: status, p_provider: 'mock', p_model: 'mock-deterministic-v1',
      p_source_length: sourceText.length, p_output_length: outLen,
      p_input_units: sourceText.length, p_output_units: outLen,
      p_safety: result.safety?.severity || null, p_error_code: result.success ? null : (result.code || 'failed'),
    })
  }

  if (!result.success) {
    return json({ ok: false, code: result.code, warnings: result.safety?.warnings || [] })
  }
  return json({
    ok: true,
    operation,
    outputText: result.outputText,
    titleSuggestions: result.titles || [],
    warnings: result.safety?.warnings || [],
    provider: 'mock',
    model: 'mock-deterministic-v1',
    requestId,
    usage: { estimatedInputUnits: sourceText.length, estimatedOutputUnits: outLen },
    safety: { severity: result.safety?.severity || 'none' },
    duplicateSuppressed: !b.ok && b.code === 'duplicate',
  })
})
