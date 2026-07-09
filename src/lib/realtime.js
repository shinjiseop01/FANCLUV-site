// FANCLUV — Supabase Realtime 구독 헬퍼.
//
// 지정한 public 테이블들의 변경(insert/update/delete)을 구독해 onChange 를 호출한다.
// 짧은 시간에 여러 변경이 몰리면 debounce 로 한 번만 갱신(불필요한 중복 조회 방지).
// Supabase 미설정(Mock)에서는 no-op. 반환값은 구독 해제 함수.
import { supabase, isSupabaseConfigured } from './supabase.js'

export function subscribeChanges(tables, onChange, { debounceMs = 400 } = {}) {
  if (!isSupabaseConfigured || !supabase) return () => {}
  let timer = null
  const fire = () => { clearTimeout(timer); timer = setTimeout(onChange, debounceMs) }
  const channel = supabase.channel(`rt-${Math.random().toString(36).slice(2)}`)
  for (const t of tables) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, fire)
  }
  channel.subscribe()
  return () => { clearTimeout(timer); try { supabase.removeChannel(channel) } catch { /* ignore */ } }
}
