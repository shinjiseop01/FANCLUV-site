// FANCLUV — 이메일 인증번호 발송/검증 (Supabase Edge Function, Deno).
//
// action:'send'   → 6자리 코드 생성 → email_codes 저장(10분 만료) → 이메일 발송
//                   (RESEND_API_KEY 없으면 devCode 를 응답으로 돌려 화면 폴백)
// action:'verify' → email_codes 에서 코드/만료 확인 후 삭제
//
// 배포(브라우저가 로그인 전에도 호출 → JWT 없음):
//   supabase functions deploy send-email-code --no-verify-jwt
// 시크릿(선택 — 실제 발송 시):
//   supabase secrets set RESEND_API_KEY=re_... EMAIL_FROM="FANCLUV <no-reply@fancluv.com>"
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 자동 주입)
//
// ⚠️ service_role key / RESEND_API_KEY 는 이 함수 환경에서만 사용(프론트 노출 금지).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const CODE_TTL_MIN = 10

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'FANCLUV <onboarding@resend.dev>'

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  const { action, email, code } = await req.json().catch(() => ({}))
  const addr = (email || '').trim().toLowerCase()
  if (!addr) return json({ ok: false, error: 'no_email' })

  // ── 검증 ──
  if (action === 'verify') {
    const { data: row } = await admin.from('email_codes').select('*').eq('email', addr).maybeSingle()
    if (!row) return json({ ok: false, error: 'not_found' })
    if (new Date(row.expires_at).getTime() < Date.now()) return json({ ok: false, error: 'expired' })
    if (String(code || '').trim() !== row.code) return json({ ok: false, error: 'mismatch' })
    await admin.from('email_codes').delete().eq('email', addr) // 일회성
    return json({ ok: true })
  }

  // ── 발송 ──
  const newCode = String(Math.floor(100000 + Math.random() * 900000))
  const expires = new Date(Date.now() + CODE_TTL_MIN * 60000).toISOString()
  const { error: upErr } = await admin.from('email_codes')
    .upsert({ email: addr, code: newCode, expires_at: expires, created_at: new Date().toISOString() })
  if (upErr) return json({ ok: false, error: 'store_failed' })

  // 이메일 provider 미설정 → devCode 폴백(화면에 표시).
  if (!RESEND_API_KEY) return json({ ok: true, devCode: newCode })

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: addr,
        subject: 'FANCLUV 이메일 인증번호',
        html: `<p>FANCLUV 인증번호는 <strong style="font-size:20px">${newCode}</strong> 입니다.</p>`
          + `<p>${CODE_TTL_MIN}분 안에 입력해 주세요.</p>`,
      }),
    })
    if (!res.ok) return json({ ok: true, devCode: newCode }) // 발송 실패 시 폴백
  } catch (_e) {
    return json({ ok: true, devCode: newCode })
  }
  return json({ ok: true, sent: true })
})
