// FANCLUV — B2B 고객(구단) 관리 repository.
//
// 계약된 구단(고객)의 상태/플랜/담당자/계약 이력을 관리한다. Supabase(customers/
// customer_contract_history) 또는 Mock. 운영자 전용 메모는 adminNotesRepo(entity_type
// 'customer')를 재사용한다. 모든 API 는 isAdmin() 로 접근을 막는다.
import { supabase, isSupabaseConfigured } from '../supabase.js'
import { getCurrentUser, isAdmin } from '../auth.js'
import { getTeam } from '../../teams.jsx'

// 계약 상태 / 플랜 (라벨은 locale admin.cust.status.* / plan.*)
export const CONTRACT_STATUSES = ['pilot', 'negotiating', 'active', 'ended', 'terminated']
export const SERVICE_PLANS = ['basic', 'professional', 'enterprise']

const KEY = 'fancluv_customers'
const HKEY = 'fancluv_customer_history'

function readMock(k) { try { return JSON.parse(localStorage.getItem(k)) || [] } catch { return [] } }
function writeMock(k, list) { try { localStorage.setItem(k, JSON.stringify(list)) } catch { /* ignore */ } }

// 데모 시드 (한 번만)
function seed() {
  const now = Date.now()
  return [
    { id: 'cs1', teamId: 'seoul', clubName: 'FC 서울', status: 'active', plan: 'professional', startDate: '2026-03-01', endDate: '2027-02-28', contactName: '김운영', contactEmail: 'partner@fcseoul.com', contactTitle: '마케팅팀장', contactPhone: '02-1234-5678', createdAt: new Date(now - 40 * 864e5).toISOString(), updatedAt: new Date(now - 3 * 864e5).toISOString() },
    { id: 'cs2', teamId: 'ulsan', clubName: '울산 HD', status: 'pilot', plan: 'basic', startDate: '2026-06-15', endDate: '2026-08-15', contactName: '이담당', contactEmail: 'fanclub@uhdfc.com', contactTitle: '팬서비스 매니저', contactPhone: '052-9876-5432', createdAt: new Date(now - 20 * 864e5).toISOString(), updatedAt: new Date(now - 20 * 864e5).toISOString() },
  ]
}
function getMock() {
  let list = readMock(KEY)
  if (!localStorage.getItem(KEY)) { list = seed(); writeMock(KEY, list) }
  return list
}

function mapRow(r) {
  return {
    id: r.id, teamId: r.team_id, clubName: r.club_name || getTeam(r.team_id)?.name || r.team_id,
    status: r.status, plan: r.plan, startDate: r.start_date || '', endDate: r.end_date || '',
    contactName: r.contact_name || '', contactEmail: r.contact_email || '',
    contactTitle: r.contact_title || '', contactPhone: r.contact_phone || '',
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

// ── 목록 ──
export async function adminListCustomers() {
  if (!isAdmin()) return []
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false })
    if (error) return []
    return (data || []).map(mapRow)
  }
  return getMock().slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

// ── 생성 ──
export async function createCustomer(input) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  const teamId = input.teamId
  if (!teamId) return { ok: false, code: 'no_team' }
  const clubName = getTeam(teamId)?.name || teamId
  const payload = {
    teamId, clubName,
    status: input.status || 'pilot', plan: input.plan || 'basic',
    startDate: input.startDate || null, endDate: input.endDate || null,
    contactName: input.contactName || '', contactEmail: input.contactEmail || '',
    contactTitle: input.contactTitle || '', contactPhone: input.contactPhone || '',
  }
  if (isSupabaseConfigured) {
    const me = getCurrentUser()
    const { data, error } = await supabase.from('customers').insert({
      team_id: teamId, club_name: clubName, status: payload.status, plan: payload.plan,
      start_date: payload.startDate, end_date: payload.endDate,
      contact_name: payload.contactName, contact_email: payload.contactEmail,
      contact_title: payload.contactTitle, contact_phone: payload.contactPhone,
      created_by: me?.id || null,
    }).select().single()
    if (error) return { ok: false, error: error.message }
    const customer = mapRow(data)
    await addHistory(customer.id, { date: payload.startDate || undefined, description: `${planLabelKo(payload.plan)} · ${statusLabelKo(payload.status)} 시작` })
    return { ok: true, customer }
  }
  const now = new Date().toISOString()
  const customer = { id: 'cs' + Date.now(), ...payload, createdAt: now, updatedAt: now }
  const list = getMock(); list.unshift(customer); writeMock(KEY, list)
  await addHistory(customer.id, { date: payload.startDate || undefined, description: `${planLabelKo(payload.plan)} · ${statusLabelKo(payload.status)} 시작` })
  return { ok: true, customer }
}

// ── 수정 (상태/플랜 변경 시 이력 자동 추가) ──
export async function updateCustomer(id, patch, prev) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  const now = new Date().toISOString()
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('customers').update({
      status: patch.status, plan: patch.plan,
      start_date: patch.startDate || null, end_date: patch.endDate || null,
      contact_name: patch.contactName, contact_email: patch.contactEmail,
      contact_title: patch.contactTitle, contact_phone: patch.contactPhone,
      updated_at: now,
    }).eq('id', id).select().single()
    if (error) return { ok: false, error: error.message }
    await autoHistory(id, prev, patch)
    return { ok: true, customer: mapRow(data) }
  }
  let updated = null
  writeMock(KEY, getMock().map(c => {
    if (c.id !== id) return c
    updated = { ...c, ...patch, updatedAt: now }
    return updated
  }))
  await autoHistory(id, prev, patch)
  return { ok: true, customer: updated }
}

// 상태/플랜이 바뀌면 계약 이력 자동 기록
async function autoHistory(id, prev, next) {
  if (!prev) return
  if (next.status && next.status !== prev.status) await addHistory(id, { description: `${statusLabelKo(next.status)}(으)로 변경` })
  if (next.plan && next.plan !== prev.plan) await addHistory(id, { description: `${planLabelKo(next.plan)} 플랜으로 변경` })
}

export async function deleteCustomer(id) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('customers').delete().eq('id', id)
    return { ok: !error }
  }
  writeMock(KEY, getMock().filter(c => c.id !== id))
  writeMock(HKEY, readMock(HKEY).filter(h => h.customerId !== id))
  return { ok: true }
}

// ── 계약 이력 ──
export async function listHistory(customerId) {
  if (!isAdmin()) return []
  if (isSupabaseConfigured) {
    const { data } = await supabase.from('customer_contract_history').select('*')
      .eq('customer_id', customerId).order('event_date', { ascending: false })
    return (data || []).map(h => ({ id: h.id, customerId: h.customer_id, date: h.event_date, description: h.description }))
  }
  return readMock(HKEY).filter(h => h.customerId === customerId)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
}

export async function addHistory(customerId, { date, description }) {
  if (!isAdmin()) return { ok: false, error: 'forbidden' }
  const text = (description || '').trim()
  if (!text) return { ok: false, error: 'empty' }
  const d = date || new Date().toISOString().slice(0, 10)
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('customer_contract_history')
      .insert({ customer_id: customerId, event_date: d, description: text }).select().single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, entry: { id: data.id, customerId, date: data.event_date, description: data.description } }
  }
  const entry = { id: 'h' + Date.now() + Math.random().toString(36).slice(2, 6), customerId, date: d, description: text }
  const list = readMock(HKEY); list.unshift(entry); writeMock(HKEY, list)
  return { ok: true, entry }
}

// 이력 자동 문구용 라벨(한국어 스냅샷 — 저장 시점 고정)
function statusLabelKo(s) {
  return { pilot: '파일럿', negotiating: '계약 진행 중', active: '이용 중', ended: '계약 종료', terminated: '해지' }[s] || s
}
function planLabelKo(p) {
  return { basic: 'Basic', professional: 'Professional', enterprise: 'Enterprise' }[p] || p
}
