// FANCLUV — 운영 대시보드 데이터 레이어 (관리자 전용).
//
// 실시간 상태/장애/최근 오류/Slow API/Active Users/Cache Hit Rate 를 실데이터로 조회한다.
//   - 실시간 상태/장애: integration_health
//   - 최근 오류/Slow API: integration_logs
//   - Active Users: activity_events(최근 N분 distinct user)
//   - Cache Hit Rate: 클라이언트 cache.js 계측(getCacheStats)
// Supabase 미설정 시 빈 결과(안전).
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { isAdmin } from '../auth.js'
import { getCacheStats } from '../cache.js'

// 최근 windowMin 분 동안 활동한 고유 사용자 수(활성 사용자).
export async function getActiveUsers(windowMin = 15) {
  if (!isAdmin() || !isSupabaseConfigured) return { count: 0, windowMin }
  const since = new Date(Date.now() - windowMin * 60_000).toISOString()
  const { data, error } = await supabase
    .from('activity_events').select('user_id').gte('created_at', since).limit(10000)
  if (error) return { count: 0, windowMin, error: error.message }
  return { count: new Set((data || []).map(r => r.user_id)).size, windowMin }
}

// 최근 오류 로그(integration_logs, status=error).
export async function getRecentErrors(limit = 20) {
  if (!isAdmin() || !isSupabaseConfigured) return []
  const { data } = await supabase.from('integration_logs')
    .select('id,service,status,message,response_ms,created_at')
    .eq('status', 'error').order('created_at', { ascending: false }).limit(limit)
  return data || []
}

// Slow API/서비스(integration_logs, status=slow).
export async function getSlowApi(limit = 20) {
  if (!isAdmin() || !isSupabaseConfigured) return []
  const { data } = await supabase.from('integration_logs')
    .select('id,service,response_ms,created_at')
    .eq('status', 'slow').order('response_ms', { ascending: false }).limit(limit)
  return data || []
}

// 현재 장애(연결 실패) 중인 서비스.
export async function getIncidents() {
  if (!isAdmin() || !isSupabaseConfigured) return []
  const { data } = await supabase.from('integration_health')
    .select('service,status,consecutive_failures,last_failure_at')
    .eq('status', 'error').order('last_failure_at', { ascending: false })
  return data || []
}

// 대시보드 요약(한 번에).
export async function getOpsSummary() {
  if (!isAdmin()) return null
  const [active, errors, slow, incidents] = await Promise.all([
    getActiveUsers(15), getRecentErrors(10), getSlowApi(10), getIncidents(),
  ])
  return {
    activeUsers: active,
    recentErrors: errors,
    slowApi: slow,
    incidents,
    cache: getCacheStats(),
    at: new Date().toISOString(),
  }
}
