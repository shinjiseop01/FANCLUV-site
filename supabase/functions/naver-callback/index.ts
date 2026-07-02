// FANCLUV — NAVER OAuth callback (Supabase Edge Function, Deno).
//
// NAVER 는 Supabase 기본 provider 가 아니므로, 이 함수가 커스텀 OAuth 의 콜백을
// 담당한다: authorization code → access token 교환 → NAVER 프로필 조회 →
// Supabase 사용자 생성/연결 → magic link 로 세션 발급 후 앱으로 리다이렉트.
//
// 배포:
//   supabase functions deploy naver-callback --no-verify-jwt
// 시크릿:
//   supabase secrets set NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=... \
//     NAVER_REDIRECT_URI=https://<ref>.supabase.co/functions/v1/naver-callback
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 플랫폼이 자동 주입)
//
// ⚠️ Client Secret / service_role key 는 이 Edge Function 환경에서만 사용한다.
//    절대 프론트엔드 번들에 포함하지 않는다.
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
  const email: string | undefined = p.email
  const nickname: string = p.nickname || p.name || (email ? email.split('@')[0] : 'NAVER 팬')
  const avatar: string | null = p.profile_image || null
  const providerUserId: string = String(p.id)
  if (!email) return fail('no_email')

  // 3) Supabase Admin — 사용자 조회/생성/연결
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 이메일로 기존 사용자 탐색 (MVP: 첫 페이지 스캔 — 추후 인덱스/필터 API 로 개선 가능)
  const { data: listData } = await admin.auth.admin.listUsers()
  let user = listData?.users?.find(
    (u: { email?: string }) => (u.email ?? '').toLowerCase() === email.toLowerCase(),
  )

  const userMeta = {
    provider: 'naver',
    provider_id: providerUserId,
    nickname,
    name: nickname,
    avatar_url: avatar,
  }

  if (!user) {
    // 신규 → 생성 (email_confirm: NAVER 가 인증한 이메일). 트리거가 profiles 자동 생성.
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: userMeta,
      app_metadata: { provider: 'naver', providers: ['naver'] },
    })
    if (cErr || !created?.user) return fail('create_failed')
    user = created.user
  } else {
    // 기존 이메일 계정 존재 → 연결: profiles 에 NAVER provider 정보 반영.
    await admin.from('profiles').update({
      provider_user_id: providerUserId,
      avatar_url: avatar ?? undefined,
    }).eq('id', user.id)
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
