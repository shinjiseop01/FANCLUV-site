// FANCLUV — NAVER OAuth callback (Supabase Edge Function, Deno).
//
// NAVER 는 Supabase 기본 provider 가 아니므로, 이 함수가 커스텀 OAuth 의 콜백을
// 담당한다: authorization code → access token 교환 → NAVER 프로필 조회 →
// Supabase 사용자 생성/연결 → magic link 로 세션 발급 후 앱으로 리다이렉트.
//
// 배포:
//   supabase functions deploy naver-callback --no-verify-jwt
//
// ⚠️ 반드시 `--no-verify-jwt` 로 배포한다.
//    이 엔드포인트는 "외부 NAVER OAuth 서버"가 브라우저 리다이렉트로 직접 호출하는
//    공개 콜백이다. 이때 요청에는 Supabase JWT(Authorization 헤더)가 없으므로,
//    기본값(verify_jwt=true)이면 401 로 막혀 콜백을 처리할 수 없다.
//    → JWT 검증을 끄고, 대신 code/state + service_role 로 서버에서 안전하게 처리한다.
//
// 시크릿:
//   supabase secrets set NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=... \
//     NAVER_REDIRECT_URI=https://<ref>.supabase.co/functions/v1/naver-callback
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 플랫폼이 자동 주입)
//
// ⚠️ Client Secret / service_role key 는 이 Edge Function 환경에서만 사용한다.
//    절대 프론트엔드 번들에 포함하지 않는다. (토큰 교환도 여기서만 수행)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const NAVER_TOKEN_URL = 'https://nid.naver.com/oauth2.0/token'
const NAVER_PROFILE_URL = 'https://openapi.naver.com/v1/nid/me'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') ?? ''
  const naverError = url.searchParams.get('error')

  // state 에 담긴 앱 복귀 주소(origin) 복원. (없으면 SITE_URL 폴백)
  let appOrigin = Deno.env.get('SITE_URL') ?? ''
  try {
    const parsed = JSON.parse(atob(state))
    if (parsed?.r) appOrigin = parsed.r
  } catch { /* state 파싱 실패 시 폴백 사용 */ }

  const redirectApp = (params: string) =>
    Response.redirect(`${appOrigin || 'https://example.com'}/?${params}`, 302)
  const fail = (reason: string) => redirectApp(`error=${encodeURIComponent(reason)}`)

  if (naverError || !code) return fail('naver_denied')

  const CLIENT_ID = Deno.env.get('NAVER_CLIENT_ID')
  const CLIENT_SECRET = Deno.env.get('NAVER_CLIENT_SECRET')
  const REDIRECT_URI = Deno.env.get('NAVER_REDIRECT_URI')
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !SUPABASE_URL || !SERVICE_ROLE) {
    return fail('server_misconfigured')
  }

  // 1) authorization code → access token
  const tokenUrl =
    `${NAVER_TOKEN_URL}?grant_type=authorization_code` +
    `&client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&client_secret=${encodeURIComponent(CLIENT_SECRET)}` +
    `&code=${encodeURIComponent(code)}` +
    `&state=${encodeURIComponent(state)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
  const tokenRes = await fetch(tokenUrl)
  const tokenJson = await tokenRes.json().catch(() => ({}))
  if (!tokenJson.access_token) return fail('token_exchange_failed')

  // 2) 프로필 조회
  const profRes = await fetch(NAVER_PROFILE_URL, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  })
  const profJson = await profRes.json().catch(() => ({}))
  if (profJson.resultcode !== '00' || !profJson.response) return fail('profile_failed')

  const p = profJson.response
  const rawEmail: string | undefined = p.email
  if (!rawEmail) return fail('no_email')
  const email = rawEmail.toLowerCase()          // Supabase 는 이메일을 소문자로 저장 → 정규화
  const nickname: string = p.nickname || p.name || email.split('@')[0]
  const avatar: string | null = p.profile_image || null
  const providerUserId: string = String(p.id)

  // 3) Supabase Admin — 사용자 조회/생성/연결
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 3-1) profiles.email 로 기존 사용자 조회 (email 인덱스 사용 — 전체 스캔 아님)
  const { data: existing, error: pErr } = await admin
    .from('profiles')
    .select('id, provider, provider_user_id')
    .eq('email', email)
    .maybeSingle()
  if (pErr) return fail('lookup_failed')

  if (existing) {
    // 이미 같은 이메일의 프로필이 있음 → 신규 프로필을 만들지 않는다.
    const prov = existing.provider || ''
    if (prov && prov !== 'naver') {
      // 다른 방식(email/google/kakao 등)으로 가입된 계정과 충돌 → 안전 안내.
      // (자동 병합하지 않음. 계정 연결은 로그인 후 설정에서 처리하도록 유도)
      return fail('account_exists_' + prov)
    }
    // NAVER 계정(또는 provider 미설정) → 기존 프로필에 provider 정보 연결.
    await admin.from('profiles').update({
      provider: 'naver',
      provider_user_id: providerUserId,
    }).eq('id', existing.id)
  } else {
    // 신규 → 생성 (email_confirm: NAVER 가 인증한 이메일). 트리거가 profiles 자동 생성.
    const { error: cErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { provider: 'naver', provider_id: providerUserId, nickname, name: nickname, avatar_url: avatar },
      app_metadata: { provider: 'naver', providers: ['naver'] },
    })
    if (cErr) return fail('create_failed')
  }

  // 4) 세션 발급 — magic link 의 action_link 로 브라우저를 리다이렉트하면
  //    Supabase 가 검증 후 세션을 심고 앱(redirectTo)으로 되돌린다.
  const { data: linkData, error: lErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: appOrigin || SUPABASE_URL },
  })
  if (lErr || !linkData?.properties?.action_link) return fail('session_failed')

  return Response.redirect(linkData.properties.action_link, 302)
})
