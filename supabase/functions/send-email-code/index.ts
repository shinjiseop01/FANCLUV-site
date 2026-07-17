// FANCLUV — 이메일 인증번호 발송/검증 (Supabase Edge Function, Deno).
//
// action:'send'    → 6자리 코드 생성 → email_codes 저장(10분 만료) → 이메일 발송
//                    (RESEND_API_KEY 없으면 devCode 를 응답으로 돌려 화면 폴백)
// action:'verify'  → email_codes 에서 코드/만료 확인 → verified_at 표식(레코드 유지, 코드 무효화)
// action:'confirm' → 회원가입 직후: 최근 코드 검증(verified_at) 확인 → 해당 userId 의
//                    auth 이메일을 서버측 확정(email_confirm) → 레코드 삭제. (0065)
//                    Supabase Confirm email 이 켜져 있어도 재확인 메일 없이 가입 완료.
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
// confirm(회원가입 직후 이메일 확정)이 유효한 "최근 코드 검증" 인정 시간.
// 코드 검증 → signUp → confirm 은 보통 수초 내 일어나므로 넉넉히 15분.
const CONFIRM_WINDOW_MIN = 15

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'FANCLUV <onboarding@resend.dev>'

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  const { action, email, code, userId } = await req.json().catch(() => ({}))
  const addr = (email || '').trim().toLowerCase()
  if (!addr) return json({ ok: false, error: 'no_email' })

  // ── 검증 ── 코드/만료 확인 성공 → verified_at 표식(레코드 유지). 코드는 무효화(일회성).
  //   레코드를 남기는 이유: 직후 confirm 액션이 "이 이메일은 코드로 인증됨"을 확인해
  //   auth 사용자 이메일을 서버측 확정하기 위함(이중 인증 제거, 0065).
  if (action === 'verify') {
    const { data: row } = await admin.from('email_codes').select('*').eq('email', addr).maybeSingle()
    if (!row) return json({ ok: false, error: 'not_found' })
    if (new Date(row.expires_at).getTime() < Date.now()) return json({ ok: false, error: 'expired' })
    if (String(code || '').trim() !== row.code) return json({ ok: false, error: 'mismatch' })
    // 코드를 무효화(replay 방지)하되 verified_at 표식은 남긴다.
    await admin.from('email_codes')
      .update({ code: '', verified_at: new Date().toISOString() })
      .eq('email', addr)
    return json({ ok: true })
  }

  // ── 확정 ── 회원가입 직후: 최근 코드 검증(verified_at) 을 확인하고, 그 이메일을
  //   소유한 userId 의 auth 이메일을 서버측 확정(email_confirm)한다. → Supabase 의
  //   재확인 메일 없이 가입 완료. 보안: verified_at 이 최근이 아니면(또는 없으면) 거부.
  if (action === 'confirm') {
    const uid = String(userId || '').trim()
    if (!uid) return json({ ok: false, error: 'no_user' })
    const { data: row } = await admin.from('email_codes').select('*').eq('email', addr).maybeSingle()
    if (!row || !row.verified_at) return json({ ok: false, error: 'not_verified' })
    if (Date.now() - new Date(row.verified_at).getTime() > CONFIRM_WINDOW_MIN * 60000)
      return json({ ok: false, error: 'stale' })
    // userId ↔ email 소유 일치 확인(임의 계정 확정 방지).
    const { data: got, error: getErr } = await admin.auth.admin.getUserById(uid)
    if (getErr || !got?.user) return json({ ok: false, error: 'user_not_found' })
    if ((got.user.email || '').trim().toLowerCase() !== addr) return json({ ok: false, error: 'email_mismatch' })
    if (!got.user.email_confirmed_at) {
      const { error: updErr } = await admin.auth.admin.updateUserById(uid, { email_confirm: true })
      if (updErr) {
        console.error('email_confirm failed:', JSON.stringify(updErr))
        return json({ ok: false, error: 'confirm_failed' })
      }
    }
    await admin.from('email_codes').delete().eq('email', addr) // 일회성 소진
    return json({ ok: true })
  }

  // ── 발송 ──
  const newCode = String(Math.floor(100000 + Math.random() * 900000))
  const expires = new Date(Date.now() + CODE_TTL_MIN * 60000).toISOString()
  const { error: upErr } = await admin.from('email_codes')
    .upsert({ email: addr, code: newCode, expires_at: expires, created_at: new Date().toISOString() },
      { onConflict: 'email' })
  if (upErr) {
    // 실제 DB 에러는 함수 로그에만 남긴다(클라이언트에는 내부 정보 미노출).
    console.error('email_codes upsert failed:', JSON.stringify(upErr))
    return json({ ok: false, error: 'store_failed' })
  }

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
