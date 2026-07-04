// FANCLUV — 회원가입 환영 이메일 발송 (Supabase Edge Function, Deno).
//
// body: { email, nickname } → Resend 로 환영 메일 발송.
// RESEND_API_KEY 미설정 시 실제 발송 없이 { ok:true, dev:true } 로 응답(개발 폴백).
//
// 배포(회원가입 직후 호출 — 로그인 세션이 없을 수 있어 JWT 검증 끔):
//   supabase functions deploy send-welcome-email --no-verify-jwt
// 시크릿(선택 — 실제 발송 시):
//   supabase secrets set RESEND_API_KEY=re_... EMAIL_FROM="FANCLUV <no-reply@fancluv.com>"
//
// ⚠️ RESEND_API_KEY 는 이 함수 환경에서만 사용(프론트 노출 금지).

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'FANCLUV <onboarding@resend.dev>'

  const { email, nickname } = await req.json().catch(() => ({}))
  const addr = (email || '').trim().toLowerCase()
  if (!addr) return json({ ok: false, error: 'no_email' })
  const name = (nickname || '').trim() || '팬'

  // 이메일 provider 미설정 → 개발 폴백(실제 발송 없음).
  if (!RESEND_API_KEY) return json({ ok: true, dev: true })

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h1 style="color:#2563EB">FANCLUV 에 오신 것을 환영합니다!</h1>
      <p>${name} 님, 가입을 진심으로 환영합니다. 이제 응원하는 구단을 선택하고
         팬 의견·설문·랭킹에 참여해 보세요.</p>
      <p style="color:#6b7280;font-size:13px">본 메일은 발신 전용입니다.</p>
    </div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to: addr, subject: 'FANCLUV 가입을 환영합니다 🎉', html }),
    })
    if (!res.ok) return json({ ok: false, error: 'send_failed' })
  } catch (_e) {
    return json({ ok: false, error: 'send_error' })
  }
  return json({ ok: true, sent: true })
})
