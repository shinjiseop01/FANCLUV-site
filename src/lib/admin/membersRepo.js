// FANCLUV — 관리자 회원 관리 repository (Supabase-우선 + Mock 폴백).
//
// Supabase 설정 시: RPC `admin_list_members`(SECURITY DEFINER + is_admin())로 실제 profiles
//   목록을 조회하고, `admin_set_member_deactivated`로 활성/비활성(deactivated_at)을 변경한다.
//   → 일반 팬은 다른 회원 정보를 조회할 수 없다(profiles RLS 는 본인만; 전체는 관리자 RPC 로만).
// Mock 모드: 기존 adminData 의 MOCK_MEMBERS 를 반환(개발 데모).
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { isAdmin } from '../auth.js'
import { MOCK_MEMBERS } from '../../admin/adminData.js'

function mapRow(r) {
  return {
    id: r.id,
    nickname: r.nickname,
    email: r.email,
    joinedAt: String(r.joined_at || '').slice(0, 10),
    team: r.team,
    status: r.status,
    role: r.role,
    verificationStatus: r.verification_status,
    identityVerified: !!r.identity_verified,
    provider: r.provider,
    gender: r.gender,
    ageGroup: r.age_group,
    lastActiveAt: String(r.last_active_at || '').slice(0, 10),
  }
}

// 회원 목록 (관리자 전용). 비관리자면 빈 배열.
export async function adminListMembers() {
  if (!isAdmin()) return []
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('admin_list_members')
    if (error) return []
    return (data || []).map(mapRow)
  }
  return MOCK_MEMBERS
}

// 회원 활성/비활성 변경. Supabase = RPC, Mock = 화면 상태만(호출부에서 반영).
export async function setMemberActive(id, active) {
  if (!isAdmin()) return { ok: false }
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('admin_set_member_deactivated', { p_id: id, p_deactivated: !active })
    return { ok: !error && (data?.ok ?? true) }
  }
  return { ok: true }
}
