// FANCLUV — 회원 완전 탈퇴 (Supabase Edge Function, Deno).
//
// 로그인한 사용자가 "본인 계정만" 완전 삭제한다. auth.users 를 지우면
// FK(ON DELETE CASCADE)로 profiles/opinions/comments/likes/survey_responses/
// notifications 가 함께 삭제되고, team_news/surveys 의 author 는 NULL 로 익명화된다.
//
// 배포(로그인 사용자만 호출 → 기본값 verify_jwt=true 유지):
//   supabase functions deploy delete-account
//   (시크릿 불필요 — SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 자동 주입)
//
// ⚠️ SUPABASE_SERVICE_ROLE_KEY 는 이 함수 환경에서만 사용(프론트 노출 금지).
//    삭제 대상 id 는 "검증된 JWT 의 사용자"로 고정 → 타인 계정 삭제 불가.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // 1) 호출자 JWT 검증 — 반드시 로그인 상태여야 함.
  const authHeader = req.headers.get('Authorization') || ''
  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return json({ ok: false, code: 'unauthorized' })

  // 2) 본인 계정만 삭제 — 삭제 대상은 항상 검증된 user.id (클라이언트 입력 무시).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  // 개인정보 즉시 익명화(감사/캐시 대비) 후 완전 삭제.
  await admin.from('profiles').update({
    deactivated_at: new Date().toISOString(),
    nickname: '탈퇴한 사용자', email: null, avatar_url: null,
    gender: null, age_group: null, provider_user_id: null,
  }).eq('id', user.id)

  // auth.users 삭제 → FK CASCADE 로 관련 개인 데이터 삭제, 작성 콘텐츠 author 는 NULL.
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) return json({ ok: false, code: 'delete_failed', error: error.message })

  return json({ ok: true })
})
