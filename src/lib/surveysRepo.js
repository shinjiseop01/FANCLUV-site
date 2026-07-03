// FANCLUV — Surveys / Survey responses repository.
//
// 팬 설문 화면(SurveyPage)과 관리자 설문 관리(AdminSurveys)의 단일 데이터 소스.
// Supabase 설정 시 실제 테이블(surveys/survey_responses + surveys_view)을 사용하고,
// 아니면 기존 Mock 으로 자동 폴백한다. 모든 함수는 async.
import { supabase, isSupabaseConfigured } from './supabase.js'
import { getCurrentUser } from './auth.js'
import { MOCK_SURVEYS } from '../admin/adminData.js'
import { pushMockNotification } from './notificationsRepo.js'

// 종료 후 이 일수가 지나면 팬 목록 화면에서만 자동으로 숨긴다.
// (실제 데이터는 삭제하지 않으며 관리자/AI/통계에는 계속 포함된다.)
export const SURVEY_HIDE_DAYS = 3

function daysUntil(dateStr) {
  if (!dateStr) return 0
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000))
}
function isExpired(closedDate) {
  if (!closedDate) return false
  return (Date.now() - new Date(closedDate).getTime()) / 86400000 >= SURVEY_HIDE_DAYS
}

// ════════════════════════════════════════════════════════════════════════
//  MOCK
// ════════════════════════════════════════════════════════════════════════
// 팬 화면용 Mock 설문 (제목/설명은 locale survey.item.<id>.* 로 표시 → title/desc 없음)
const MOCK_FAN_SURVEYS = [
  { id: 'home',     participants: 1284, dday: 5,  status: 'open' },
  { id: 'cheer',    participants: 873,  dday: 12, status: 'open' },
  { id: 'md',       participants: 642,  dday: 3,  status: 'open' },
  { id: 'facility', participants: 1521, dday: 8,  status: 'open' },
  { id: 'season',   participants: 2087, dday: 0,  status: 'closed', closedAt: '2026-06-28' },
]

const PARTICIPATED_KEY = 'fancluv_survey_participated'
function getParticipated() {
  try { return JSON.parse(localStorage.getItem(PARTICIPATED_KEY)) || [] } catch { return [] }
}
function markParticipated(id) {
  const set = new Set(getParticipated())
  set.add(String(id))
  localStorage.setItem(PARTICIPATED_KEY, JSON.stringify([...set]))
}

// 관리자 Mock 설문은 세션 동안만 유지 (adminData 시드에서 시작)
let mockAdminSurveys = MOCK_SURVEYS.map(s => ({ ...s }))

// ════════════════════════════════════════════════════════════════════════
//  매퍼 (Supabase row → 화면 형태)
// ════════════════════════════════════════════════════════════════════════
function mapFanSurvey(row) {
  return {
    id: row.id,
    title: row.title,
    desc: row.description,
    status: row.status,
    dday: daysUntil(row.end_date),
    participants: Number(row.response_count) || 0,
    participated: !!row.has_responded,
    closedAt: row.status === 'closed' ? row.end_date : null,
  }
}
function mapAdminSurvey(row) {
  return {
    id: row.id,
    title: row.title,
    desc: row.description || '',
    question: Array.isArray(row.questions) && row.questions[0]?.q ? row.questions[0].q : '',
    endDate: row.end_date || '',
    status: row.status,
    responses: Number(row.response_count) || 0,
  }
}

// ════════════════════════════════════════════════════════════════════════
//  팬 API
// ════════════════════════════════════════════════════════════════════════

// 구단 설문 목록 (대상 구단 = team_id 또는 전체(null)). 종료 후 3일 지난 것은 팬 화면에서 제외.
export async function listSurveys(teamId) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('surveys_view').select('*')
      .or(`team_id.eq.${teamId},team_id.is.null`)
      .order('created_at', { ascending: false })
    if (error) return []
    return (data || []).map(mapFanSurvey).filter(s => !isExpired(s.closedAt))
  }
  const participated = new Set(getParticipated())
  return MOCK_FAN_SURVEYS
    .map(s => ({ ...s, participated: participated.has(String(s.id)) }))
    .filter(s => !isExpired(s.closedAt))
}

// 단일 설문 조회 (상세 페이지용). 없으면 null.
export async function getSurvey(teamId, surveyId) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('surveys_view').select('*').eq('id', surveyId).maybeSingle()
    if (error || !data) return null
    return mapFanSurvey(data)
  }
  const s = MOCK_FAN_SURVEYS.find(x => String(x.id) === String(surveyId))
  if (!s) return null
  return { ...s, participated: new Set(getParticipated()).has(String(s.id)) }
}

// 설문 응답 제출 (1인 1회). answers = { satisfaction, improve, revisit, comment }
export async function submitResponse(surveyId, teamId, answers) {
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    if (!me) return { ok: false, error: '로그인이 필요합니다.' }
    const { error } = await supabase.from('survey_responses').insert({
      survey_id: surveyId, user_id: me.id, team_id: teamId, answers,
    })
    if (error) {
      // unique 위반 = 이미 참여
      if (String(error.message).toLowerCase().includes('duplicate')) return { ok: false, code: 'duplicate' }
      return { ok: false, error: error.message }
    }
    return { ok: true }
  }
  markParticipated(surveyId)
  return { ok: true }
}

// ════════════════════════════════════════════════════════════════════════
//  관리자 API
// ════════════════════════════════════════════════════════════════════════
export async function adminListSurveys() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('surveys_view').select('*').order('created_at', { ascending: false })
    if (error) return []
    return (data || []).map(mapAdminSurvey)
  }
  return mockAdminSurveys.map(s => ({ ...s }))
}

export async function createSurvey({ title, desc = '', question = '', endDate = '', teamId = null }) {
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    const { data, error } = await supabase.from('surveys').insert({
      title, description: desc, team_id: teamId || null,
      end_date: endDate || null, status: 'open',
      questions: question ? [{ q: question }] : [],
      created_by: me?.id || null,
    }).select('*').single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, survey: { ...mapAdminSurvey({ ...data, response_count: 0 }) } }
  }
  const survey = { id: 's' + Date.now(), title, desc, question, endDate, status: 'open', responses: 0 }
  mockAdminSurveys = [survey, ...mockAdminSurveys]
  pushMockNotification({ type: 'survey', title: '새 설문', body: title, url: teamId ? `/club/${teamId}/survey/${survey.id}` : null })
  return { ok: true, survey }
}

export async function updateSurvey(id, { title, desc = '', question = '', endDate = '' }) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('surveys').update({
      title, description: desc, end_date: endDate || null,
      questions: question ? [{ q: question }] : [],
    }).eq('id', id).select('*').single()
    if (error) return { ok: false, error: error.message }
    const { count } = await supabase.from('survey_responses')
      .select('id', { count: 'exact', head: true }).eq('survey_id', id)
    return { ok: true, survey: mapAdminSurvey({ ...data, response_count: count || 0 }) }
  }
  const patch = { title, desc, question, endDate }
  mockAdminSurveys = mockAdminSurveys.map(s => (s.id === id ? { ...s, ...patch } : s))
  return { ok: true, survey: mockAdminSurveys.find(s => s.id === id) }
}

export async function closeSurvey(id) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('surveys').update({ status: 'closed' }).eq('id', id)
    return { ok: !error }
  }
  mockAdminSurveys = mockAdminSurveys.map(s => (s.id === id ? { ...s, status: 'closed' } : s))
  return { ok: true }
}

export async function deleteSurvey(id) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('surveys').delete().eq('id', id)
    return { ok: !error }
  }
  mockAdminSurveys = mockAdminSurveys.filter(s => s.id !== id)
  return { ok: true }
}
