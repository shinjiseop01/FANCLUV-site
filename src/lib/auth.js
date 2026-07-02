// FANCLUV — Authentication (Supabase-first, with localStorage Mock fallback).
//
// ┌─ 동작 방식 ────────────────────────────────────────────────────────────┐
// │ • .env 에 Supabase 키가 있으면(isSupabaseConfigured) → 실제 Supabase    │
// │   Auth + profiles 테이블 사용 (실제 회원가입/로그인/세션/프로필).      │
// │ • 키가 없으면 → 기존 localStorage Mock 으로 자동 폴백 (앱이 안 깨짐).   │
// └────────────────────────────────────────────────────────────────────────┘
//
// getCurrentUser()/isAuthenticated()/isAdmin() 는 화면 여러 곳에서 "동기"로
// 호출된다. Supabase 세션은 비동기이므로, AuthContext 가 세션/프로필을 로드해
// 아래 동기 캐시(cachedUser)에 반영하고, 그 값을 동기로 반환한다.
import { supabase, isSupabaseConfigured } from './supabase.js'
import { getProvider, SUPABASE_PROVIDER_CONFIG } from './oauth.js'

const USERS_KEY = 'fancluv_users'
const SESSION_KEY = 'fancluv_session' // (Mock) 현재 로그인한 사용자의 email

// 권한(Role) 체계 — 관리자 콘솔 접근 가능한 역할을 ADMIN_ROLES 한 곳에서 관리.
export const ROLES = {
  FAN: 'fan',
  ADMIN: 'admin',
  SUPER_ADMIN: 'superadmin', // 예정
  STAFF: 'staff',            // 예정 (FANCLUV 직원)
  CLUB_ADMIN: 'club_admin',  // 예정 (구단 관리자)
}
export const ADMIN_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.STAFF, ROLES.CLUB_ADMIN]

// 본인인증(Verification) 체계.
export const VERIFICATION = {
  UNVERIFIED: 'unverified',
  EMAIL_VERIFIED: 'email_verified',
  PHONE_VERIFIED: 'phone_verified',
}

// ════════════════════════════════════════════════════════════════════════
//  동기 프로필 캐시 (Supabase 모드에서 legacy 동기 API 를 지원)
// ════════════════════════════════════════════════════════════════════════
let cachedUser = null

// AuthContext 가 캐시를 직접 세팅할 때 사용.
export function _setAuthCache(user) { cachedUser = user }

// DB profiles row(+auth user) → 앱 사용자 객체로 매핑.
// DB role('user'|'admin') → 앱 role('fan'|'admin') 로 변환해 기존 판정 로직 유지.
function mapSupabaseUser(authUser, profile) {
  if (!authUser) return null
  const p = profile || {}
  const emailVerified = !!authUser.email_confirmed_at || !!p.is_email_verified
  return {
    id: authUser.id,
    email: authUser.email || p.email || null,
    nickname: p.nickname || authUser.email?.split('@')[0] || 'FANCLUV 팬',
    selectedTeam: p.selected_team || null,
    gender: p.gender || null,
    ageGroup: p.age_group || null,
    avatarUrl: p.avatar_url || null,
    role: p.role === 'admin' ? ROLES.ADMIN : ROLES.FAN,
    provider: p.provider || 'email',
    providerUserId: p.provider_user_id || null,
    nicknameUpdatedAt: p.nickname_updated_at || null,
    isEmailVerified: emailVerified,
    verificationStatus:
      p.verification_status ||
      (emailVerified ? VERIFICATION.EMAIL_VERIFIED : VERIFICATION.UNVERIFIED),
  }
}

// 현재 Supabase 세션 + 프로필을 읽어 캐시에 반영하고 사용자 객체를 반환.
// AuthContext 초기화/세션변경 시 호출.
export async function loadCurrentSupabaseUser() {
  if (!isSupabaseConfigured) return null
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { cachedUser = null; return null }
  const authUser = session.user
  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', authUser.id).maybeSingle()
  cachedUser = mapSupabaseUser(authUser, profile)
  return cachedUser
}

// Supabase auth 에러를 사용자 친화 메시지로 변환.
function translateAuthError(error) {
  const msg = (error?.message || '').toLowerCase()
  if (msg.includes('invalid login')) return '이메일 또는 비밀번호가 올바르지 않습니다.'
  if (msg.includes('email not confirmed')) return '이메일 인증이 완료되지 않은 계정입니다.'
  if (msg.includes('already registered') || msg.includes('already exists')) return '이미 가입된 이메일입니다.'
  if (msg.includes('password')) return '비밀번호는 6자 이상이어야 합니다.'
  return error?.message || '요청을 처리하지 못했습니다. 다시 시도해 주세요.'
}

async function patchSupabaseProfile(patch) {
  if (!cachedUser) return { ok: false, error: '로그인이 필요합니다.' }
  const { error } = await supabase.from('profiles').update(patch).eq('id', cachedUser.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ════════════════════════════════════════════════════════════════════════
//  MOCK 구현 (localStorage) — Supabase 미설정 시 폴백. 기존 동작 그대로 유지.
// ════════════════════════════════════════════════════════════════════════
function defaultVerification() {
  return {
    isEmailVerified: false, emailVerifiedAt: null,
    isPhoneVerified: false, phoneVerifiedAt: null,
    verificationMethod: 'none', verificationStatus: VERIFICATION.UNVERIFIED,
  }
}
function seededEmailVerified(at) {
  return {
    isEmailVerified: true, emailVerifiedAt: at,
    isPhoneVerified: false, phoneVerifiedAt: null,
    verificationMethod: 'email', verificationStatus: VERIFICATION.EMAIL_VERIFIED,
  }
}
function readUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY)) || [] } catch { return [] }
}
function writeUsers(users) { localStorage.setItem(USERS_KEY, JSON.stringify(users)) }
function publicUser(u) {
  if (!u) return null
  const { password, ...rest } = u
  return rest
}
function setSession(email) { localStorage.setItem(SESSION_KEY, email) }

function ensureSeed() {
  const users = readUsers()
  let changed = false
  let fan = users.find(u => u.email === 'fan@fancluv.kr')
  if (!fan) {
    fan = { nickname: '민준', email: 'fan@fancluv.kr', password: '1234',
      joinedAt: '2025-03-14T00:00:00.000Z', selectedTeam: null, role: ROLES.FAN }
    users.push(fan); changed = true
  }
  let admin = users.find(u => u.email === 'admin@fancluv.kr')
  if (!admin) {
    admin = { nickname: 'FANCLUV 운영자', email: 'admin@fancluv.kr', password: 'admin123',
      joinedAt: '2025-01-01T00:00:00.000Z', selectedTeam: null, role: ROLES.ADMIN }
    users.push(admin); changed = true
  }
  for (const u of [fan, admin]) {
    if (u.verificationStatus == null) { Object.assign(u, seededEmailVerified(u.joinedAt)); changed = true }
    if (!('gender' in u)) { u.gender = null; changed = true }
    if (!('ageGroup' in u)) { u.ageGroup = u === fan ? '20' : null; changed = true }
    if (!('avatarUrl' in u)) { u.avatarUrl = null; changed = true }
    if (!('lastNicknameChangeAt' in u)) { u.lastNicknameChangeAt = null; changed = true }
    if (!('provider' in u)) { u.provider = null; changed = true }
  }
  if (changed) writeUsers(users)
}
// Mock 모드에서만 데모 계정 시드.
if (!isSupabaseConfigured) ensureSeed()

function mockSignup({ nickname, email, password, gender = null, ageGroup = null }) {
  const users = readUsers()
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
    return { ok: false, error: '이미 가입된 이메일입니다.' }
  const now = new Date().toISOString()
  const user = {
    nickname, email, password,
    provider: null, providerUserId: null,
    gender, ageGroup, avatarUrl: null, lastNicknameChangeAt: null,
    joinedAt: now, selectedTeam: null, role: ROLES.FAN,
    ...seededEmailVerified(now),
  }
  users.push(user); writeUsers(users); setSession(email)
  return { ok: true, user: publicUser(user) }
}
function mockLogin({ email, password }) {
  const users = readUsers()
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password)
  if (!user) return { ok: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }
  if (!ADMIN_ROLES.includes(user.role) && !user.isEmailVerified)
    return { ok: false, error: '이메일 인증이 완료되지 않은 계정입니다.', code: 'unverified' }
  setSession(email)
  return { ok: true, user: publicUser(user) }
}
function mockLogout() { localStorage.removeItem(SESSION_KEY) }
function mockGetCurrentUser() {
  const email = localStorage.getItem(SESSION_KEY)
  if (!email) return null
  return publicUser(readUsers().find(u => u.email.toLowerCase() === email.toLowerCase()))
}
function mockPatchUser(email, patch) {
  const users = readUsers()
  const idx = users.findIndex(u => u.email.toLowerCase() === (email || '').toLowerCase())
  if (idx === -1) return { ok: false }
  users[idx] = { ...users[idx], ...patch }; writeUsers(users)
  return { ok: true, user: publicUser(users[idx]) }
}
function mockPatchSessionUser(patch) {
  const email = localStorage.getItem(SESSION_KEY)
  if (!email) return { ok: false, error: '로그인이 필요합니다.' }
  return mockPatchUser(email, patch)
}
function mockSocialLogin(profile, isNewRef) {
  // profile: { provider, providerUserId, email, nickname, profileImage }
  const users = readUsers()
  const emailLc = (profile.email || '').toLowerCase()
  const now = new Date().toISOString()
  let user = users.find(u => u.provider === profile.provider && u.providerUserId === profile.providerUserId)
  if (!user && emailLc) {
    user = users.find(u => u.email.toLowerCase() === emailLc)
    if (user) {
      user.provider = profile.provider
      user.providerUserId = profile.providerUserId
      if (!user.avatarUrl && profile.profileImage) user.avatarUrl = profile.profileImage
      Object.assign(user, seededEmailVerified(now)); writeUsers(users)
    }
  }
  if (!user) {
    user = {
      nickname: profile.nickname, email: profile.email, password: null,
      provider: profile.provider, providerUserId: profile.providerUserId,
      avatarUrl: profile.profileImage, gender: null, ageGroup: null,
      lastNicknameChangeAt: null, joinedAt: now, selectedTeam: null, role: ROLES.FAN,
      ...seededEmailVerified(now),
    }
    users.push(user); writeUsers(users); if (isNewRef) isNewRef.value = true
  }
  setSession(user.email)
  return { ok: true, user: publicUser(user) }
}

// ════════════════════════════════════════════════════════════════════════
//  공개 API (facade) — Supabase 모드/Mock 모드 자동 분기
// ════════════════════════════════════════════════════════════════════════

// ── 회원가입 ──
export async function signup({ nickname, email, password, gender = null, ageGroup = null }) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { nickname, gender, age_group: ageGroup, provider: 'email' } },
    })
    if (error) return { ok: false, error: translateAuthError(error) }
    // 이메일 확인 설정이 켜져 있으면 세션이 없다(메일 확인 후 로그인).
    const needsConfirm = !data.session
    if (data.session) await loadCurrentSupabaseUser()
    return { ok: true, needsConfirm, user: cachedUser }
  }
  return mockSignup({ nickname, email, password, gender, ageGroup })
}

// ── 로그인 ──
export async function login({ email, password }) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      const code = (error.message || '').toLowerCase().includes('not confirmed') ? 'unverified' : undefined
      return { ok: false, error: translateAuthError(error), code }
    }
    const user = await loadCurrentSupabaseUser()
    return { ok: true, user }
  }
  return mockLogin({ email, password })
}

// ── 로그아웃 ──
export async function logout() {
  cachedUser = null // 가드가 즉시 반영되도록 동기 초기화
  if (isSupabaseConfigured) { await supabase.auth.signOut(); return }
  mockLogout()
}

// ── 소셜 로그인 (Google = Supabase OAuth / Kakao·NAVER = 인터페이스 유지) ──
export async function socialLogin(providerId) {
  if (isSupabaseConfigured) {
    const cfg = SUPABASE_PROVIDER_CONFIG[providerId]
    if (!cfg) return { ok: false, error: '지원하지 않는 로그인 방식입니다.' }

    // Google · Kakao — Supabase 기본 지원 provider.
    if (cfg.native) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: cfg.supabaseProvider,
        options: { redirectTo: window.location.origin },
      })
      if (error) return { ok: false, error: translateAuthError(error) }
      return { ok: true, redirecting: true } // 브라우저가 provider 로 리다이렉트됨
    }

    // NAVER — Supabase 미지원 → 커스텀 OAuth authorize 로 리다이렉트.
    // (콜백에서 code→token→Supabase 세션 교환은 Edge Function 이 처리 — SOCIAL_LOGIN_SETUP.md)
    if (providerId === 'naver') {
      const clientId = import.meta.env.VITE_NAVER_CLIENT_ID
      if (!clientId || clientId.includes('your-naver')) {
        return { ok: false, error: 'NAVER 로그인 설정이 필요합니다. SOCIAL_LOGIN_SETUP.md 를 참고해 주세요.' }
      }
      const redirectUri = import.meta.env.VITE_NAVER_CALLBACK_URL || `${window.location.origin}/auth/naver/callback`
      // state 에 nonce + 앱 복귀 주소(origin)를 담아 Edge Function 이 로그인 후 앱으로 되돌린다.
      const nonce = Math.random().toString(36).slice(2)
      const state = btoa(JSON.stringify({ n: nonce, r: window.location.origin }))
      try { sessionStorage.setItem('naver_oauth_state', nonce) } catch { /* noop */ }
      const authorizeUrl =
        'https://nid.naver.com/oauth2.0/authorize?response_type=code' +
        `&client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${encodeURIComponent(state)}`
      window.location.href = authorizeUrl
      return { ok: true, redirecting: true }
    }
    return { ok: false, error: '지원하지 않는 로그인 방식입니다.' }
  }
  // Mock 모드 — 기존 소셜 Mock 로그인.
  const provider = getProvider(providerId)
  if (!provider) return { ok: false, error: '지원하지 않는 로그인 방식입니다.' }
  let profile
  try { profile = await provider.signIn() } catch { profile = null }
  if (!profile) return { ok: false, error: '소셜 로그인에 실패했습니다. 다시 시도해 주세요.' }
  const isNewRef = { value: false }
  const res = mockSocialLogin(profile, isNewRef)
  return { ...res, isNew: isNewRef.value }
}

// ── 현재 로그인 사용자 (동기) ──
export function getCurrentUser() {
  return isSupabaseConfigured ? cachedUser : mockGetCurrentUser()
}
export function isAuthenticated() { return !!getCurrentUser() }
export function getRole() { return getCurrentUser()?.role || ROLES.FAN }
export function isAdmin() { return ADMIN_ROLES.includes(getRole()) }

export function requiresEmailVerification(user) {
  if (!user) return false
  if (ADMIN_ROLES.includes(user.role)) return false
  return !user.isEmailVerified
}

// ── 이메일 인증 ──
// Supabase: 가입 시 확인 메일 발송(설정에 따름). 여기선 재발송을 시도한다.
export async function verifyEmail(email) {
  if (isSupabaseConfigured) {
    // 실제 인증은 메일 링크로 완료됨. 편의상 확인 메일 재발송을 시도.
    try { await supabase.auth.resend({ type: 'signup', email }) } catch { /* noop */ }
    return { ok: true }
  }
  return mockPatchUser(email, {
    isEmailVerified: true, emailVerifiedAt: new Date().toISOString(),
    verificationMethod: 'email', verificationStatus: VERIFICATION.EMAIL_VERIFIED,
  })
}

// 휴대폰 본인인증 — 구조만 준비(다음 단계).
export function verifyPhone(email) {
  if (isSupabaseConfigured) return { ok: true }
  return mockPatchUser(email, {
    isPhoneVerified: true, phoneVerifiedAt: new Date().toISOString(),
    verificationMethod: 'phone', verificationStatus: VERIFICATION.PHONE_VERIFIED,
  })
}

// 이메일 인증번호 발급 (Mock 전용 — Supabase 는 확인 메일을 사용).
export function issueEmailCode(email) {
  const q = (email || '').trim()
  if (!q) return { ok: false, error: '이메일을 입력해 주세요.' }
  if (isSupabaseConfigured) return { ok: true, code: null } // Supabase 모드에선 미사용
  const dup = readUsers().some(u => u.email.toLowerCase() === q.toLowerCase())
  if (dup) return { ok: false, error: '이미 가입된 이메일입니다.' }
  return { ok: true, code: String(Math.floor(100000 + Math.random() * 900000)) }
}

// ── 프로필 수정 ──
export async function updateAvatar(avatarUrl) {
  if (isSupabaseConfigured) {
    if (cachedUser) cachedUser = { ...cachedUser, avatarUrl } // 낙관적 반영
    return patchSupabaseProfile({ avatar_url: avatarUrl })
  }
  return mockPatchSessionUser({ avatarUrl })
}

export const NICKNAME_COOLDOWN_DAYS = 90 // 3개월에 1회
export function nicknameChangeInfo() {
  const u = getCurrentUser()
  if (!u) return { canChange: false, nextChangeAt: null }
  // Supabase: profiles.nickname_updated_at, Mock: lastNicknameChangeAt
  const last = isSupabaseConfigured ? u.nicknameUpdatedAt : u.lastNicknameChangeAt
  if (!last) return { canChange: true, nextChangeAt: null }
  const next = new Date(last).getTime() + NICKNAME_COOLDOWN_DAYS * 86400000
  return { canChange: Date.now() >= next, nextChangeAt: new Date(next).toISOString() }
}
export async function changeNickname(nickname) {
  const name = (nickname || '').trim()
  if (!name) return { ok: false, error: '닉네임을 입력해 주세요.' }
  const info = nicknameChangeInfo()
  if (!info.canChange)
    return { ok: false, error: '닉네임은 3개월에 한 번만 변경할 수 있습니다.', nextChangeAt: info.nextChangeAt }
  if (isSupabaseConfigured) {
    const now = new Date().toISOString()
    const res = await patchSupabaseProfile({ nickname: name, nickname_updated_at: now })
    if (res.ok && cachedUser) cachedUser = { ...cachedUser, nickname: name, nicknameUpdatedAt: now }
    return res
  }
  return mockPatchSessionUser({ nickname: name, lastNicknameChangeAt: new Date().toISOString() })
}

// ── 비밀번호 변경 ──
export async function changePassword(currentPassword, newPassword) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return { ok: false, error: translateAuthError(error) }
    return { ok: true }
  }
  const email = localStorage.getItem(SESSION_KEY)
  if (!email) return { ok: false, error: '로그인이 필요합니다.' }
  const users = readUsers()
  const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase())
  if (idx === -1) return { ok: false, error: '사용자를 찾을 수 없습니다.' }
  if (users[idx].password !== currentPassword) return { ok: false, error: '현재 비밀번호가 일치하지 않습니다.' }
  users[idx] = { ...users[idx], password: newPassword }; writeUsers(users)
  return { ok: true }
}

// ── 응원팀 저장 ──
export async function setSelectedTeam(teamId) {
  if (isSupabaseConfigured) {
    if (cachedUser) cachedUser = { ...cachedUser, selectedTeam: teamId } // 낙관적 반영
    await patchSupabaseProfile({ selected_team: teamId })
    return
  }
  const email = localStorage.getItem(SESSION_KEY)
  if (!email) return
  const users = readUsers()
  const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase())
  if (idx === -1) return
  users[idx].selectedTeam = teamId; writeUsers(users)
}

// ── 계정 복구 (아이디/비밀번호 찾기) ──
export function maskEmail(email) {
  if (!email || !email.includes('@')) return email || ''
  const [local, domain] = email.split('@')
  return `${local.slice(0, Math.min(3, local.length))}****@${domain}`
}
export async function findAccountByHint(hint) {
  const q = (hint || '').trim()
  if (!q) return { ok: false }
  if (isSupabaseConfigured) {
    // 서버 RPC(find_account_by_hint, SECURITY DEFINER)로 조회 → 클라이언트는
    // 전체 유저 목록을 읽지 않고, 마스킹된 이메일만 돌려받는다.
    const { data, error } = await supabase.rpc('find_account_by_hint', { hint: q })
    if (error || !data || data.length === 0) return { ok: false }
    return { ok: true, maskedEmail: data[0].masked_email }
  }
  const lc = q.toLowerCase()
  const user = readUsers().find(u =>
    u.nickname.toLowerCase().includes(lc) || u.email.toLowerCase().includes(lc))
  if (!user) return { ok: false }
  return { ok: true, maskedEmail: maskEmail(user.email) }
}
export async function requestPasswordReset(email) {
  const q = (email || '').trim()
  if (!q) return { ok: false }
  if (isSupabaseConfigured) {
    const { error } = await supabase.auth.resetPasswordForEmail(q, { redirectTo: window.location.origin })
    return { ok: !error }
  }
  return { ok: readUsers().some(u => u.email.toLowerCase() === q.toLowerCase()) }
}
