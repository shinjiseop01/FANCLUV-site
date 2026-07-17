// FANCLUV — 이메일 인증번호(OTP) 발송/검증 (Supabase Edge Function, Deno).
//
// 보안 원칙(0066):
//   • OTP 평문은 어디에도 저장/반환/로그하지 않는다. DB 에는 HMAC-SHA256(code_hash)만.
//   • 실제 이메일 발송 성공이 가입 전제 — 발송 공급자(RESEND) 미설정/실패 시 인증 진행 불가.
//   • 검증은 서버에서 입력값을 동일 HMAC 으로 해시해 비교. 실패 횟수 제한(무차별 대입 방지).
//   • 1회용: 검증 성공 시 code_hash 소진(consumed) → 재사용/replay 불가.
//
// action:'send'    → 이메일 형식 검증 → RESEND 로 발송(성공해야) → code_hash 저장(10분).
//                    실패: email_provider_unconfigured / email_send_failed (코드 미반환)
// action:'verify'  → 입력 OTP 해시 비교(만료/소진/시도초과 확인) → verified_at 표식, 소진.
// action:'confirm' → 가입 직후: 최근 verified_at 확인 + userId↔email 일치 → email_confirm.
// action:'test_issue' → 테스트 하니스 전용(TEST_HARNESS_KEY + test_ 접두사 + 비-프로덕션).
//                    이메일 미발송, 코드 반환(자동 테스트용). 프로덕션 ref 는 무조건 거부.
//
// 배포: supabase functions deploy send-email-code --no-verify-jwt
// 시크릿(실발송): supabase secrets set RESEND_API_KEY=re_... EMAIL_FROM="..."
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 자동 주입)
//
// ⚠️ service_role key / RESEND_API_KEY / TEST_HARNESS_KEY 는 이 함수 환경에서만 사용.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const CODE_TTL_MIN = 10
const CONFIRM_WINDOW_MIN = 15
const MAX_ATTEMPTS = 5 // OTP 검증 실패 허용 횟수(초과 시 잠금 → 재전송 필요)
// 프로덕션 project ref — 테스트 전용 액션은 이 ref 에서 절대 실행하지 않는다.
const PROD_REF = 'cuuzbddxnzhhlrqmmebz'

// 이메일 형식(서버측) — 도달성 아닌 형식 검증. local@domain.tld 구조 + 라벨/TLD.
function isValidEmail(s: string): boolean {
  if (!s || s.length > 254) return false
  const at = s.lastIndexOf('@')
  if (at <= 0 || at === s.length - 1) return false
  const local = s.slice(0, at), domain = s.slice(at + 1)
  if (local.length > 64) return false
  if (!/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)) return false
  const labels = domain.split('.')
  if (labels.length < 2) return false
  if (!labels.every(l => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(l))) return false
  return /^[A-Za-z]{2,}$/.test(labels[labels.length - 1])
}

// OTP → HMAC-SHA256 hex. 키는 service_role(서버 전용 고엔트로피 시크릿). 평문 저장 대체.
async function hmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const gen6 = () => String(Math.floor(100000 + Math.random() * 900000))
const reqId = () => crypto.randomUUID()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'FANCLUV <onboarding@resend.dev>'
  const TEST_HARNESS_KEY = Deno.env.get('TEST_HARNESS_KEY')
  const isProdProject = SUPABASE_URL.includes(PROD_REF)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  const { action, email, code, userId, testKey } = await req.json().catch(() => ({}))
  const addr = (email || '').trim().toLowerCase()
  if (!addr) return json({ ok: false, error: 'no_email' })

  // 공통: OTP 발급 + 저장(해시). Resend 발송은 호출부에서 결정(send=발송 필수 / test_issue=미발송).
  async function issue(): Promise<string> {
    const codePlain = gen6()
    const codeHash = await hmac(SERVICE_ROLE, `${addr}:${codePlain}`)
    const { data: prev } = await admin.from('email_codes').select('resend_count').eq('email', addr).maybeSingle()
    const expires = new Date(Date.now() + CODE_TTL_MIN * 60000).toISOString()
    await admin.from('email_codes').upsert({
      email: addr, code: null, code_hash: codeHash, expires_at: expires,
      created_at: new Date().toISOString(), verified_at: null, consumed_at: null,
      attempt_count: 0, resend_count: ((prev?.resend_count ?? 0) + 1), request_id: reqId(),
    }, { onConflict: 'email' })
    return codePlain
  }

  // ── 발송 ── 형식 검증 → 발송 공급자 필수 → 발송 성공해야 코드 저장. 코드는 반환하지 않는다.
  if (action === 'send') {
    if (!isValidEmail(addr)) return json({ ok: false, error: 'invalid_email' })
    // 발송 공급자 미설정 → 인증 진행 불가(Mock/devCode 폴백 금지).
    if (!RESEND_API_KEY) {
      console.error('email send blocked: provider unconfigured')
      return json({ ok: false, error: 'email_provider_unconfigured' })
    }
    const codePlain = gen6()
    const rid = reqId()
    // 먼저 발송을 시도하고, 성공한 경우에만 해시를 저장한다(발송 실패 시 인증 불가).
    let sent = false
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: EMAIL_FROM, to: addr, subject: 'FANCLUV 이메일 인증번호',
          html: `<p>FANCLUV 인증번호는 <strong style="font-size:20px">${codePlain}</strong> 입니다.</p>`
            + `<p>${CODE_TTL_MIN}분 안에 입력해 주세요.</p>`,
        }),
      })
      sent = res.ok
      if (!res.ok) console.error(`resend failed: HTTP ${res.status} req=${rid}`)
    } catch (_e) {
      console.error(`resend threw req=${rid}`)
    }
    if (!sent) return json({ ok: false, error: 'email_send_failed' })

    const codeHash = await hmac(SERVICE_ROLE, `${addr}:${codePlain}`)
    const { data: prev } = await admin.from('email_codes').select('resend_count').eq('email', addr).maybeSingle()
    const { error: upErr } = await admin.from('email_codes').upsert({
      email: addr, code: null, code_hash: codeHash,
      expires_at: new Date(Date.now() + CODE_TTL_MIN * 60000).toISOString(),
      created_at: new Date().toISOString(), verified_at: null, consumed_at: null,
      attempt_count: 0, resend_count: ((prev?.resend_count ?? 0) + 1), request_id: rid,
    }, { onConflict: 'email' })
    if (upErr) { console.error(`email_codes upsert failed req=${rid}`); return json({ ok: false, error: 'store_failed' }) }
    return json({ ok: true, sent: true }) // 코드 미반환
  }

  // ── 테스트 하니스 전용 발급 ── 이메일 미발송, 코드 반환. 프로덕션/비인가 요청은 거부.
  if (action === 'test_issue') {
    if (isProdProject) return json({ ok: false, error: 'forbidden_production' }, 403)
    if (!TEST_HARNESS_KEY || testKey !== TEST_HARNESS_KEY) return json({ ok: false, error: 'forbidden' }, 403)
    if (!addr.startsWith('test_')) return json({ ok: false, error: 'test_prefix_required' }, 400)
    const codePlain = await issue()
    return json({ ok: true, code: codePlain, test: true })
  }

  // ── 검증 ── 입력 OTP 해시 비교. 만료/소진/시도초과 확인, 실패 시 attempt_count 증가.
  if (action === 'verify') {
    const { data: row } = await admin.from('email_codes').select('*').eq('email', addr).maybeSingle()
    if (!row) return json({ ok: false, error: 'not_found' })
    // 소진(검증 완료) 확인을 먼저 — 성공 시 code_hash 를 지우므로 not_found 로 오분류되지 않게.
    if (row.consumed_at) return json({ ok: false, error: 'consumed' })
    if (!row.code_hash) return json({ ok: false, error: 'not_found' })
    if (new Date(row.expires_at).getTime() < Date.now()) return json({ ok: false, error: 'expired' })
    if ((row.attempt_count ?? 0) >= MAX_ATTEMPTS) return json({ ok: false, error: 'too_many_attempts' })
    const inputHash = await hmac(SERVICE_ROLE, `${addr}:${String(code || '').trim()}`)
    if (inputHash !== row.code_hash) {
      await admin.from('email_codes').update({ attempt_count: (row.attempt_count ?? 0) + 1 }).eq('email', addr)
      return json({ ok: false, error: 'mismatch' })
    }
    // 성공: 이메일 소유 증명(verified_at) + OTP 소진(consumed_at, code_hash 제거) → 재사용 불가.
    await admin.from('email_codes')
      .update({ verified_at: new Date().toISOString(), consumed_at: new Date().toISOString(), code_hash: null })
      .eq('email', addr)
    return json({ ok: true })
  }

  // ── 확정 ── 가입 직후: 최근 verified_at + userId↔email 일치 → auth 이메일 서버측 확정.
  if (action === 'confirm') {
    const uid = String(userId || '').trim()
    if (!uid) return json({ ok: false, error: 'no_user' })
    const { data: row } = await admin.from('email_codes').select('*').eq('email', addr).maybeSingle()
    if (!row || !row.verified_at) return json({ ok: false, error: 'not_verified' })
    if (Date.now() - new Date(row.verified_at).getTime() > CONFIRM_WINDOW_MIN * 60000)
      return json({ ok: false, error: 'stale' })
    const { data: got, error: getErr } = await admin.auth.admin.getUserById(uid)
    if (getErr || !got?.user) return json({ ok: false, error: 'user_not_found' })
    if ((got.user.email || '').trim().toLowerCase() !== addr) return json({ ok: false, error: 'email_mismatch' })
    if (!got.user.email_confirmed_at) {
      const { error: updErr } = await admin.auth.admin.updateUserById(uid, { email_confirm: true })
      if (updErr) { console.error('email_confirm failed'); return json({ ok: false, error: 'confirm_failed' }) }
    }
    await admin.from('email_codes').delete().eq('email', addr) // 소진
    return json({ ok: true })
  }

  return json({ ok: false, error: 'unknown_action' })
})
