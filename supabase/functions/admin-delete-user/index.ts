// FANCLUV — 관리자 회원 삭제 (Supabase Edge Function, Deno). 서버 권위 검증.
//
// 관리자(admin/superadmin)가 타 회원을 삭제한다. 클라이언트가 보낸 role/email/team 은
// 신뢰하지 않고 서버가 DB 에서 행위자·대상 역할을 다시 조회해 권한을 판정한다.
// service_role 은 이 함수 내부에서만 사용(프론트 노출 금지).
//
// 정책(권한 매트릭스):
//   superadmin → user/staff/admin/club/club_admin 삭제 가능(superadmin 제외)
//   admin      → user(팬)만 삭제 가능
//   그 외      → forbidden
//   자기 자신 / superadmin 대상 / 마지막 superadmin → 차단
//
// mode: 'hard_delete'(기본, auth.users 삭제 → CASCADE) | 'anonymize'(비활성+PII 스크럽, 계정 보존)
//
// 배포(스테이징): supabase functions deploy admin-delete-user --project-ref <staging>
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DELETABLE_BY: Record<string, string[]> = {
  superadmin: ['user', 'staff', 'admin', 'club', 'club_admin'],
  admin: ['user'],
}
// 대상 역할이 없는 NO ACTION FK 컬럼 → 삭제 전 NULL 로 정리(잔여 orphan 방지, FK 위반 방지).
const NULL_REFS: Array<[string, string]> = [
  ['reports', 'reporter_id'], ['audit_logs', 'actor_id'], ['security_events', 'user_id'],
  ['surveys', 'created_by'], ['team_news', 'author_id'], ['admin_notes', 'author_id'],
  ['club_actions', 'created_by'], ['club_reports', 'created_by'], ['customers', 'created_by'], ['notices', 'created_by'],
]
const maskEmail = (e: string | null) => {
  if (!e) return null
  const [u, d] = e.split('@'); if (!d) return '***'
  return `${u.slice(0, 2)}***@${d}`
}

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

  // 1) 호출자 JWT 검증
  const authHeader = req.headers.get('Authorization') || ''
  const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await caller.auth.getUser()
  if (!user) { await logSecurity('unauthorized_admin_delete_attempt', null, {}); return json({ ok: false, code: 'unauthorized' }, 401) }

  // 2) 행위자 역할 DB 재조회(클라이언트 값 불신)
  const { data: actor } = await admin.from('profiles').select('role').eq('id', user.id).single()
  const actorRole = actor?.role || 'user'

  // 3) 입력 검증
  const body = await req.json().catch(() => ({}))
  const targetId = body?.user_id
  const mode = body?.mode === 'anonymize' ? 'anonymize' : 'hard_delete'
  if (!UUID_RE.test(String(targetId || ''))) return json({ ok: false, code: 'invalid_uuid' }, 400)
  const reason = String(body?.reason ?? '').trim()
  if (reason.length < 3) return json({ ok: false, code: 'reason_too_short' }, 400)
  if (reason.length > 500) return json({ ok: false, code: 'reason_too_long' }, 400)

  // 4) 자기 자신 삭제 차단
  if (targetId === user.id) { await logSecurity('admin_self_delete_attempt', user.id, {}); return json({ ok: false, code: 'self_delete_forbidden' }, 403) }

  // 5) 대상 조회(이미 삭제 → idempotent)
  const { data: target } = await admin.from('profiles').select('role, email, nickname').eq('id', targetId).maybeSingle()
  if (!target) {
    const { data: au } = await admin.auth.admin.getUserById(targetId).catch(() => ({ data: null }))
    if (!au?.user) return json({ ok: true, code: 'already_deleted', request_id: requestId })
    return json({ ok: false, code: 'target_not_found' }, 404)
  }
  const targetRole = target.role || 'user'

  // 6) superadmin 대상 보호(기본 차단 + 마지막 1인 절대 차단)
  if (targetRole === 'superadmin') {
    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'superadmin')
    await logSecurity('last_superadmin_delete_attempt', user.id, { target_id: targetId, superadmin_count: count })
    return json({ ok: false, code: (count ?? 0) <= 1 ? 'last_superadmin_forbidden' : 'forbidden' }, 403)
  }

  // 7) 권한 매트릭스
  if (!(DELETABLE_BY[actorRole] || []).includes(targetRole)) {
    await logSecurity('unauthorized_admin_delete_attempt', user.id, { actor_role: actorRole, target_role: targetRole, target_id: targetId })
    return json({ ok: false, code: 'forbidden' }, 403)
  }

  // 8) 원자적 선점 — 대상당 정확히 1개 요청만 claimed. 감사로그는 complete RPC 에서 exactly-once.
  const { data: claimRows } = await admin.rpc('claim_admin_user_deletion', {
    p_target: targetId, p_actor: user.id, p_actor_role: actorRole, p_mode: mode, p_reason: reason, p_request_id: requestId,
  })
  const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows
  const claimResult = claim?.result
  const operationId = claim?.operation_id
  if (claimResult === 'already_processing') return json({ ok: false, code: 'already_in_progress', request_id: requestId })
  if (claimResult === 'already_completed') return json({ ok: true, code: 'already_deleted', request_id: requestId })
  if (claimResult === 'previous_attempt_failed') return json({ ok: false, code: 'previous_attempt_failed', request_id: requestId })
  if (claimResult !== 'claimed' || !operationId) return json({ ok: false, code: 'deletion_failed' }, 500)

  // claimed 요청만 실제 삭제 수행.
  const detail = { target_role: targetRole, target_email_masked: maskEmail(target.email), reason }
  try {
    // PII 스크럽(부분 실패 대비 먼저). identity/DI/CI/provider 연결 제거.
    await admin.from('profiles').update({
      deactivated_at: new Date().toISOString(), nickname: '탈퇴한 사용자', email: null, avatar_url: null,
      gender: null, age_group: null, provider: null, provider_user_id: null,
      identity_ci: null, identity_di: null, identity_di_hash: null, identity_provider: null,
      identity_verified: false, identity_verified_at: null, linked_providers: [],
    }).eq('id', targetId)

    if (mode === 'anonymize') {
      await admin.rpc('complete_admin_user_deletion', { p_operation_id: operationId, p_detail: detail })
      return json({ ok: true, mode, target_id: targetId, request_id: requestId })
    }

    // hard_delete: NO ACTION FK 참조 NULL → auth.users 삭제(→ CASCADE)
    for (const [tbl, col] of NULL_REFS) {
      await admin.from(tbl).update({ [col]: null }).eq(col, targetId)
    }
    const { error: delErr } = await admin.auth.admin.deleteUser(targetId)
    if (delErr) {
      const { data: still } = await admin.auth.admin.getUserById(targetId).catch(() => ({ data: null }))
      if (!still?.user) {
        // 이미 없음(정리 완료로 간주) → 완료 전이. 감사 1건은 complete RPC 가 보장.
        await admin.rpc('complete_admin_user_deletion', { p_operation_id: operationId, p_detail: detail })
        return json({ ok: true, code: 'already_deleted', mode, target_id: targetId, request_id: requestId })
      }
      await admin.rpc('fail_admin_user_deletion', { p_operation_id: operationId, p_error_code: 'auth_delete_failed' })
      return json({ ok: false, code: 'deletion_failed' }, 500)
    }
    // 성공 → complete RPC(processing→completed 전이 성공한 요청만 audit member.delete 1건)
    await admin.rpc('complete_admin_user_deletion', { p_operation_id: operationId, p_detail: detail })
    return json({ ok: true, mode, target_id: targetId, request_id: requestId })
  } catch {
    await admin.rpc('fail_admin_user_deletion', { p_operation_id: operationId, p_error_code: 'exception' }).catch(() => {})
    return json({ ok: false, code: 'deletion_failed' }, 500)
  }
})
