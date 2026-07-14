// FANCLUV — 관리자 본인인증 관측 repository.
//
// 관리자가 회원별 인증 상태/Provider/DI 존재여부/실패횟수를 조회한다.
// ⚠️ DI/CI 원문은 절대 노출하지 않는다(존재여부 boolean 만). RPC 내부 is_admin() 게이트.
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { isAdmin } from '../auth.js'

// 인증 상태 목록(원문 없음): { user_id, latest_status, provider, di_present, ci_present,
//   failure_count, verified_at, last_attempt_at }
export async function adminListIdentityStatus(limit = 100) {
  if (!isAdmin() || !isSupabaseConfigured) return []
  const { data, error } = await supabase.rpc('admin_identity_status', { p_limit: limit })
  if (error) return []
  return data || []
}
