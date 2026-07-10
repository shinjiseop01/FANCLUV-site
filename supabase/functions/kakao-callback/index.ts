// FANCLUV — Kakao OAuth callback (Supabase Edge Function, Deno).
//
// ⚠️ 왜 커스텀 콜백인가:
//   Supabase 기본(GoTrue) Kakao provider 는 scope 에 account_email 을 **강제 포함**하고,
//   클라이언트 scopes 파라미터는 병합만 되어 제거할 수 없다. 비즈 앱이 아니면
//   account_email 을 요청할 수 없어 **KOE205(설정하지 않은 동의 항목: account_email)** 가
//   발생한다. 이 커스텀 콜백은 scope 를 profile_nickname(+profile_image) 으로만 제어해
//   KOE205 를 원천 차단하고, 이메일 없이도 로그인/세션을 발급한다.
//
// 흐름: authorization code → access token → 프로필(닉네임/이미지) → Supabase 사용자
//   조회/생성(이메일 없으면 내부 placeholder 이메일로 세션만 성립, profiles.email=NULL)
//   → magic link 로 세션 발급 후 앱(/auth/callback)으로 리다이렉트.
//
// 배포: supabase functions deploy kakao-callback --no-verify-jwt
//   (외부 Kakao 서버가 JWT 없이 직접 호출하는 공개 콜백이므로 verify_jwt=false 필수)
// 시크릿:
//   supabase secrets set KAKAO_CLIENT_ID=<REST_API_KEY> \
//     KAKAO_CLIENT_SECRET=<보안_Client_Secret> \
//     KAKAO_REDIRECT_URI=https://<ref>.supabase.co/functions/v1/kakao-callback \
//     SITE_URL=https://fancluv-site.vercel.app
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 자동 주입)
//
// ⚠️ Client Secret / service_role 는 이 함수 환경에서만 사용(프론트 번들 미포함).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token'
const KAKAO_PROFILE_URL = 'https://kapi.kakao.com/v2/user/me'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') ?? ''
  const kakaoError = url.searchParams.get('error')

  // state 에 담긴 앱 복귀 주소(origin) 복원(없으면 SITE_URL 폴백).
  let appOrigin = Deno.env.get('SITE_URL') ?? ''
  try {
    const parsed = JSON.parse(atob(state))
    if (parsed?.r) appOrigin = parsed.r
  } catch { /* 폴백 사용 */ }

  const redirectApp = (params: string) =>
    Response.redirect(`${appOrigin || 'https://example.com'}/auth/callback?${params}`, 302)
  const fail = (reason: string) => redirectApp(`error=${encodeURIComponent(reason)}`)

  if (kakaoError || !code) return fail('kakao_denied')

  const CLIENT_ID = Deno.env.get('KAKAO_CLIENT_ID')
  const CLIENT_SECRET = Deno.env.get('KAKAO_CLIENT_SECRET') // 카카오는 선택(보안 메뉴 활성화 시 필수)
  const REDIRECT_URI = Deno.env.get('KAKAO_REDIRECT_URI')
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!CLIENT_ID || !REDIRECT_URI || !SUPABASE_URL || !SERVICE_ROLE) {
    return fail('server_misconfigured')
  }

  // 1) authorization code → access token
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code,
  })
  if (CLIENT_SECRET) form.set('client_secret', CLIENT_SECRET)
  const tokenRes = await fetch(KAKAO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: form.toString(),
  })
  const tokenJson = await tokenRes.json().catch(() => ({}))
  if (!tokenJson.access_token) return fail('token_exchange_failed')

  // 2) 프로필 조회(닉네임/프로필 이미지 — account_email 미요청)
  const profRes = await fetch(KAKAO_PROFILE_URL, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  })
  const profJson = await profRes.json().catch(() => ({}))
  if (!profJson?.id) return fail('profile_failed')

  const kakaoId = String(profJson.id)
  const acct = profJson.kakao_account ?? {}
  const prof = acct.profile ?? {}
  const nickname: string = prof.nickname || `카카오사용자`
  const avatar: string | null = prof.profile_image_url || prof.thumbnail_image_url || null
  const realEmail: string | null = acct.email ? String(acct.email).toLowerCase() : null // 비즈 앱 전환 후에만 존재

  // 세션 성립용 이메일: 실제 이메일이 있으면 사용, 없으면 결정적 내부 placeholder.
  const authEmail = realEmail || `kakao_${kakaoId}@kakao.users.fancluv.app`

  // 3) Supabase Admin — 사용자 조회/생성/연결
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: existing, error: pErr } = await admin
    .from('profiles')
    .select('id, provider, provider_user_id, email')
    .eq('provider', 'kakao')
    .eq('provider_user_id', kakaoId)
    .maybeSingle()
  if (pErr) return fail('lookup_failed')

  if (!existing) {
    // 같은 authEmail(=실제 이메일)로 이미 다른 방식 가입돼 있으면 충돌 안내.
    if (realEmail) {
      const { data: byEmail } = await admin.from('profiles').select('id, provider').eq('email', realEmail).maybeSingle()
      if (byEmail && byEmail.provider && byEmail.provider !== 'kakao') return fail('account_exists_' + byEmail.provider)
    }
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
      user_metadata: { provider: 'kakao', provider_id: kakaoId, nickname, name: nickname, avatar_url: avatar },
      app_metadata: { provider: 'kakao', providers: ['kakao'] },
    })
    if (cErr || !created?.user) return fail('create_failed')
    // 이메일 미제공(placeholder) 계정은 profiles.email 을 NULL 로 → 앱에서 "이메일 등록" 유도.
    if (!realEmail) {
      await admin.from('profiles').update({ email: null }).eq('id', created.user.id)
    }
  }

  // 4) magic link 로 세션 발급 → 앱으로 복귀
  const { data: linkData, error: lErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: authEmail,
    options: { redirectTo: `${appOrigin || SUPABASE_URL}/auth/callback` },
  })
  if (lErr || !linkData?.properties?.action_link) return fail('session_failed')

  return Response.redirect(linkData.properties.action_link, 302)
})
