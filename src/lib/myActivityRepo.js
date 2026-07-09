// FANCLUV — My Activity repository (내 활동 페이지 실데이터).
//
// Supabase 설정 시 public.opinions/comments/likes/survey_responses 실데이터로
// 내가 작성한 의견 · 참여한 설문 · 최근 활동 · 통계를 조립한다. 미설정(DEV)에서만
// 로컬(opinionStore + localStorage)에서 파생한다. 더미 데이터는 사용하지 않는다.
import { supabase, isSupabaseConfigured } from './supabase.js'
import { logger } from './logger.js'
import { getCurrentUser } from './auth.js'
import { getCreatedOpinions } from '../opinionStore.js'
import { listMyEvents } from './activityEvents.js'

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}
function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function count(rows, key) {
  const m = {}
  for (const r of rows || []) m[r[key]] = (m[r[key]] || 0) + 1
  return m
}

// { opinions:[], surveys:[], timeline:[], stats:{opinions,comments,surveys,empathy} }
export async function getMyActivity(teamId) {
  const me = getCurrentUser()
  let base
  if (isSupabaseConfigured && me) {
    try { base = await liveActivity(me, teamId) }
    catch (error) { logger.error('내 활동 조회 실패', { error }); base = empty() }
  } else {
    base = mockActivity(teamId)
  }
  // 최근 활동: 작성/수정/삭제/댓글/공감/취소/설문/신고 등 모든 유형을 이벤트 로그에서
  // 최신순으로. (행 기반으로는 삭제/취소/수정을 표현할 수 없어 activity_events 사용)
  const events = await listMyEvents(12)
  base.timeline = events.map(e => ({ type: e.type, title: e.title, createdAt: e.created_at }))
  return base
}

function empty() { return { opinions: [], surveys: [], timeline: [], stats: { opinions: 0, comments: 0, surveys: 0, empathy: 0 } } }

async function liveActivity(me, teamId) {
  // 1) 내가 작성한 의견(현재 팀, 최신순)
  const { data: opsRaw } = await supabase
    .from('opinions').select('id, category, title, created_at')
    .eq('author_id', me.id).eq('team_id', teamId)
    .order('created_at', { ascending: false })
  const ops = opsRaw || []
  const opIds = ops.map(o => o.id)

  // 2) 내 의견의 공감/댓글 수(목록 표시 + 통계)
  const [likesRecvRes, cmtCntRes] = await Promise.all([
    opIds.length ? supabase.from('likes').select('opinion_id').in('opinion_id', opIds) : Promise.resolve({ data: [] }),
    opIds.length ? supabase.from('comments').select('opinion_id').in('opinion_id', opIds) : Promise.resolve({ data: [] }),
  ])
  const likeByOp = count(likesRecvRes.data, 'opinion_id')
  const cmtByOp = count(cmtCntRes.data, 'opinion_id')
  const empathy = (likesRecvRes.data || []).length

  const opinions = ops.map(o => ({
    id: o.id, category: o.category || '기타', title: o.title,
    date: fmtDate(o.created_at), createdAt: o.created_at,
    likes: likeByOp[o.id] || 0, comments: cmtByOp[o.id] || 0,
  }))

  // 3) 내 댓글 / 내 공감 / 내 설문응답 (최근순)
  const [myCmtRes, myLikeRes, myRespRes] = await Promise.all([
    supabase.from('comments').select('id, opinion_id, created_at').eq('author_id', me.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('likes').select('opinion_id, created_at').eq('user_id', me.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('survey_responses').select('survey_id, created_at').eq('user_id', me.id).order('created_at', { ascending: false }),
  ])
  const myComments = myCmtRes.data || []
  const myLikes = myLikeRes.data || []
  const myResp = myRespRes.data || []

  // 참조된 의견 제목 조회(댓글/공감 대상)
  const refIds = [...new Set([...myComments.map(c => c.opinion_id), ...myLikes.map(l => l.opinion_id)].filter(Boolean))]
  const titleById = {}
  for (const o of ops) titleById[o.id] = o.title
  const missing = refIds.filter(id => !titleById[id])
  if (missing.length) {
    const { data: refOps } = await supabase.from('opinions').select('id, title').in('id', missing)
    for (const o of refOps || []) titleById[o.id] = o.title
  }

  // 참여 설문 제목
  const surveyIds = [...new Set(myResp.map(r => r.survey_id).filter(Boolean))]
  const surveyTitleById = {}
  if (surveyIds.length) {
    const { data: svs } = await supabase.from('surveys').select('id, title').in('id', surveyIds)
    for (const s of svs || []) surveyTitleById[s.id] = s.title
  }
  const surveys = myResp.map(r => ({
    id: r.survey_id, title: surveyTitleById[r.survey_id] || '설문', date: fmtDate(r.created_at),
  }))

  // 4) 통계
  const stats = {
    opinions: opinions.length,
    comments: myComments.length,
    surveys: myResp.length,
    empathy,
  }

  // 5) 최근 활동 타임라인(여러 소스 병합 → 최신순 12개)
  const events = [
    ...opinions.map(o => ({ type: 'opinion', title: o.title, createdAt: o.createdAt })),
    ...myComments.map(c => ({ type: 'comment', title: titleById[c.opinion_id] || '', createdAt: c.created_at })),
    ...myLikes.map(l => ({ type: 'like', title: titleById[l.opinion_id] || '', createdAt: l.created_at })),
    ...myResp.map(r => ({ type: 'survey', title: surveyTitleById[r.survey_id] || '설문', createdAt: r.created_at })),
  ]
  events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const timeline = events.slice(0, 12)

  return { opinions, surveys, timeline, stats }
}

// DEV Mock: 로컬에 작성한 의견 + 저장 댓글에서 파생(더미 아님, 내 실제 로컬 활동).
function mockActivity(teamId) {
  const created = getCreatedOpinions(teamId)
  const opinions = created.map(o => ({
    id: o.id, category: o.category, title: o.title, date: '방금 전', createdAt: o.createdAt || new Date().toISOString(),
    likes: o.likes || 0, comments: o.comments || 0,
  }))
  const titleById = {}
  for (const o of created) titleById[o.id] = o.title
  const storedComments = readJSON('fancluv_comments', {})
  const myComments = []
  for (const [opinionId, arr] of Object.entries(storedComments)) {
    for (const c of arr || []) myComments.push({ opinionId, createdAt: c.createdAt, title: titleById[opinionId] || '' })
  }
  const participated = readJSON('fancluv_survey_participated', [])
  const surveys = (Array.isArray(participated) ? participated : Object.keys(participated || {}))
    .map(id => ({ id, title: '설문', date: '' }))

  const events = [
    ...opinions.map(o => ({ type: 'opinion', title: o.title, createdAt: o.createdAt })),
    ...myComments.map(c => ({ type: 'comment', title: c.title, createdAt: c.createdAt })),
  ].filter(e => e.createdAt)
  events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  return {
    opinions, surveys, timeline: events.slice(0, 12),
    stats: { opinions: opinions.length, comments: myComments.length, surveys: surveys.length, empathy: opinions.reduce((s, o) => s + (o.likes || 0), 0) },
  }
}
