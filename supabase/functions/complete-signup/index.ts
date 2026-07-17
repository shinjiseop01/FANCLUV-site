// FANCLUV — 회원가입 완료(서버 권위) Edge Function (Deno).
//
// 목적: FANCLUV 자체 OTP 인증을 마친 사용자를 서버에서 직접 생성한다. Supabase 의
//   Confirm Email 설정에 의존하지 않고 email_confirm:true 로 확정 생성하므로,
//   "확인 메일을 보냈습니다" 재요구/이중 인증이 원천적으로 발생하지 않는다(Option A).
//
// 흐름:
//   1) 이메일 형식 + 공개 회원가입 허용 도메인 재검증(프론트 우회 차단)
//   2) email_codes 에 verified_at(최근) 존재 확인 = 서버측 OTP 인증 완료 증명
//   3) service_role 로 admin.createUser({ email_confirm:true }) — 원자적 이메일 유일성
//   4) profiles 는 handle_new_user 트리거가 user_metadata 로 생성(AFTER INSERT, 동일 트랜잭션)
//   5) email_codes 소진(삭제) → 재사용 불가
//   → 클라이언트는 반환 후 signInWithPassword 로 세션 확보(email_confirm:true 라 로그인 가능)
//
// 배포: supabase functions deploy complete-signup --no-verify-jwt
// ⚠️ service_role 는 이 함수 내부에서만. 비밀번호/OTP/JWT 는 로그하지 않는다.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const VERIFY_WINDOW_MIN = 15 // OTP 인증(verified_at) 유효 시간
const MIN_PASSWORD = 4

// 공개 회원가입 허용 도메인 — src/lib/emailDomains.js 와 동일(드리프트 테스트로 강제).
const ALLOWED_EMAIL_DOMAINS = [
  'gmail.com', 'googlemail.com',
  'naver.com',
  'daum.net', 'hanmail.net', 'kakao.com',
  'yahoo.com', 'yahoo.co.kr',
  'msn.com', 'outlook.com', 'hotmail.com',
  'zum.com',
  'nate.com',
  'icloud.com',
]
const ALLOWED = new Set(ALLOWED_EMAIL_DOMAINS)

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
function isAllowedDomain(addr: string): boolean {
  const at = addr.lastIndexOf('@')
  if (at < 0) return false
  const domain = addr.slice(at + 1)
  if (domain.startsWith('xn--') || domain.includes('.xn--')) return false
  if (!/^[a-z0-9.-]+$/.test(domain)) return false
  return ALLOWED.has(domain)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  const body = await req.json().catch(() => ({}))
  const addr = (body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  const nickname = (body.nickname || '').trim()
  const gender = body.gender ?? null
  const ageGroup = body.ageGroup ?? null

  // 1) 이메일 형식 + 허용 도메인(프론트 우회 차단)
  if (!isValidEmail(addr)) return json({ ok: false, error: 'invalid_email' })
  if (!isAllowedDomain(addr)) return json({ ok: false, error: 'domain_not_allowed' })
  if (password.length < MIN_PASSWORD) return json({ ok: false, error: 'weak_password' })
  if (!nickname) return json({ ok: false, error: 'nickname_required' })

  // 이미 가입이 완료된 이메일이면(직전 요청 성공 후 재시도/응답 유실 포함) 멱등 성공.
  // OTP 는 성공 시 소진(삭제)되므로, 계정 존재 = 이 가입이 이미 완료됨.
  async function alreadyCompleted() {
    const { data: prof } = await admin.from('profiles').select('id').ilike('email', addr).limit(1)
    if (prof && prof.length) { await admin.from('email_codes').delete().eq('email', addr); return prof[0].id }
    return null
  }
  const doneId0 = await alreadyCompleted()
  if (doneId0) return json({ ok: true, code: 'already_completed', userId: doneId0 })

  // 2) 서버측 OTP 인증 완료 증명 — email_codes.verified_at(최근)
  const { data: row } = await admin.from('email_codes').select('*').eq('email', addr).maybeSingle()
  if (!row || !row.verified_at) return json({ ok: false, error: 'not_verified' })
  if (Date.now() - new Date(row.verified_at).getTime() > VERIFY_WINDOW_MIN * 60000)
    return json({ ok: false, error: 'stale' })

  // 3) 사용자 생성(원자적 이메일 유일성 → 동시 가입 Race 시 1명만 성공)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: addr,
    password,
    email_confirm: true, // 서버 신뢰 경로로 이메일 확정 — Confirm Email 재요구 없음
    user_metadata: { nickname, gender, age_group: ageGroup, provider: 'email' },
  })
  if (createErr || !created?.user) {
    // 이미 해당 이메일 계정이 존재하면(더블클릭/동시요청 포함) 멱등 성공으로 처리한다.
    // 승자의 profiles 커밋이 아직 안 보일 수 있어 짧게 재확인(최대 ~600ms).
    for (let i = 0; i < 4; i++) {
      const doneId = await alreadyCompleted()
      if (doneId) return json({ ok: true, code: 'already_completed', userId: doneId })
      if (i < 3) await new Promise(r => setTimeout(r, 150))
    }
    console.error('createUser failed') // 비밀번호/원문 로그 금지(중복 아닌 일시 실패는 재시도 안전)
    return json({ ok: false, error: 'create_failed' })
  }

  // 5) OTP 소진(재사용 불가) — 실패해도 가입은 성공이므로 best-effort.
  await admin.from('email_codes').delete().eq('email', addr)

  // profiles 는 handle_new_user 트리거가 동일 트랜잭션에서 생성(orphan 없음).
  return json({ ok: true, code: 'signup_completed', userId: created.user.id })
})
