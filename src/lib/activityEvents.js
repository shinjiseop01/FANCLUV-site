// FANCLUV — 활동 이벤트 로그 (내 활동 "최근 활동"의 단일 소스).
//
// 작성/수정/삭제/댓글/공감/공감취소/설문참여/신고 등 모든 행위를 append-only 로
// 기록한다(행만으로는 삭제/취소/수정을 표현할 수 없어 별도 이벤트 로그가 필요).
// Supabase 설정 시 activity_events 테이블, 아니면 localStorage. 기록은 비차단
// (fire-and-forget) — 실패해도 본 기능 흐름에 영향을 주지 않는다.
import { supabase, isSupabaseConfigured } from './supabase.js'
import { logger } from './logger.js'
import { getCurrentUser } from './auth.js'

const MOCK_KEY = 'fancluv_activity_events'

export function recordEvent(type, { entityType = null, entityId = null, teamId = null, title = null } = {}) {
  const me = getCurrentUser()
  if (!me) return
  const snap = title ? String(title).slice(0, 60) : null
  if (isSupabaseConfigured) {
    supabase.from('activity_events').insert({
      user_id: me.id, type, entity_type: entityType,
      entity_id: entityId != null ? String(entityId) : null, team_id: teamId, title: snap,
    }).then(({ error }) => { if (error) logger.warn('activity_events 기록 실패', { error }) })
    return
  }
  try {
    const list = JSON.parse(localStorage.getItem(MOCK_KEY)) || []
    list.push({ id: 'e' + Date.now() + Math.floor(Math.random() * 1000), user_id: me.id, type, entity_type: entityType, entity_id: entityId, team_id: teamId, title: snap, created_at: new Date().toISOString() })
    localStorage.setItem(MOCK_KEY, JSON.stringify(list.slice(-500)))
  } catch { /* ignore */ }
}

export async function listMyEvents(limit = 15) {
  const me = getCurrentUser()
  if (!me) return []
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('activity_events')
      .select('id, type, entity_type, team_id, title, created_at')
      .eq('user_id', me.id).order('created_at', { ascending: false }).limit(limit)
    if (error) { logger.error('활동 이벤트 조회 실패', { error }); return [] }
    return data || []
  }
  try {
    return (JSON.parse(localStorage.getItem(MOCK_KEY)) || [])
      .filter(e => e.user_id === me.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit)
  } catch { return [] }
}
