// FANCLUV — 프로필 활동 통계 (작성 의견/댓글/받은 공감/참여 설문).
//
// Supabase 설정 시 실제 count 집계, 아니면 Mock. cache.js 로 30초 캐시.
import { supabase, isSupabaseConfigured } from './supabase.js'
import { getCurrentUser } from './auth.js'
import { withCache, invalidate } from './cache.js'
import { getCreatedOpinions } from '../opinionStore.js'

async function sbCount(table, build) {
  let q = supabase.from(table).select('id', { count: 'exact', head: true })
  if (build) q = build(q)
  const { count } = await q
  return count || 0
}

// 활동 통계 조회 → { opinions, comments, likes, surveys }
export function getProfileStats(teamId) {
  const me = getCurrentUser()
  const key = `profileStats:${me?.id || 'guest'}:${teamId || 'all'}`
  return withCache(key, async () => {
    if (isSupabaseConfigured && me) {
      const [opinions, comments, surveys] = await Promise.all([
        sbCount('opinions', q => q.eq('author_id', me.id)),
        sbCount('comments', q => q.eq('author_id', me.id)),
        sbCount('survey_responses', q => q.eq('user_id', me.id)),
      ])
      // 받은 공감: 내가 작성한 의견들의 공감 수 합계(opinions_view)
      let likes = 0
      const { data } = await supabase.from('opinions_view').select('likes_count').eq('author_id', me.id)
      if (Array.isArray(data)) likes = data.reduce((s, r) => s + (Number(r.likes_count) || 0), 0)
      return { opinions, comments, likes, surveys, source: 'live' }
    }
    // Mock: 작성 의견(로컬) 반영 + 데모 값
    const created = teamId ? getCreatedOpinions(teamId) : []
    const opinions = created.length + 3
    const likes = created.reduce((s, o) => s + (o.likes || 0), 0) + 318
    return { opinions, comments: 23, likes, surveys: 3, source: 'mock' }
  })
}

export function refreshProfileStats() {
  invalidate('profileStats:')
}
