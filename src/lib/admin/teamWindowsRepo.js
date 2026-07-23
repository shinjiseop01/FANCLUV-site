// FANCLUV — 응원팀 변경 window 운영 관리 repository (Admin).
//
// 관리자가 시즌별 변경 기간을 등록/수정/활성화한다. 저장은 검증 RPC(0079),
// 조회는 RLS(admin) 하에 직접 select. Mock 모드는 로컬 배열.
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { logger } from '../logger.js'

let mockWindows = []

export async function listTeamChangeWindows() {
  if (!isSupabaseConfigured) return mockWindows.slice().sort((a, b) => b.season_year - a.season_year)
  try {
    const { data, error } = await supabase
      .from('team_change_windows')
      .select('id, season_year, starts_at, ends_at, is_active')
      .order('season_year', { ascending: false })
    if (error) { logger.warn('listTeamChangeWindows', error.message); return [] }
    return data || []
  } catch (e) { logger.warn('listTeamChangeWindows ex', e?.message); return [] }
}

// 저장(upsert by season). 반환: { ok, code, id?, created? }
export async function saveTeamChangeWindow({ seasonYear, startsAt, endsAt, isActive }) {
  if (!isSupabaseConfigured) {
    const i = mockWindows.findIndex(w => w.season_year === seasonYear)
    const row = { id: 'w' + seasonYear, season_year: seasonYear, starts_at: startsAt, ends_at: endsAt, is_active: !!isActive }
    if (i >= 0) mockWindows[i] = row; else mockWindows.push(row)
    return { ok: true, code: 'OK', created: i < 0 }
  }
  try {
    const { data, error } = await supabase.rpc('admin_save_team_change_window', {
      p_season: seasonYear, p_starts_at: startsAt, p_ends_at: endsAt, p_is_active: isActive,
    })
    if (error) { logger.warn('saveTeamChangeWindow', error.message); return { ok: false, code: 'RPC_ERROR' } }
    return data || { ok: false, code: 'RPC_ERROR' }
  } catch (e) { logger.warn('saveTeamChangeWindow ex', e?.message); return { ok: false, code: 'RPC_ERROR' } }
}
