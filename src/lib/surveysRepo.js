// FANCLUV — 설문 플랫폼 데이터 레이어 (단일 데이터 소스).
import { teamOrFilter } from './safety.js'
//
// 정규화 스키마(surveys → survey_questions → survey_answers)를 기반으로
// 관리자 빌더 / 팬 참여 / 결과 집계를 모두 지원한다. Supabase 미설정 시
// localStorage Mock 으로 자동 폴백하며 두 경로가 동일한 형태를 반환한다.
//
// 상태: draft → published → closed
//   · draft/응답 0건 : 질문 구조 자유 편집(전체 교체)
//   · 응답 존재       : 질문 구조 변경 제한, 삭제 대신 active=false 비활성화
//
// 향후 Quick Poll / AI 설문 생성도 이 레이어의 Question 모델을 그대로 재사용한다.
import { supabase, isSupabaseConfigured } from './supabase.js'
import { getCurrentUser, requiresIdentityVerification } from './auth.js'
import { pushMockNotification } from './notificationsRepo.js'
import { recordActivity } from './activityScore.js'
import { recordEvent } from './activityEvents.js'
import { newQuestion, newOption, uid } from './surveys/questionTypes.js'

// 종료 후 이 일수가 지나면 팬 목록에서만 자동으로 숨긴다(데이터는 보존).
export const SURVEY_HIDE_DAYS = 3

function daysUntil(dateStr) {
  if (!dateStr) return 0
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000))
}
function isHidden(closedAt) {
  if (!closedAt) return false
  return (Date.now() - new Date(closedAt).getTime()) / 86400000 >= SURVEY_HIDE_DAYS
}

// ════════════════════════════════════════════════════════════════════════
//  매퍼 (DB row → 화면 형태)
// ════════════════════════════════════════════════════════════════════════
function mapSurveyMeta(row) {
  return {
    id: row.id,
    title: row.title,
    desc: row.description || '',
    status: row.status,               // draft | published | closed
    isPublic: row.is_public !== false,
    teamId: row.team_id || null,
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    questionCount: Number(row.question_count) || 0,
    responses: Number(row.response_count) || 0,
    participants: Number(row.response_count) || 0, // 팬 목록 호환 별칭
    participated: !!row.has_responded,
    dday: daysUntil(row.end_date),
    closedAt: row.status === 'closed' ? (row.closed_at || row.end_date || null) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
function mapQuestion(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title || '',
    help_text: row.help_text || '',
    required: !!row.required,
    allow_other: !!row.allow_other,
    options: Array.isArray(row.options) ? row.options : [],
    config: row.config && typeof row.config === 'object' ? row.config : {},
    active: row.active !== false,
    _persisted: true,
  }
}
// 빌더 질문 → DB insert row
function questionToRow(q, surveyId, position) {
  return {
    survey_id: surveyId,
    position,
    type: q.type,
    title: q.title || '',
    help_text: q.help_text || '',
    required: !!q.required,
    allow_other: !!q.allow_other,
    options: q.options || [],
    config: q.config || {},
    active: q.active !== false,
  }
}

// ════════════════════════════════════════════════════════════════════════
//  MOCK STORE (localStorage) — 정규화 형태를 그대로 흉내낸다
// ════════════════════════════════════════════════════════════════════════
const LS_KEY = 'fancluv_surveys_v2'
const PARTICIPATED_KEY = 'fancluv_survey_participated'

function lsGet() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) } catch { return null }
}
function lsSet(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)) } catch { /* noop */ }
}
function getParticipated() {
  try { return new Set(JSON.parse(localStorage.getItem(PARTICIPATED_KEY)) || []) } catch { return new Set() }
}
function markParticipated(id) {
  const s = getParticipated(); s.add(String(id))
  try { localStorage.setItem(PARTICIPATED_KEY, JSON.stringify([...s])) } catch { /* noop */ }
}

// 시드용 질문 헬퍼
function q(type, title, extra = {}) {
  const base = newQuestion(type)
  return { ...base, title, ...extra }
}
function opt(...labels) { return labels.map(l => newOption(l)) }

// 시드 설문(다양한 유형을 모두 포함해 플랫폼을 시연)
function seedSurveys() {
  const s1qs = [
    q('rating', '홈 경기장 전반에 대한 만족도는?', { required: true, config: { max: 5 } }),
    q('single', '가장 개선이 필요한 부분은?', { required: true, allow_other: true, options: opt('좌석/시야', '편의시설', '먹거리/매점', '접근성/교통', '응원 환경') }),
    q('yesno', '다음 홈 경기에 다시 방문할 의향이 있으신가요?', { required: true }),
    q('long', '구단에 전하고 싶은 의견을 자유롭게 남겨 주세요.'),
  ]
  const s2qs = [
    q('multi', '선호하는 응원 방식을 모두 골라 주세요.', { required: true, options: opt('응원가 제창', '카드섹션', '깃발/배너', '원정 응원', '서포터즈 활동') }),
    q('nps', '이 구단을 지인에게 추천할 의향은?', { required: true }),
    q('short', '새로 만들고 싶은 응원가 주제가 있다면?'),
  ]
  const s3qs = [
    q('rating', 'MD 상품 품질에 대한 만족도는?', { required: true }),
    q('dropdown', '가장 마음에 드는 상품군은?', { options: opt('유니폼', '머플러', '키링/뱃지', '리빙/문구', '한정판') }),
  ]
  const now = Date.now()
  const iso = (d) => new Date(now + d * 86400000).toISOString().slice(0, 10)
  const mk = (id, title, desc, status, questions, endDays) => ({
    id, title, description: desc, status, is_public: true, team_id: null,
    start_date: iso(-10), end_date: iso(endDays), published_at: status !== 'draft' ? new Date().toISOString() : null,
    closed_at: status === 'closed' ? new Date(now - 4 * 86400000).toISOString() : null,
    created_at: new Date(now - 12 * 86400000).toISOString(), updated_at: new Date().toISOString(),
    questions, responses: [],
  })
  const surveys = [
    mk(uid(), '2026 홈 경기장 시설 만족도 조사', '홈경기 관람 환경 전반에 대한 의견을 수집합니다.', 'published', s1qs, 12),
    mk(uid(), '응원 문화 조사', '응원가·응원 방식에 대한 의견을 모읍니다.', 'published', s2qs, 20),
    mk(uid(), 'MD 상품 만족도 조사', '굿즈 품질·가격에 대한 평가를 받습니다.', 'closed', s3qs, -2),
    mk(uid(), '새 시즌 기대 설문 (작성 중)', '아직 게시 전 초안입니다.', 'draft', [q('single', '이번 시즌 가장 기대되는 것은?', { options: opt('우승 도전', '유망주 성장', '새 감독 체제', '홈 분위기') })], 30),
  ]
  // 시연용 가짜 응답 생성(결과 화면/차트가 비지 않도록)
  const randPick = (arr) => arr[Math.floor(Math.random() * arr.length)]
  for (const s of surveys) {
    if (s.status === 'draft') continue
    const n = 18 + Math.floor(Math.random() * 30)
    for (let i = 0; i < n; i++) {
      const answers = {}
      for (const qq of s.questions) {
        if (qq.type === 'rating') answers[qq.id] = 3 + Math.floor(Math.random() * 3)
        else if (qq.type === 'nps') answers[qq.id] = Math.floor(Math.random() * 11)
        else if (qq.type === 'yesno') answers[qq.id] = Math.random() > 0.3 ? 'yes' : 'no'
        else if (qq.type === 'single' || qq.type === 'dropdown') answers[qq.id] = randPick(qq.options).id
        else if (qq.type === 'multi') answers[qq.id] = qq.options.filter(() => Math.random() > 0.55).map(o => o.id)
        else if (qq.type === 'short') { if (Math.random() > 0.6) answers[qq.id] = randPick(['좋아요', '만족합니다', '더 다양했으면', '가격이 아쉬워요']) }
        else if (qq.type === 'long') { if (Math.random() > 0.5) answers[qq.id] = '전반적으로 만족스럽지만 편의시설 개선을 바랍니다.' }
      }
      s.responses.push({ id: uid(), answers, created_at: new Date(now - Math.random() * 9 * 86400000).toISOString() })
    }
  }
  return surveys
}

function mockStore() {
  let list = lsGet()
  if (!Array.isArray(list)) { list = seedSurveys(); lsSet(list) }
  return list
}
function mockSave(list) { lsSet(list) }
function mockMetaFromRow(s, participated) {
  return mapSurveyMeta({
    ...s, question_count: s.questions.filter(qq => qq.active !== false).length,
    response_count: s.responses.length, has_responded: participated.has(String(s.id)),
  })
}

// ════════════════════════════════════════════════════════════════════════
//  팬 API
// ════════════════════════════════════════════════════════════════════════

// 팬 목록: 해당 구단(또는 전체) 대상, 게시(published)이며 공개(is_public)인 설문.
export async function listSurveys(teamId) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('surveys_view').select('*')
      .eq('status', 'published').eq('is_public', true)
      .or(teamOrFilter(teamId)) // PostgREST or-filter 인젝션 방어(safety.js)
      .order('created_at', { ascending: false })
    if (error) return []
    return (data || []).map(mapSurveyMeta).filter(s => !isHidden(s.closedAt))
  }
  const participated = getParticipated()
  return mockStore()
    .filter(s => s.status === 'published' && s.is_public && (s.team_id == null || s.team_id === teamId))
    .map(s => mockMetaFromRow(s, participated))
    .filter(s => !isHidden(s.closedAt))
}

// 단일 설문 + 질문(팬 참여용). active 질문만, position 순.
export async function getSurvey(teamId, surveyId) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('surveys_view').select('*').eq('id', surveyId).maybeSingle()
    if (error || !data) return null
    const meta = mapSurveyMeta(data)
    const { data: qs } = await supabase.from('survey_questions').select('*')
      .eq('survey_id', surveyId).eq('active', true).order('position', { ascending: true })
    meta.questions = (qs || []).map(mapQuestion)
    return meta
  }
  const participated = getParticipated()
  const s = mockStore().find(x => String(x.id) === String(surveyId))
  if (!s) return null
  const meta = mockMetaFromRow(s, participated)
  meta.questions = s.questions.filter(qq => qq.active !== false)
  return meta
}

// 응답 제출. answers = { [questionId]: value } (기타 텍스트는 호출 측에서 치환 완료)
export async function submitResponse(surveyId, teamId, answers) {
  if (requiresIdentityVerification())
    return { ok: false, code: 'identity_required', error: '본인인증 후 이용할 수 있습니다.' }

  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    if (!me) return { ok: false, error: '로그인이 필요합니다.' }
    const { data: resp, error } = await supabase.from('survey_responses')
      .insert({ survey_id: surveyId, user_id: me.id, team_id: teamId }).select('id').single()
    if (error) {
      if (String(error.message).toLowerCase().includes('duplicate')) return { ok: false, code: 'duplicate' }
      return { ok: false, error: error.message }
    }
    const rows = Object.entries(answers)
      .filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
      .map(([question_id, value]) => ({ response_id: resp.id, question_id, value }))
    if (rows.length) {
      const { error: aErr } = await supabase.from('survey_answers').insert(rows)
      if (aErr) return { ok: false, error: aErr.message }
    }
    recordActivity('survey')
    recordEvent('survey_join', { entityType: 'survey', entityId: surveyId, teamId })
    return { ok: true }
  }

  // Mock
  const list = mockStore()
  const s = list.find(x => String(x.id) === String(surveyId))
  if (!s) return { ok: false, error: 'not found' }
  if (getParticipated().has(String(surveyId))) return { ok: false, code: 'duplicate' }
  s.responses.push({ id: uid(), answers, created_at: new Date().toISOString() })
  mockSave(list)
  markParticipated(surveyId)
  recordActivity('survey')
  recordEvent('survey_join', { entityType: 'survey', entityId: surveyId, teamId })
  return { ok: true }
}

// ════════════════════════════════════════════════════════════════════════
//  관리자 API
// ════════════════════════════════════════════════════════════════════════
export async function adminListSurveys() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('surveys_view').select('*').order('created_at', { ascending: false })
    if (error) return []
    return (data || []).map(mapSurveyMeta)
  }
  const participated = getParticipated()
  return mockStore().map(s => mockMetaFromRow(s, participated))
}

// 편집용 설문 + 질문 전체(비활성 포함).
export async function getSurveyForEdit(id) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('surveys_view').select('*').eq('id', id).maybeSingle()
    if (error || !data) return null
    const meta = mapSurveyMeta(data)
    const { data: qs } = await supabase.from('survey_questions').select('*')
      .eq('survey_id', id).order('position', { ascending: true })
    meta.questions = (qs || []).map(mapQuestion)
    return meta
  }
  const s = mockStore().find(x => String(x.id) === String(id))
  if (!s) return null
  const meta = mockMetaFromRow(s, getParticipated())
  meta.questions = s.questions.map(qq => ({ ...qq, _persisted: true }))
  return meta
}

// 생성/수정 통합 저장. payload: { id?, title, desc, teamId, isPublic, startDate, endDate, status, questions[] }
export async function saveSurvey(payload) {
  const meta = {
    title: payload.title, description: payload.desc || '', team_id: payload.teamId || null,
    is_public: payload.isPublic !== false, start_date: payload.startDate || null,
    end_date: payload.endDate || null, status: payload.status || 'draft', updated_at: new Date().toISOString(),
  }
  if (meta.status === 'published' && !payload.publishedKeep) meta.published_at = new Date().toISOString()
  if (meta.status === 'closed') meta.closed_at = new Date().toISOString()

  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    let surveyId = payload.id
    if (!surveyId) {
      const { data, error } = await supabase.from('surveys')
        .insert({ ...meta, created_by: me?.id || null, questions: [] }).select('id').single()
      if (error) return { ok: false, error: error.message }
      surveyId = data.id
    } else {
      const { error } = await supabase.from('surveys').update(meta).eq('id', surveyId)
      if (error) return { ok: false, error: error.message }
    }
    // 응답 존재 여부로 구조 편집 전략 결정
    const { count: respCount } = await supabase.from('survey_responses')
      .select('id', { count: 'exact', head: true }).eq('survey_id', surveyId)
    const hasResponses = (respCount || 0) > 0

    const incoming = payload.questions || []
    if (!hasResponses) {
      // 자유 편집: 전체 교체(응답이 없으므로 안전)
      await supabase.from('survey_questions').delete().eq('survey_id', surveyId)
      if (incoming.length) {
        const rows = incoming.map((qq, i) => questionToRow(qq, surveyId, i))
        const { error } = await supabase.from('survey_questions').insert(rows)
        if (error) return { ok: false, error: error.message }
      }
    } else {
      // 응답 존재: 구조 보존. persisted 는 안전 필드만 update, 신규는 insert, 삭제는 active=false
      const { data: existing = [] } = await supabase.from('survey_questions').select('id').eq('survey_id', surveyId)
      const keepIds = new Set(incoming.filter(qq => qq._persisted).map(qq => qq.id))
      for (let i = 0; i < incoming.length; i++) {
        const qq = incoming[i]
        if (qq._persisted && qq.id) {
          await supabase.from('survey_questions').update({
            position: i, title: qq.title || '', help_text: qq.help_text || '', required: !!qq.required,
          }).eq('id', qq.id)
        } else {
          await supabase.from('survey_questions').insert(questionToRow(qq, surveyId, i))
        }
      }
      for (const ex of existing) {
        if (!keepIds.has(ex.id)) await supabase.from('survey_questions').update({ active: false }).eq('id', ex.id)
      }
    }
    if (!payload.id && meta.status === 'published') {
      pushMockNotification({ type: 'survey', title: '새 설문', body: payload.title, url: null })
    }
    return { ok: true, id: surveyId }
  }

  // Mock
  const list = mockStore()
  if (!payload.id) {
    const row = {
      id: uid(), ...meta, published_at: meta.status !== 'draft' ? new Date().toISOString() : null,
      created_at: new Date().toISOString(),
      questions: (payload.questions || []).map(qq => ({ ...qq, _persisted: true })), responses: [],
    }
    list.unshift(row)
    mockSave(list)
    if (meta.status === 'published') pushMockNotification({ type: 'survey', title: '새 설문', body: payload.title, url: null })
    return { ok: true, id: row.id }
  }
  const s = list.find(x => String(x.id) === String(payload.id))
  if (!s) return { ok: false, error: 'not found' }
  Object.assign(s, meta)
  const hasResponses = s.responses.length > 0
  if (!hasResponses) {
    s.questions = (payload.questions || []).map(qq => ({ ...qq, _persisted: true }))
  } else {
    const keep = new Set((payload.questions || []).filter(qq => qq._persisted).map(qq => qq.id))
    const merged = (payload.questions || []).map(qq => ({ ...qq, _persisted: true }))
    for (const old of s.questions) if (!keep.has(old.id)) merged.push({ ...old, active: false, _persisted: true })
    s.questions = merged
  }
  mockSave(list)
  return { ok: true, id: s.id }
}

export async function setSurveyStatus(id, status) {
  const patch = { status, updated_at: new Date().toISOString() }
  if (status === 'published') patch.published_at = new Date().toISOString()
  if (status === 'closed') patch.closed_at = new Date().toISOString()
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('surveys').update(patch).eq('id', id)
    return { ok: !error, error: error?.message }
  }
  const list = mockStore()
  const s = list.find(x => String(x.id) === String(id))
  if (s) { Object.assign(s, patch); mockSave(list) }
  return { ok: true }
}

export async function deleteSurvey(id) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('surveys').delete().eq('id', id)
    return { ok: !error, error: error?.message }
  }
  const list = mockStore().filter(x => String(x.id) !== String(id))
  mockSave(list)
  return { ok: true }
}

// 결과 집계용 원본: 질문 목록 + 질문별 응답 값 배열.
export async function getSurveyResults(id) {
  if (isSupabaseConfigured) {
    const { data: sv } = await supabase.from('surveys_view').select('*').eq('id', id).maybeSingle()
    if (!sv) return null
    const meta = mapSurveyMeta(sv)
    const { data: qs = [] } = await supabase.from('survey_questions').select('*')
      .eq('survey_id', id).order('position', { ascending: true })
    const qids = (qs || []).map(x => x.id)
    const { data: answers = [] } = await supabase.from('survey_answers')
      .select('question_id, value, response_id')
      .in('question_id', qids.length ? qids : ['00000000-0000-0000-0000-000000000000'])
    const byQ = {}
    for (const q0 of qs || []) byQ[q0.id] = []
    const byResp = {}
    for (const a of answers || []) {
      if (byQ[a.question_id]) byQ[a.question_id].push(a.value)
      ;(byResp[a.response_id] ||= {})[a.question_id] = a.value
    }
    const responseRows = Object.entries(byResp).map(([id, ans]) => ({ id, answers: ans }))
    return { survey: meta, questions: (qs || []).map(mapQuestion), answersByQuestion: byQ, responseRows, responseCount: meta.responses }
  }
  const s = mockStore().find(x => String(x.id) === String(id))
  if (!s) return null
  const meta = mockMetaFromRow(s, getParticipated())
  const byQ = {}
  for (const qq of s.questions) byQ[qq.id] = []
  for (const r of s.responses) for (const [qid, v] of Object.entries(r.answers || {})) { if (byQ[qid]) byQ[qid].push(v) }
  const responseRows = s.responses.map(r => ({ id: r.id, answers: r.answers || {}, createdAt: r.created_at }))
  return { survey: meta, questions: s.questions, answersByQuestion: byQ, responseRows, responseCount: s.responses.length }
}

// ════════════════════════════════════════════════════════════════════════
//  KPI / 액션트래커 호환 (기존 시그니처 유지)
// ════════════════════════════════════════════════════════════════════════

// 별점(rating) 응답을 만족도 신호로 환산해 반환(KPI 블렌딩용). 실패 시 [].
export async function listSurveyResponses(teamId) {
  if (isSupabaseConfigured) {
    try {
      let query = supabase.from('survey_answers')
        .select('value, question:survey_questions!inner(type, survey:surveys!inner(team_id))')
        .eq('question.type', 'rating')
      if (teamId && teamId !== 'all') query = query.eq('question.survey.team_id', teamId)
      const { data, error } = await query.limit(1000)
      if (error) return []
      return (data || []).map(r => ({ satisfaction: Number(r.value) || 0 }))
    } catch { return [] }
  }
  const out = []
  for (const s of mockStore()) {
    if (teamId && teamId !== 'all' && s.team_id && s.team_id !== teamId) continue
    const ratingQ = s.questions.find(qq => qq.type === 'rating')
    if (!ratingQ) continue
    for (const r of s.responses) {
      const v = r.answers?.[ratingQ.id]
      if (v) out.push({ satisfaction: Number(v) || 0, createdAt: r.created_at })
    }
  }
  return out
}

export async function countSurveyResponses(teamId) {
  if (isSupabaseConfigured) {
    let query = supabase.from('survey_responses').select('id', { count: 'exact', head: true })
    if (teamId && teamId !== 'all') query = query.eq('team_id', teamId)
    const { count } = await query
    return count || 0
  }
  return mockStore()
    .filter(s => !teamId || teamId === 'all' || s.team_id == null || s.team_id === teamId)
    .reduce((sum, s) => sum + s.responses.length, 0)
}
