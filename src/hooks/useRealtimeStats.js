// FANCLUV — 팀 실시간 통계 구독 훅.
//
// Realtime 정책(§12): 현재 팀의 집계 row 1개만 구독(team_realtime_stats, team_id 필터).
// 화면 hidden 시 polling 중지, focus 복귀 시 refresh, unmount 시 unsubscribe. 중복 구독 방지.
// Realtime 장애/미설정 시 polling fallback(foreground=interval, background 중지).
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { getTeamStats, invalidateTeamStats } from '../lib/stats/realtimeStatsRepo.js'
import { isStale } from '../lib/stats/statsMetrics.js'

const DEFAULT_POLL_MS = 30_000

export function useRealtimeStats(teamId, { role = 'fan', pollMs = DEFAULT_POLL_MS, ttlMs = 30_000 } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [connection, setConnection] = useState(isSupabaseConfigured ? 'connecting' : 'polling')
  const [updatedAt, setUpdatedAt] = useState(null)
  const timerRef = useRef(null)
  const chanRef = useRef(null)
  const mounted = useRef(true)

  const load = useCallback(async (force = false) => {
    if (!teamId) return
    if (force) invalidateTeamStats(teamId)
    try {
      const res = await getTeamStats(teamId, { role, force })
      if (!mounted.current) return
      if (res?.ok === false) { setError(res.code || 'error') }
      else { setData(res); setError(null); setUpdatedAt(Date.now()) }
    } catch {
      if (mounted.current) setError('network_error')
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [teamId, role])

  // polling 시작/중지(화면 표시 상태에 따라).
  const startPolling = useCallback(() => {
    if (timerRef.current) return
    timerRef.current = setInterval(() => { if (!document.hidden) load(true) }, Math.max(10_000, pollMs))
  }, [load, pollMs])
  const stopPolling = useCallback(() => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }, [])

  useEffect(() => {
    mounted.current = true
    setLoading(true)
    load()

    // Realtime: 팀 집계 row 1개만 구독(중복 방지 — 단일 채널).
    if (isSupabaseConfigured && supabase && teamId) {
      const ch = supabase.channel(`rt-stats-${teamId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'team_realtime_stats', filter: `team_id=eq.${teamId}` },
          () => { if (!document.hidden) load(true) })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') setConnection('live')
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnection('reconnecting')
          else if (status === 'CLOSED') setConnection('polling')
        })
      chanRef.current = ch
    }
    // polling fallback(항상 병행 — Realtime 장애 대비, 화면 hidden 시 tick skip).
    startPolling()

    // 화면 표시 상태 변화: hidden→중지, 복귀→refresh + 재개.
    const onVis = () => { if (document.hidden) stopPolling(); else { load(true); startPolling() } }
    const onFocus = () => load(true)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onFocus)

    return () => {
      mounted.current = false
      stopPolling()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onFocus)
      if (chanRef.current) { try { supabase.removeChannel(chanRef.current) } catch { /* ignore */ } chanRef.current = null }
    }
  }, [teamId, load, startPolling, stopPolling])

  const stale = isStale(updatedAt, ttlMs * 3) // ttl 의 3배 넘게 갱신 없으면 stale 표시
  return { data, loading, error, connection, updatedAt, stale, refresh: () => load(true) }
}
