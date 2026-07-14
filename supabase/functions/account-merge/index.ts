// FANCLUV — 계정 병합 실행 (Supabase Edge Function, Deno). 서버 권위 검증.
//
// 관리자 승인(approve) 이후, 실제 데이터 이관(complete_account_merge)은 service_role 로만
// 실행되어야 하므로 이 Edge Function 이 담당한다. 클라이언트가 보낸 role 은 신뢰하지 않고
// 서버가 DB 에서 행위자 역할을 재조회해 superadmin 인지 판정한 뒤에만 service_role RPC 를 호출한다.
//   service_role 은 이 함수 내부에서만 사용(프론트 노출 금지).
//
// 정책:
//   • complete 는 superadmin(profiles.is_superadmin=true, role=admin) 만 트리거 가능.
//   • RPC(complete_account_merge)는 approved 상태에서만 이관(compare-and-set) → 원자/롤백 보장.
//   • 자동 병합 없음: 반드시 request→approve(관리자)→complete(superadmin) 순.
//
// 배포(스테이징): supabase functions deploy account-merge --project-ref <staging>
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const requestId = crypto.randomUUID()

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  const logSecurity = async (event: string, uid: string | null, detail: Record<string, unknown>) => {
    try { await admin.from('security_events').insert({ user_id: uid, event, severity: 'warning', detail: { ...detail, request_id: requestId } }) } catch { /* noop */ }
  }

  // 1) 호출자 JWT 검증.
  const authHeader = req.headers.get('Authorization') || ''
  const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) { await logSecurity('unauthorized_merge_complete_attempt', null, {}); return json({ ok: false, code: 'unauthorized' }, 401) }

  // 2) 행위자 슈퍼관리자 여부 DB 재조회(클라이언트 값 불신).
  const { data: actor } = await admin.from('profiles').select('role, is_superadmin').eq('id', user.id).single()
  const isSuperadmin = actor?.role === 'admin' && actor?.is_superadmin === true
  if (!isSuperadmin) { await logSecurity('forbidden_merge_complete', user.id, { role: actor?.role }); return json({ ok: false, code: 'forbidden' }, 403) }

  // 3) 입력 검증.
  const body = await req.json().catch(() => ({}))
  const operationId = body?.operation_id
  if (!UUID_RE.test(String(operationId || ''))) return json({ ok: false, code: 'invalid_uuid' }, 400)

  // 4) service_role 로 complete RPC 호출(approved→completed, 원자 이관/롤백은 RPC 내부).
  const { data, error } = await admin.rpc('complete_account_merge', { p_operation_id: operationId })
  if (error) { await logSecurity('merge_complete_rpc_error', user.id, { operation_id: operationId, code: error.code }); return json({ ok: false, code: 'rpc_error' }, 500) }

  return json(data ?? { ok: false, code: 'no_data' }, (data as { ok?: boolean })?.ok ? 200 : 409)
})
