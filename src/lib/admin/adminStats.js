// FANCLUV — 관리자 대시보드 전용 통계 서비스.
//
// 관리자 대시보드(AdminDashboard)에서 쓰는 모든 집계(KPI · 구단별 통계 · 최근 활동 ·
// 차트)를 이 한 파일에 모았다. 화면 코드는 getAdminDashboard() 결과 shape 만 알면 되고,
// 집계 방식(Supabase RPC ↔ Mock)이 바뀌어도 이 파일만 유지보수하면 된다.
//
// 데이터 소스
//   - Supabase 설정 시  : rpc('admin_dashboard_stats') 서버 집계 (0013 마이그레이션)
//   - 미설정/RPC 오류 시 : 데모 Mock (앱이 키 없이도 동작하도록)
//
// 접근 권한 (요구사항 7)
//   - isAdmin() 이 아니면 빈 통계를 반환(데이터 노출 없음).
//   - 서버 RPC 자체도 SECURITY DEFINER + is_admin() 로 이중 방어.
//
// 캐시 (요구사항 6)
//   - withCache(CACHE_KEY, …, 30초). 페이지 진입 시 1회만 실제 집계.
//   - refreshAdminDashboard() 가 캐시를 무효화하고 즉시 재계산(새로고침 버튼).

import { supabase, isSupabaseConfigured } from '../supabase.js'
import { retrySupabase } from '../retry.js'
import { logger } from '../logger.js'
import { withCache, invalidate } from '../cache.js'
import { isAdmin } from '../auth.js'
import { TEAMS } from '../../teams.jsx'
import { MOCK_MEMBERS, MOCK_OPINIONS, MOCK_COMMENTS, MOCK_SURVEYS, MOCK_REPORTS } from '../../admin/adminData.js'

const CACHE_KEY = 'admin:dashboard'
const CACHE_TTL = 30_000 // 30초
const ACTIVE_DAYS = 30    // 활성 회원 기준(최근 30일 로그인)

// 페이지 진입 시 호출. 30초 캐시된 결과를 재사용한다.
export function getAdminDashboard() {
  return withCache(CACHE_KEY, loadDashboard, CACHE_TTL)
}

// 새로고침 버튼: 캐시를 버리고 즉시 다시 계산한다.
export function refreshAdminDashboard() {
  invalidate(CACHE_KEY)
  return getAdminDashboard()
}

async function loadDashboard() {
  // 관리자 권한이 없으면 통계 접근 불가 → 빈 구조(0/빈배열) 반환.
  if (!isAdmin()) return emptyDashboard()

  if (isSupabaseConfigured) {
    try {
      return await loadFromSupabase()
    } catch (e) {
      // 프로덕션: RPC 미배포/네트워크 오류 시에도 가짜 KPI 를 만들지 않는다.
      // 정직한 0(빈 대시보드)으로 폴백 — 실서비스에 Mock 숫자가 노출되지 않도록.
      logger.warn('관리자 통계 집계 실패 → 빈 대시보드 폴백', { error: e })
      return { ...emptyDashboard(), source: 'error' }
    }
  }
  // Supabase 미설정(로컬 DEV)에서만 데모 Mock 으로 화면 미리보기.
  return mockDashboard()
}

// ── Supabase 실집계 (RPC 1회 호출) ──
async function loadFromSupabase() {
  // 일시적 오류 시 최대 3회 재시도(retrySupabase).
  const { data, error } = await retrySupabase(() => supabase.rpc('admin_dashboard_stats', { days: ACTIVE_DAYS }))
  if (error) throw error
  if (!data) throw new Error('empty rpc result')
  return shapeDashboard(data, 'supabase')
}

// RPC(jsonb) → 화면이 쓰는 형태로 정규화. TEAMS 목록 기준으로 구단별 맵을 펼친다.
function shapeDashboard(d, source) {
  const kpi = d.kpi || {}
  const maps = d.teamMaps || {}
  const pick = (m, id) => Number((m && m[id]) || 0)

  const teams = TEAMS.map(tm => ({
    id: tm.id,
    name: tm.name,
    short: tm.short,
    color: tm.color,
    colorDeep: tm.colorDeep,
    members: pick(maps.members, tm.id),
    opinions: pick(maps.opinions, tm.id),
    comments: pick(maps.comments, tm.id),
    responses: pick(maps.responses, tm.id),
    aiRuns: pick(maps.aiRuns, tm.id),
  }))

  const charts = d.charts || {}
  return {
    source,
    kpi: normalizeKpi(kpi),
    teams,
    recent: Array.isArray(d.recent) ? d.recent : [],
    charts: {
      signups: charts.signups || [],
      opinions: charts.opinions || [],
      responses: charts.responses || [],
      reports: charts.reports || [],
      aiRuns: charts.aiRuns || [],
    },
  }
}

// KPI 10종을 항상 숫자로(누락 시 0) 보정.
function normalizeKpi(k) {
  const n = key => Number(k[key] || 0)
  return {
    totalMembers: n('totalMembers'),
    activeMembers: n('activeMembers'),
    totalOpinions: n('totalOpinions'),
    totalComments: n('totalComments'),
    totalSurveys: n('totalSurveys'),
    totalResponses: n('totalResponses'),
    totalReports: n('totalReports'),
    aiRuns: n('aiRuns'),
    signupsToday: n('signupsToday'),
    newMembersThisWeek: n('newMembersThisWeek'),
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Mock (데모용) — Supabase 미설정/오류 시. 구단별 수치를 합산해 KPI 와 일관성 유지.
// ════════════════════════════════════════════════════════════════════════

// 문자열 시드 기반 결정적 의사난수 — 렌더마다 값이 흔들리지 않게.
function seeded(seed, min, max) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) }
  return min + ((h >>> 0) % (max - min + 1))
}

function mockTeams() {
  return TEAMS.map(tm => ({
    id: tm.id,
    name: tm.name,
    short: tm.short,
    color: tm.color,
    colorDeep: tm.colorDeep,
    members: seeded(tm.id + 'mem', 380, 1580),
    opinions: seeded(tm.id + 'opi', 60, 420),
    comments: seeded(tm.id + 'cmt', 120, 900),
    responses: seeded(tm.id + 'res', 80, 640),
    aiRuns: seeded(tm.id + 'ai', 0, 6),
  }))
}

function mockSeries(prefix, min, max) {
  const labels = ['6/24', '6/25', '6/26', '6/27', '6/28', '6/29', '6/30']
  return labels.map(label => ({ label, value: seeded(prefix + label, min, max) }))
}

// 최근 활동 통합 피드 (Mock 콘텐츠 기반, 시간순 정렬)
function mockRecent() {
  const items = [
    ...MOCK_MEMBERS.map(m => ({ type: 'signup', title: m.nickname, team: m.team, actor: null, at: m.joinedAt })),
    ...MOCK_OPINIONS.map(o => ({ type: 'opinion', title: o.content, team: o.team, actor: o.author, at: o.date })),
    ...MOCK_COMMENTS.map(c => ({ type: 'comment', title: c.content, team: null, actor: c.author, at: c.date })),
    ...MOCK_SURVEYS.map(s => ({ type: 'survey', title: s.title, team: null, actor: null, at: s.endDate })),
    ...MOCK_REPORTS.map(r => ({ type: 'report', title: r.target, team: null, actor: r.reason, at: r.date })),
  ]
  return items
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 12)
}

function mockDashboard() {
  const teams = mockTeams()
  const sum = key => teams.reduce((s, t) => s + t[key], 0)
  const totalMembers = sum('members')
  return {
    source: 'mock',
    kpi: {
      totalMembers,
      activeMembers: Math.round(totalMembers * 0.72),
      totalOpinions: sum('opinions'),
      totalComments: sum('comments'),
      totalSurveys: seeded('surveys', 18, 42),
      totalResponses: sum('responses'),
      totalReports: seeded('reports', 6, 28),
      aiRuns: sum('aiRuns'),
      signupsToday: seeded('today', 8, 60),
      newMembersThisWeek: seeded('week', 120, 480),
    },
    teams,
    recent: mockRecent(),
    charts: {
      signups: mockSeries('sg', 40, 140),
      opinions: mockSeries('op', 90, 190),
      responses: mockSeries('rs', 60, 260),
      reports: mockSeries('rp', 0, 8),
      aiRuns: mockSeries('ai', 0, 4),
    },
  }
}

// 권한 없음/데이터 없음 안전 기본값 (0 / 빈 배열)
function emptyDashboard() {
  const zeroSeries = ['', '', '', '', '', '', ''].map(() => ({ label: '', value: 0 }))
  return {
    source: 'none',
    kpi: {
      totalMembers: 0, activeMembers: 0, totalOpinions: 0, totalComments: 0,
      totalSurveys: 0, totalResponses: 0, totalReports: 0, aiRuns: 0,
      signupsToday: 0, newMembersThisWeek: 0,
    },
    teams: TEAMS.map(tm => ({
      id: tm.id, name: tm.name, short: tm.short, color: tm.color, colorDeep: tm.colorDeep,
      members: 0, opinions: 0, comments: 0, responses: 0, aiRuns: 0,
    })),
    recent: [],
    charts: { signups: zeroSeries, opinions: zeroSeries, responses: zeroSeries, reports: zeroSeries, aiRuns: zeroSeries },
  }
}
