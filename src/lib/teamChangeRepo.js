// FANCLUV — 응원팀 시즌 변경 정책 repository (Supabase RPC + Mock 폴백).
//
// 정책 강제는 서버(0078 RPC/트리거)에서 이뤄진다. 이 repo 는 얇은 호출 래퍼 + 캐시 반영.
//   · team_change_status : 설정 화면용 상태(변경 가능/사유/window/다음 일정)
//   · fan_change_team    : Fan 시즌 1회 변경(정책·race 는 서버에서 강제)
//   · admin_change_team  : 관리자 override(window 무관·Fan 변경권 미소비·audit)
import { supabase, isSupabaseConfigured } from './supabase.js'
import { getCurrentUser, setCachedTeam } from './auth.js'
import { logger } from './logger.js'

// Mock: window 닫힘 기본(안전값) — 실제 정책은 Supabase 환경에서만.
function mockStatus() {
  const u = getCurrentUser()
  return {
    ok: true, current_team: u?.selectedTeam || null, role: 'user',
    window_open: false, already_used: false, can_change: false,
    season_year: null, window_start: null, window_end: null, next_start: null, next_end: null,
  }
}

export async function getTeamChangeStatus() {
  if (!isSupabaseConfigured) return mockStatus()
  try {
    const { data, error } = await supabase.rpc('team_change_status')
    if (error || !data) { logger.warn('team_change_status failed', error?.message); return { ok: false } }
    return data
  } catch (e) { logger.warn('team_change_status exception', e?.message); return { ok: false } }
}

// Fan 변경. 반환: { ok, code, to_team? }. 성공 시 캐시 팀 즉시 반영.
export async function fanChangeTeam(toTeam) {
  if (!isSupabaseConfigured) {
    setCachedTeam(toTeam)
    return { ok: true, code: 'OK', to_team: toTeam }   // Mock: UI 확인용
  }
  try {
    const { data, error } = await supabase.rpc('fan_change_team', { p_to_team: toTeam })
    if (error) { logger.warn('fan_change_team error', error.message); return { ok: false, code: 'NOT_ALLOWED' } }
    if (data?.ok) setCachedTeam(data.to_team || toTeam)
    return data || { ok: false, code: 'NOT_ALLOWED' }
  } catch (e) { logger.warn('fan_change_team exception', e?.message); return { ok: false, code: 'NOT_ALLOWED' } }
}

// 관리자 override. 반환: { ok, code, from_team?, to_team? }.
export async function adminChangeTeam(userId, toTeam) {
  if (!isSupabaseConfigured) return { ok: true, code: 'OK', to_team: toTeam }
  try {
    const { data, error } = await supabase.rpc('admin_change_team', { p_user_id: userId, p_to_team: toTeam })
    if (error) { logger.warn('admin_change_team error', error.message); return { ok: false, code: 'NOT_ALLOWED' } }
    return data || { ok: false, code: 'NOT_ALLOWED' }
  } catch (e) { logger.warn('admin_change_team exception', e?.message); return { ok: false, code: 'NOT_ALLOWED' } }
}
