// FANCLUV — 팬 랭킹 데이터 레이어.
//
// Supabase(프로덕션): RPC fan_ranking / fan_rank_for_user 로 실제 활동 집계만 사용한다.
//   조회 실패 → source:'error'(가짜 데이터 폴백 금지). 데이터 없음 → 빈 목록/순위 없음.
// DEV(Mock): 화면 미리보기용 소규모 예시(실서비스에는 노출 안 됨).
//
// 점수 정책은 DB 함수(0041)와 activityScore(ACTIVITY_POINTS)로 단일 관리: 의견10·댓글3·설문5·공감1.
import { supabase, isSupabaseConfigured } from './supabase.js'
import { retrySupabase } from './retry.js'
import { getTeam, TEAMS } from '../teams.jsx'
import { ACTIVITY_POINTS } from './activityScore.js'

export const RANK_LIMIT = 50

function mapRow(r) {
  return {
    userId: r.user_id,
    nickname: r.nickname || '팬',
    avatarUrl: r.avatar_url || null,
    team: getTeam(r.selected_team) || null,
    opinions: Number(r.opinion_count) || 0,
    comments: Number(r.comment_count) || 0,
    surveys: Number(r.survey_count) || 0,
    empathy: Number(r.received_like_count) || 0,
    score: Number(r.score) || 0,
    rank: Number(r.rank) || 0,
    lastActivityAt: r.last_activity_at || null,
  }
}

// ── DEV Mock (Supabase 미설정 시 화면 미리보기) ──
function mockRanking(teamId) {
  const names = ['블루윙', '레전드7', '직관러', '서포터K', '풋볼러버', '응원단장']
  const rows = names.map((nickname, i) => {
    const opinions = 6 - i, comments = (6 - i) * 2, surveys = Math.max(0, 4 - i), empathy = (6 - i) * 3
    const score = opinions * ACTIVITY_POINTS.opinion + comments * ACTIVITY_POINTS.comment + surveys * ACTIVITY_POINTS.survey + empathy * ACTIVITY_POINTS.like
    return { userId: 'mock' + i, nickname, avatarUrl: null, team: getTeam(teamId) || TEAMS[(i * 3) % TEAMS.length], opinions, comments, surveys, empathy, score, rank: i + 1, lastActivityAt: new Date(Date.now() - i * 3600000).toISOString() }
  })
  return { source: 'mock', rows, updatedAt: new Date().toISOString() }
}

// 랭킹 목록. teamId=null → 전체(리그), teamId 지정 → 팀별.
export async function getRanking(teamId = null, limit = RANK_LIMIT) {
  if (isSupabaseConfigured) {
    const { data, error } = await retrySupabase(() => supabase.rpc('fan_ranking', { p_team_id: teamId, p_limit: limit }))
    if (error) return { source: 'error', rows: [], updatedAt: new Date().toISOString() }
    return { source: 'live', rows: (data || []).map(mapRow), updatedAt: new Date().toISOString() }
  }
  return mockRanking(teamId)
}

// 내 순위/점수/활동 요약. rank=null → 아직 순위 없음(0점).
export async function getMyRank(userId, teamId = null) {
  if (!userId) return { rank: null, total: 0, score: 0, opinions: 0, comments: 0, surveys: 0, empathy: 0, source: 'live' }
  if (isSupabaseConfigured) {
    const { data, error } = await retrySupabase(() => supabase.rpc('fan_rank_for_user', { p_user_id: userId, p_team_id: teamId }))
    if (error) return { rank: null, total: 0, score: 0, opinions: 0, comments: 0, surveys: 0, empathy: 0, source: 'error' }
    const r = Array.isArray(data) ? data[0] : data
    return {
      rank: r?.rank ?? null,
      total: Number(r?.total) || 0,
      score: Number(r?.score) || 0,
      opinions: Number(r?.opinion_count) || 0,
      comments: Number(r?.comment_count) || 0,
      surveys: Number(r?.survey_count) || 0,
      empathy: Number(r?.received_like_count) || 0,
      lastActivityAt: r?.last_activity_at || null,
      source: 'live',
    }
  }
  // DEV: mock 내 요약
  return { rank: 3, total: 6, score: 4 * 10 + 6 * 3 + 2 * 5 + 8, opinions: 4, comments: 6, surveys: 2, empathy: 8, source: 'mock' }
}
