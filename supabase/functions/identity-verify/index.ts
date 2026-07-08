// FANCLUV — 본인인증(PASS/NICE/KCB) 서버 처리 (Supabase Edge Function, Deno).
//
// 업체 비밀키(Client Secret)와 CI/DI 발급은 반드시 서버에서만 처리한다. 클라이언트는
// CI/DI 원문을 절대 받지 않으며, 이 함수가 profiles 에 직접 저장한다(service_role).
//
// action:'start'    → 업체 인증창 URL(authUrl) 발급 (+ 세션 토큰)
// action:'complete' → 콜백 토큰을 업체 API 로 검증 → CI/DI 조회 → 중복확인 → profiles 저장
//
// 배포(로그인 사용자만 호출 → JWT 검증 유지):
//   supabase functions deploy identity-verify
// 시크릿(서버 전용 — 프론트 노출 금지):
//   supabase secrets set IDENTITY_VENDOR=nice \
//     IDENTITY_CLIENT_ID=... IDENTITY_CLIENT_SECRET=... \
//     IDENTITY_API_BASE=https://... IDENTITY_SITE_URL=https://your-app
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY 는 자동 주입)
//
// ── 업체 교체 ──
//   IDENTITY_VENDOR 값(pass|nice|kcb)에 따라 아래 callVendorStart/callVendorComplete
//   의 분기만 각 업체 규격에 맞추면 된다. 앱/DB 계약(CI/DI/agency)은 동일.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

// 업체 설정(서버 시크릿). 미설정이면 provider_unconfigured 를 돌려준다.
const VENDOR = (Deno.env.get('IDENTITY_VENDOR') || '').toLowerCase() // pass | nice | kcb
const CLIENT_ID = Deno.env.get('IDENTITY_CLIENT_ID')
const CLIENT_SECRET = Deno.env.get('IDENTITY_CLIENT_SECRET')
const API_BASE = Deno.env.get('IDENTITY_API_BASE')
const SITE_URL = Deno.env.get('IDENTITY_SITE_URL') || ''

function vendorConfigured() {
  return !!(VENDOR && CLIENT_ID && CLIENT_SECRET && API_BASE)
}

// ── 업체 인증 세션 시작 → 인증창 URL ──────────────────────────────────────
// TODO(업체 연동): 각 업체(PASS/NICE/KCB) 규격으로 인증요청 → 인증창 URL/토큰 발급.
//   예) NICE 표준창: 암호화 요청데이터 생성 → returnUrl 포함 authUrl 구성.
async function callVendorStart(agency: string): Promise<{ authUrl: string; session: string } | null> {
  if (!vendorConfigured()) return null
  // 콜백은 우리 오리진의 정적 콜백 페이지에서 postMessage 로 앱에 token 을 전달한다.
  const returnUrl = `${SITE_URL}/identity/callback`
  // ↓↓↓ 업체 규격 연동 지점 (여기서 업체 API 호출로 authUrl/session 을 받는다) ↓↓↓
  const session = crypto.randomUUID()
  const authUrl =
    `${API_BASE}/authorize?client_id=${encodeURIComponent(CLIENT_ID!)}` +
    `&agency=${encodeURIComponent(agency)}` +
    `&session=${encodeURIComponent(session)}` +
    `&return_url=${encodeURIComponent(returnUrl)}`
  // ↑↑↑ 업체 규격 연동 지점 ↑↑↑
  return { authUrl, session }
}

// ── 콜백 토큰 검증 → CI/DI 조회 ───────────────────────────────────────────
// TODO(업체 연동): token 으로 업체 API 호출 → 복호화하여 { ci, di } 반환.
//   ⚠️ 이름/주민번호/휴대폰 등은 여기서 저장하지 않는다(수신하더라도 폐기).
async function callVendorComplete(
  agency: string, token: string, _session: string | null,
): Promise<{ ci: string; di: string } | null> {
  if (!vendorConfigured()) return null
  const res = await fetch(`${API_BASE}/result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CLIENT_SECRET}` },
    body: JSON.stringify({ client_id: CLIENT_ID, agency, token }),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  if (!data || !data.ci) return null
  // 업체 응답에서 CI/DI 만 취한다(민감정보는 취하지 않음).
  return { ci: String(data.ci), di: String(data.di || '') }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // 요청자(로그인 사용자) 식별 — 본인 프로필에만 저장하기 위함.
  const authHeader = req.headers.get('Authorization') || ''
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return json({ ok: false, code: 'unauthorized' }, 401)

  const { action, agency, token, session } = await req.json().catch(() => ({}))
  const ag = (agency || VENDOR || 'nice').toLowerCase()

  // ── 인증 세션 시작 ──
  if (action === 'start') {
    const started = await callVendorStart(ag)
    if (!started) return json({ ok: false, code: 'provider_unconfigured' })
    return json({ ok: true, authUrl: started.authUrl, session: started.session })
  }

  // ── 인증 완료(콜백 토큰) ──
  if (action === 'complete') {
    if (!token) return json({ ok: false, code: 'invalid' })
    const identity = await callVendorComplete(ag, token, session || null)
    if (!identity) return json({ ok: false, code: 'provider_failed' })

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

    // 동일 CI 중복가입 방지 — 다른 계정이 이미 사용 중이면 차단.
    const { data: dup } = await admin
      .from('profiles').select('id').eq('identity_ci', identity.ci).neq('id', user.id).limit(1)
    if (dup && dup.length) return json({ ok: false, code: 'duplicate' })

    const { error } = await admin.from('profiles').update({
      identity_verified: true,
      identity_verified_at: new Date().toISOString(),
      identity_provider: ag,
      identity_ci: identity.ci,
      identity_di: identity.di,
      verification_status: 'phone_verified',
    }).eq('id', user.id)
    if (error) {
      // unique 위반(경합) = 중복
      if (String(error.message).toLowerCase().includes('duplicate')) return json({ ok: false, code: 'duplicate' })
      return json({ ok: false, code: 'save_failed' })
    }
    // ⚠️ CI/DI 는 응답에 담지 않는다(클라이언트 노출 금지). 여부만 반환.
    return json({ ok: true, agency: ag })
  }

  return json({ ok: false, code: 'bad_action' })
})
