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
const MIN_PASSWORD = 8 // FANCLUV 최소 비밀번호 길이(클라이언트 passwordPolicy.MIN_PASSWORD_LENGTH 와 통일)

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

  // 1) 이메일 형식(도메인 제한 없음)
  if (!isValidEmail(addr)) return json({ ok: false, error: 'invalid_email' })
  if (password.length < MIN_PASSWORD) return json({ ok: false, error: 'weak_password' })
  if (!nickname) return json({ ok: false, error: 'nickname_required' })

  const meta = { nickname, gender, age_group: ageGroup, provider: 'email' }

  // 이메일로 기존 auth user id 조회. profiles.id = auth.users.id(트리거 생성). 없으면 제한 스캔 폴백.
  async function findUserIdByEmail(): Promise<string | null> {
    const { data: prof } = await admin.from('profiles').select('id').ilike('email', addr).limit(1)
    if (prof && prof.length) return prof[0].id
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const u = (list?.users || []).find(x => (x.email || '').toLowerCase() === addr)
    return u?.id ?? null
  }

  // 2) 서버측 OTP 인증 완료 증명 — email_codes.verified_at(최근). 이메일 소유권의 근거.
  const { data: row } = await admin.from('email_codes').select('verified_at').eq('email', addr).maybeSingle()
  const verified = !!(row && row.verified_at &&
    (Date.now() - new Date(row.verified_at).getTime() <= VERIFY_WINDOW_MIN * 60000))

  if (!verified) {
    // OTP 미검증 재시도: "계정 존재"만으로 완료로 단정하지 않는다.
    // 우리가 방금(최근) 생성한 확정 계정일 때만 멱등 성공(응답 유실 재시도 복구).
    const uid = await findUserIdByEmail()
    if (uid) {
      const { data: got } = await admin.auth.admin.getUserById(uid)
      const u = got?.user
      const recent = u && (Date.now() - new Date(u.created_at).getTime() <= VERIFY_WINDOW_MIN * 60000)
      if (u && u.email_confirmed_at && recent) return json({ ok: true, code: 'already_completed', userId: uid })
    }
    return json({ ok: false, error: 'not_verified' })
  }

  // 3) 사용자 생성(원자적 이메일 유일성).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: addr, password, email_confirm: true, user_metadata: meta,
  })
  let userId: string | null = created?.user?.id ?? null
  let recovered = false
  if (createErr || !userId) {
    // 이미 가입된 이메일. 원칙(P0-3): 이미 가입된 이메일(이메일/구글 OAuth 포함)은 두 번째
    // 계정 생성도, 기존 계정 변경(비번 부여)도 하지 않고 회원가입 자체를 차단한다.
    // 유일한 예외: 우리 OTP 흐름이 방금(윈도우 내) 만든 email-only shell 의 응답유실 재시도 복구.
    const uid = await findUserIdByEmail()
    if (!uid) { console.error('createUser failed and no existing user found'); return json({ ok: false, error: 'create_failed' }) }
    const { data: got } = await admin.auth.admin.getUserById(uid)
    const u = got?.user
    const identities = (u?.identities ?? []) as Array<{ provider?: string }>
    const OAUTH = ['google', 'kakao', 'naver', 'apple', 'github', 'azure', 'facebook']
    const hasOAuth = identities.some(i => i.provider && i.provider !== 'email') ||
      OAUTH.includes(String((u?.app_metadata as Record<string, unknown>)?.provider || ''))
    const recentShell = !!u && (Date.now() - new Date(u.created_at).getTime() <= VERIFY_WINDOW_MIN * 60000)
    // OAuth 계정이거나(소셜 로그인 필요) 이미 확립된(오래된) 계정 → 중복 차단.
    if (hasOAuth || !recentShell) {
      return json({ ok: false, error: 'email_already_registered', code: 'email_already_registered' }, 409)
    }
    // 최근 우리 흐름이 만든 email-only shell 만 재시도 복구(비번 설정). OTP 로 소유 증명됨.
    const { error: updErr } = await admin.auth.admin.updateUserById(uid, { password, email_confirm: true, user_metadata: meta })
    if (updErr) { console.error('account resume updateUser failed'); return json({ ok: false, error: 'create_failed' }) }
    // 트리거는 update 시 갱신 안 되므로 프로필 필수값을 직접 반영.
    // 닉네임 UNIQUE(profiles_nickname_norm_uk) 충돌 시 nickname_taken 으로 안내.
    await admin.from('profiles').update({ gender, age_group: ageGroup, is_email_verified: true }).eq('id', uid)
    const { error: nickErr } = await admin.from('profiles').update({ nickname }).eq('id', uid)
    if (nickErr && (nickErr.code === '23505' || /duplicate key|nickname_norm/i.test(nickErr.message || ''))) {
      return json({ ok: false, error: 'nickname_taken', code: 'nickname_taken' })
    }
    userId = uid; recovered = true
  }

  // OTP 소진(재사용 불가) — best-effort.
  await admin.from('email_codes').delete().eq('email', addr)
  return json({ ok: true, code: recovered ? 'account_recovered' : 'signup_completed', userId })
})
