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
import { supabase, isSupabaseConfigured, isProdMisconfigured, setKeepSignedIn, getKeepSignedIn } from './supabase.js'
import { invokeFunction } from './edgeFunctions.js'
import { logger } from './logger.js'
import { getProvider, SUPABASE_PROVIDER_CONFIG } from './oauth.js'
import { sendWelcomeEmail } from './welcomeEmail.js'
import { validateNicknameFormat } from './nicknameValidation.js'

const USERS_KEY = 'fancluv_users'
const SESSION_KEY = 'fancluv_session' // (Mock) 현재 로그인한 사용자의 email

// 권한(Role) 체계 — 베타 역할: Fan / Club Account / Admin / Super Admin.
//   (staff = 운영 직원 = 관리자 계열 / club_admin = 구단 담당자 = Club Account 로 취급)
export const ROLES = {
  FAN: 'fan',
  ADMIN: 'admin',
  SUPER_ADMIN: 'superadmin', // 최상위 관리자
  STAFF: 'staff',            // FANCLUV 운영 직원(관리자 계열)
  CLUB_ADMIN: 'club_admin',  // 구단 담당자(= Club Account 로 취급, club 과 동일 권한)
  CLUB: 'club',              // B2B 구단 담당자(고객) — Admin 과 완전 분리, Executive Dashboard 전용
}
// 관리자 콘솔 접근 가능 역할(= Admin/Super Admin/Staff). club_admin 은 구단 계정이라 제외.
export const ADMIN_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.STAFF]
// 구단(고객) 계정 역할 — 관리자 권한과 완전 분리. 원본 팬 데이터 접근 불가, 자기 구단만.
export const CLUB_ROLES = [ROLES.CLUB, ROLES.CLUB_ADMIN]
// 이메일 인증 없이 로그인 가능한 역할(관리자/구단 계정은 운영자가 발급).
const NO_VERIFY_ROLES = [...ADMIN_ROLES, ...CLUB_ROLES]
// 이메일 형식 검증(간이). 회원가입/이메일 등록에서 공용으로 사용.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// 커스텀 OAuth(Supabase 네이티브 미사용) provider 설정.
//   · kakao: GoTrue 기본 scope 의 account_email 강제 포함(KOE205) 회피 목적. scope 를
//            profile_nickname 만 요청 → 비즈 앱 아니어도 이메일 없이 로그인 가능.
//   · naver: Supabase 기본 미지원.
// redirect_uri 는 각 콘솔에 등록된 Edge Function 콜백(functions/v1/<fn>)을 사용한다.
const CUSTOM_OAUTH = {
  kakao: {
    label: '카카오', fn: 'kakao-callback',
    clientEnv: 'VITE_KAKAO_CLIENT_ID', callbackEnv: 'VITE_KAKAO_CALLBACK_URL',
    authorize: 'https://kauth.kakao.com/oauth/authorize', scope: 'profile_nickname',
  },
  naver: {
    label: 'NAVER', fn: 'naver-callback',
    clientEnv: 'VITE_NAVER_CLIENT_ID', callbackEnv: 'VITE_NAVER_CALLBACK_URL',
    authorize: 'https://nid.naver.com/oauth2.0/authorize', scope: null,
  },
}

// DB profiles.role → 앱 role 매핑. 관리자 계열이 fan 으로 강등되지 않도록 명시적으로 매핑한다.
//   superadmin→Super Admin / staff→Staff(관리자) / admin→Admin /
//   club_admin→Club Account / club→Club Account / 그 외/미상→Fan
export function mapDbRole(dbRole) {
  switch (String(dbRole || '').toLowerCase()) {
    case 'superadmin': return ROLES.SUPER_ADMIN
    case 'staff': return ROLES.STAFF
    case 'admin': return ROLES.ADMIN
    case 'club_admin': return ROLES.CLUB_ADMIN
    case 'club': return ROLES.CLUB
    default: return ROLES.FAN
  }
}

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
    role: mapDbRole(p.role),
    clubId: p.club_id || p.selected_team || null,
    provider: p.provider || 'email',
    providerUserId: p.provider_user_id || null,
    nicknameUpdatedAt: p.nickname_updated_at || null,
    isEmailVerified: emailVerified,
    verificationStatus:
      p.verification_status ||
      (emailVerified ? VERIFICATION.EMAIL_VERIFIED : VERIFICATION.UNVERIFIED),
    // 본인인증(휴대폰 CI/DI) — 여부/시각/기관만 클라이언트로 매핑한다.
    // ⚠️ CI/DI 원문(identity_ci/identity_di)은 앱 사용자 객체에 담지 않는다(노출 최소화).
    identityVerified: !!p.identity_verified,
    identityVerifiedAt: p.identity_verified_at || null,
    identityProvider: p.identity_provider || null,
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
  // 탈퇴(비활성화)된 계정은 로그인 차단.
  if (profile?.deactivated_at) { cachedUser = null; await supabase.auth.signOut(); return null }
  cachedUser = mapSupabaseUser(authUser, profile)
  return cachedUser
}

// Supabase auth 에러를 사용자 친화 메시지로 변환.
function translateAuthError(error) {
  const msg = (error?.message || '').toLowerCase()
  if (msg.includes('invalid login')) return '이메일 또는 비밀번호가 올바르지 않습니다.'
  if (msg.includes('email not confirmed')) return '이메일 인증이 완료되지 않은 계정입니다.'
  if (msg.includes('already registered') || msg.includes('already exists')) return '이미 가입된 이메일입니다.'
  // 소셜 로그인 provider 가 Supabase 대시보드에서 아직 활성화되지 않은 경우.
  if (msg.includes('provider is not enabled') || msg.includes('unsupported provider'))
    return '이 소셜 로그인은 아직 활성화되지 않았습니다. 관리자에게 문의해 주세요. (Supabase Providers 설정 필요)'
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
  // password 는 물론, 본인인증 CI/DI 원문도 화면으로 내보내지 않는다(노출 최소화).
  const { password, identityCi, identityDi, ...rest } = u
  return rest
}
// (Mock) 세션 저장소도 "로그인 상태 유지" 정책을 따른다.
//   • keep = true  → localStorage  (브라우저 종료 후에도 유지)
//   • keep = false → sessionStorage (브라우저/탭 종료 시 자동 로그아웃)
// setSession 은 활성 저장소에 쓰고 반대편 잔재를 지운다. readMockSession 은 활성
// 저장소에서만 읽어 세션 로그인 시 브라우저 종료 → 자동 로그아웃을 강제한다.
function setSession(email) {
  const keep = getKeepSignedIn()
  const active = keep ? localStorage : sessionStorage
  const other = keep ? sessionStorage : localStorage
  try { other.removeItem(SESSION_KEY) } catch { /* noop */ }
  active.setItem(SESSION_KEY, email)
}
function readMockSession() {
  const active = getKeepSignedIn() ? localStorage : sessionStorage
  try { return active.getItem(SESSION_KEY) } catch { return null }
}

// OAuth 커스텀 로그인이 리다이렉트 전 sessionStorage 에 남기는 state nonce 키.
// 로그아웃 시 자동 로그인/OAuth 흔적을 남기지 않도록 함께 제거한다.
const OAUTH_STATE_KEYS = ['kakao_oauth_state', 'naver_oauth_state']
function clearAuthArtifacts() {
  // 세션/영구 양쪽 저장소의 로그인 흔적 + keep 플래그 + OAuth state 를 전부 제거.
  try { localStorage.removeItem(SESSION_KEY) } catch { /* noop */ }
  try { sessionStorage.removeItem(SESSION_KEY) } catch { /* noop */ }
  for (const k of OAUTH_STATE_KEYS) {
    try { sessionStorage.removeItem(k) } catch { /* noop */ }
    try { localStorage.removeItem(k) } catch { /* noop */ }
  }
  setKeepSignedIn(false) // 다음 로그인은 기본값(세션 로그인)으로 시작
}

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
  // B2B 구단(고객) 테스트 계정 — FC 서울 담당자. role=club, 자기 구단(seoul)만.
  let club = users.find(u => u.email === 'club.seoul@fancluv.kr')
  if (!club) {
    club = { nickname: 'FC 서울 담당자', email: 'club.seoul@fancluv.kr', password: 'club1234',
      joinedAt: '2025-02-01T00:00:00.000Z', selectedTeam: 'seoul', clubId: 'seoul', role: ROLES.CLUB }
    users.push(club); changed = true
  }
  for (const u of [fan, admin, club]) {
    if (u.verificationStatus == null) { Object.assign(u, seededEmailVerified(u.joinedAt)); changed = true }
    if (!('gender' in u)) { u.gender = null; changed = true }
    if (!('ageGroup' in u)) { u.ageGroup = u === fan ? '20' : null; changed = true }
    if (!('avatarUrl' in u)) { u.avatarUrl = null; changed = true }
    if (!('lastNicknameChangeAt' in u)) { u.lastNicknameChangeAt = null; changed = true }
    if (!('provider' in u)) { u.provider = null; changed = true }
    // 데모 계정은 본인인증 완료 상태로 시드(기존 데모 흐름이 깨지지 않도록).
    if (!('identityVerified' in u)) {
      u.identityVerified = true
      u.identityVerifiedAt = u.joinedAt
      u.identityProvider = 'mock'
      u.identityCi = `MOCKCI-seed-${u.email}`
      u.identityDi = `MOCKDI-seed-${u.email}`
      changed = true
    }
  }
  if (changed) writeUsers(users)
}
// 데모 계정(fan@fancluv.kr / admin@fancluv.kr / club.seoul@fancluv.kr)은
// **개발(DEV) Mock 모드에서만** 시드한다. → 프로덕션 빌드에서 Supabase 미설정 시에는
// 데모 관리자 자격증명이 절대 생성되지 않는다(보안). 프로덕션+미설정은 LoginPage 가
// "서비스 설정 미완료" 화면으로 로그인 자체를 차단한다(isProdMisconfigured).
if (!isSupabaseConfigured && import.meta.env.DEV) ensureSeed()

// 프로덕션에서 Supabase 미설정 시 Mock 인증을 방어적으로 차단(데모 계정도 미시드된 상태).
const SETUP_INCOMPLETE = { ok: false, error: '서비스 설정이 완료되지 않았습니다. 관리자에게 문의해 주세요.', code: 'setup_incomplete' }

function mockSignup({ nickname, email, password, gender = null, ageGroup = null }) {
  if (isProdMisconfigured) return SETUP_INCOMPLETE
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
    // 신규 가입은 본인인증 미완료 → /verify-identity 에서 완료해야 핵심 기능 사용 가능.
    identityVerified: false, identityVerifiedAt: null, identityProvider: null,
    identityCi: null, identityDi: null,
  }
  users.push(user); writeUsers(users); setSession(email)
  return { ok: true, user: publicUser(user) }
}
function mockLogin({ email, password }) {
  if (isProdMisconfigured) return SETUP_INCOMPLETE
  const users = readUsers()
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password)
  if (!user) return { ok: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }
  if (!NO_VERIFY_ROLES.includes(user.role) && !user.isEmailVerified)
    return { ok: false, error: '이메일 인증이 완료되지 않은 계정입니다.', code: 'unverified' }
  setSession(email)
  return { ok: true, user: publicUser(user) }
}
function mockLogout() { clearAuthArtifacts() }
function mockGetCurrentUser() {
  const email = readMockSession()
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
  const email = readMockSession()
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
      // 소셜 최초 가입도 본인인증 미완료 → 온보딩 후 /verify-identity 에서 완료.
      identityVerified: false, identityVerifiedAt: null, identityProvider: null,
      identityCi: null, identityDi: null,
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
  const name = (nickname || '').trim()
  // 닉네임 형식 검증 (예약어·금칙어·자음/모음·길이 등)
  const fe = nicknameFormatError(name)
  if (fe) return fe
  // 닉네임 중복 방지 (회원가입/온보딩/프로필수정 공통 규칙)
  if (await isNicknameTaken(name)) return { ok: false, error: '이미 사용 중인 닉네임입니다.', code: 'nickname_taken' }
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { nickname: name, gender, age_group: ageGroup, provider: 'email' } },
    })
    if (error) return { ok: false, error: translateAuthError(error) }
    // 회원가입 완료 흐름(0065):
    //   • 기본(권장): Auth 의 mailer_autoconfirm=ON → signUp 이 즉시 세션 발급.
    //     이메일 인증은 화면의 커스텀 인증번호(send-email-code)가 담당한다. 재확인 메일
    //     없음 → "메일을 확인하세요" 재노출 없음, 이메일 발송 rate limit 무관.
    //   • 방어: 만약 Confirm email(mailer_autoconfirm=OFF)이 켜져 있어 세션이 없으면,
    //     이미 코드로 인증된 이메일을 send-email-code 'confirm' 으로 서버측 확정한 뒤
    //     로그인해 세션을 확보한다(재확인 메일 dead-end 제거).
    // confirm 은 어느 경우든 호출해 email_codes 의 검증 표식 행을 소진(삭제)한다 → 잔재 없음.
    let needsConfirm = !data.session
    if (data.user?.id) {
      const confirmed = await confirmSignupEmail(email, data.user.id)
      if (needsConfirm && confirmed) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
        if (!signInErr) { await loadCurrentSupabaseUser(); needsConfirm = false }
      }
    }
    if (data.session) await loadCurrentSupabaseUser()
    sendWelcomeEmail(email, name)  // 환영 이메일(비차단, 실패해도 가입은 성공)
    return { ok: true, needsConfirm, user: cachedUser }
  }
  const res = mockSignup({ nickname: name, email, password, gender, ageGroup })
  if (res.ok) sendWelcomeEmail(email, name)  // Mock: 콘솔 로그 폴백
  return res
}

// 닉네임 형식 검증은 nicknameValidation.js 로 일원화(예약어·금칙어·길이 포함).
// 코드별 서버측 안내 문구(폼은 실시간으로 locale 메시지를 별도 표시한다).
const NICKNAME_ERR_MSG = {
  empty: '닉네임을 입력해 주세요.',
  too_short: '닉네임은 2자 이상 입력해 주세요.',
  has_space: '닉네임에는 공백을 사용할 수 없습니다.',
  has_jamo: '자음/모음 단독은 사용할 수 없습니다. 완성된 한글을 입력해 주세요.',
  invalid_char: '완성된 한글, 영문, 숫자만 사용할 수 있습니다.',
  too_long_ko: '닉네임은 한글 최대 8자까지 가능합니다.',
  too_long_en: '닉네임은 영문·숫자 최대 12자까지 가능합니다.',
  reserved: '사용할 수 없는 닉네임입니다.',
  banned: '부적절한 표현이 포함된 닉네임입니다.',
}
export const NICKNAME_INVALID_MSG = '닉네임은 완성된 한글, 영문, 숫자로 2자 이상 입력해 주세요.'
function nicknameFormatError(name) {
  const r = validateNicknameFormat(name)
  if (r.ok) return null
  return { ok: false, code: 'nickname_invalid', errCode: r.code, error: NICKNAME_ERR_MSG[r.code] || NICKNAME_INVALID_MSG }
}

// ── 닉네임 중복 확인 ── 본인(exceptId/exceptEmail)은 제외.
export async function isNicknameTaken(nickname, opts = {}) {
  const name = (nickname || '').trim()
  if (!name) return false
  if (isSupabaseConfigured) {
    let q = supabase.from('profiles').select('id').ilike('nickname', name)
    if (opts.exceptId) q = q.neq('id', opts.exceptId)
    const { data } = await q.limit(1)
    return !!(data && data.length)
  }
  const lc = name.toLowerCase()
  return readUsers().some(u =>
    u.nickname && u.nickname.toLowerCase() === lc &&
    (opts.exceptEmail ? u.email.toLowerCase() !== opts.exceptEmail.toLowerCase() : true))
}

// ── 온보딩 필요 여부 ── 소셜 신규 사용자(닉네임/나이대 미입력)만 대상. 관리자는 제외.
export function needsOnboarding(user) {
  if (!user) return false
  if (ADMIN_ROLES.includes(user.role)) return false
  return !user.nickname || !user.ageGroup
}

// ── 온보딩 완료 (닉네임/성별/나이대 저장) ──
export async function completeOnboarding({ nickname, gender = null, ageGroup = null }) {
  const name = (nickname || '').trim()
  if (!name) return { ok: false, error: '닉네임을 입력해 주세요.' }
  const fe = nicknameFormatError(name)
  if (fe) return fe
  if (!ageGroup) return { ok: false, error: '나이대를 선택해 주세요.' }
  const me = getCurrentUser()
  if (await isNicknameTaken(name, { exceptId: me?.id, exceptEmail: me?.email }))
    return { ok: false, error: '이미 사용 중인 닉네임입니다.', code: 'nickname_taken' }
  if (isSupabaseConfigured) {
    if (cachedUser) cachedUser = { ...cachedUser, nickname: name, gender, ageGroup }
    return patchSupabaseProfile({ nickname: name, gender, age_group: ageGroup })
  }
  return mockPatchSessionUser({ nickname: name, gender, ageGroup })
}

// ── 회원탈퇴 ── Supabase: 프로필 비활성화(deactivated_at) 후 로그아웃(로그인 차단).
//                Mock: 사용자 레코드 삭제 후 세션 제거.
export async function deleteAccount() {
  if (isSupabaseConfigured) {
    if (!cachedUser) return { ok: false, error: '로그인이 필요합니다.' }
    // 완전 삭제: delete-account Edge Function(service_role)이 auth.users 삭제.
    const { data, error } = await invokeFunction('delete-account')
    if (error || !data?.ok) {
      // 폴백: 완전 삭제 실패 시 최소한 비활성화(로그인 차단)라도 처리.
      await supabase.from('profiles').update({ deactivated_at: new Date().toISOString() }).eq('id', cachedUser.id)
    }
    cachedUser = null
    await supabase.auth.signOut()
    return { ok: true }
  }
  const email = readMockSession()
  if (email) writeUsers(readUsers().filter(u => u.email.toLowerCase() !== email.toLowerCase()))
  mockLogout()
  return { ok: true }
}

// ── 로그인 ──
// keep: "로그인 상태 유지" 체크 여부. true=영구 세션(localStorage),
//       false(기본)=세션 로그인(sessionStorage, 브라우저 종료 시 자동 로그아웃).
//       세션 저장 위치 결정을 위해 실제 로그인(signIn) 이전에 플래그를 설정한다.
export async function login({ email, password, keep = false }) {
  setKeepSignedIn(keep)
  if (isSupabaseConfigured) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      const code = (error.message || '').toLowerCase().includes('not confirmed') ? 'unverified' : undefined
      return { ok: false, error: translateAuthError(error), code }
    }
    const user = await loadCurrentSupabaseUser()
    if (!user) return { ok: false, error: '탈퇴했거나 사용할 수 없는 계정입니다.' }
    // 관리자 로그인은 보안 이벤트로 감사 기록(fire-and-forget, 실패해도 로그인 흐름 방해 안 함).
    if (ADMIN_ROLES.includes(user.role)) {
      supabase.rpc('log_security_event', { p_event: 'auth.admin_login', p_severity: 'info', p_detail: { email } }).then(({ error }) => {
        if (error) logger.warn('관리자 로그인 감사 기록 실패', { error })
      })
    }
    return { ok: true, user }
  }
  return mockLogin({ email, password })
}

// ── 로그아웃 ── 모든 토큰/세션/OAuth 흔적/자동 로그인 플래그를 제거한다.
export async function logout() {
  cachedUser = null // 가드가 즉시 반영되도록 동기 초기화
  if (isSupabaseConfigured) {
    // signOut 이 hybridStorage.removeItem 으로 활성 세션 토큰을 지우고,
    // clearAuthArtifacts 가 남은 저장소/OAuth state/keep 플래그까지 정리한다.
    try { await supabase.auth.signOut() } catch { /* noop */ }
    clearAuthArtifacts()
    return
  }
  mockLogout()
}

// ── 소셜 로그인 (Google = Supabase OAuth / Kakao·NAVER = 인터페이스 유지) ──
export async function socialLogin(providerId, keep = false) {
  // OAuth 도 이메일 로그인과 동일 정책: keep=false 면 세션 로그인(브라우저 종료 시
  // 자동 로그아웃). keep 플래그는 리다이렉트를 넘어 살아남도록 localStorage 에 둔다.
  setKeepSignedIn(keep)
  if (isSupabaseConfigured) {
    const cfg = SUPABASE_PROVIDER_CONFIG[providerId]
    if (!cfg) return { ok: false, error: '지원하지 않는 로그인 방식입니다.' }

    // Google · Kakao — Supabase 기본 지원 provider.
    if (cfg.native) {
      const options = { redirectTo: `${window.location.origin}/auth/callback` }
      // Kakao 등 provider 별 scope 재정의(비즈 앱 아닌 Kakao 는 account_email 제외).
      if (cfg.scopes) options.scopes = cfg.scopes
      const { error } = await supabase.auth.signInWithOAuth({ provider: cfg.supabaseProvider, options })
      if (error) return { ok: false, error: translateAuthError(error) }
      return { ok: true, redirecting: true } // 브라우저가 provider 로 리다이렉트됨
    }

    // Kakao · NAVER — Supabase 미지원/부적합 → 커스텀 OAuth authorize 로 리다이렉트.
    // 콜백(code→token→프로필→세션)은 Edge Function(kakao-callback/naver-callback)이 처리.
    if (cfg.custom) {
      const c = CUSTOM_OAUTH[cfg.custom]
      const clientId = import.meta.env[c.clientEnv]
      if (!clientId || String(clientId).includes('your-')) {
        return { ok: false, error: `${c.label} 로그인 설정이 필요합니다. OAUTH_SETUP.md 를 참고해 주세요.` }
      }
      // redirect_uri 는 반드시 콘솔에 등록된 Supabase Edge Function 콜백이어야 한다(앱 주소 아님).
      const supaUrl = import.meta.env.VITE_SUPABASE_URL || ''
      const redirectUri = import.meta.env[c.callbackEnv]
        || (supaUrl ? `${supaUrl}/functions/v1/${c.fn}` : `${window.location.origin}/auth/callback`)
      // state 에 nonce + 앱 복귀 주소(origin)를 담아 콜백이 로그인 후 앱으로 되돌린다.
      const nonce = Math.random().toString(36).slice(2)
      const state = btoa(JSON.stringify({ n: nonce, r: window.location.origin }))
      try { sessionStorage.setItem(`${cfg.custom}_oauth_state`, nonce) } catch { /* noop */ }
      let authorizeUrl =
        `${c.authorize}?response_type=code` +
        `&client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${encodeURIComponent(state)}`
      if (c.scope) authorizeUrl += `&scope=${encodeURIComponent(c.scope)}`
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
// B2B 구단(고객) 계정 여부 — Executive Dashboard 전용, 관리자와 완전 분리.
export function isClub() { return CLUB_ROLES.includes(getRole()) }
// 구단 계정이 담당하는 구단 id(자기 구단만 조회 가능).
export function getClubId() { const u = getCurrentUser(); return u?.clubId || u?.selectedTeam || null }

export function requiresEmailVerification(user) {
  if (!user) return false
  if (NO_VERIFY_ROLES.includes(user.role)) return false
  return !user.isEmailVerified
}

// ── 이메일 인증(확인 메일 재전송) ──
// 실제 인증은 사용자가 받은 메일의 링크로만 완료된다(앱 내 우회 완료 없음).
// Supabase: 확인 메일 재발송을 시도. Mock(백엔드 미설정): 재전송 불가 → 실패 반환
//   (임의로 isEmailVerified 를 true 로 바꾸는 우회 처리 제거).
export async function verifyEmail(email) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    if (error) return { ok: false, error: '인증 메일을 다시 보내지 못했습니다. 잠시 후 다시 시도해 주세요.' }
    return { ok: true }
  }
  return { ok: false, error: '이메일 인증을 완료할 수 없습니다.' }
}

// 휴대폰 본인인증 — 구조만 준비(다음 단계).
export function verifyPhone(email) {
  if (isSupabaseConfigured) return { ok: true }
  return mockPatchUser(email, {
    isPhoneVerified: true, phoneVerifiedAt: new Date().toISOString(),
    verificationMethod: 'phone', verificationStatus: VERIFICATION.PHONE_VERIFIED,
  })
}

// ════════════════════════════════════════════════════════════════════════
//  본인인증 (PASS / NICE / KCB — CI/DI). Provider 구조: src/lib/identity/
// ════════════════════════════════════════════════════════════════════════

// 실제 본인인증 업체(PASS/NICE/KCB)가 설정된 경우에만 휴대폰 본인인증을 강제한다.
// 미설정(mock/미지정) = 베타는 **이메일 인증 기준**으로 운영 → 본인인증 단계/게이팅/버튼을 노출하지 않는다.
const REAL_IDENTITY_VENDORS = ['pass', 'nice', 'kcb']
const IDENTITY_ACTIVE = REAL_IDENTITY_VENDORS.includes(String(import.meta.env.VITE_IDENTITY_PROVIDER || '').toLowerCase())
// 화면에서 본인인증 UI 노출 여부 판단용.
export function isIdentityVerificationEnabled() { return IDENTITY_ACTIVE }

// 본인인증 완료 여부. 실 업체 미설정 시(베타 이메일 인증) 또는 관리자/구단 계정은 true 취급.
export function isIdentityVerified(user = getCurrentUser()) {
  if (!user) return false
  if (!IDENTITY_ACTIVE) return true
  if (NO_VERIFY_ROLES.includes(user.role)) return true
  return !!user.identityVerified
}

// 핵심 기능(설문·의견·댓글) 사용 전 본인인증이 필요한지.
// 실 업체 미설정(베타 이메일 인증)이면 항상 false → 이메일 인증만으로 이용 가능.
export function requiresIdentityVerification(user = getCurrentUser()) {
  if (!IDENTITY_ACTIVE) return false
  if (!user) return false
  if (NO_VERIFY_ROLES.includes(user.role)) return false
  return !user.identityVerified
}

// 설정/화면 표시용 본인인증 상태(개인정보 없이 여부/시각/기관만).
export function identityInfo(user = getCurrentUser()) {
  return {
    verified: isIdentityVerified(user),
    verifiedAt: user?.identityVerifiedAt || null,
    agency: user?.identityProvider || null,
  }
}

// Mock 모드: localStorage 에 본인인증 결과 저장(+ 동일 CI 중복가입 방지).
function mockClaimIdentity({ agency, ci, di }) {
  const email = readMockSession()
  if (!email) return { ok: false, error: '로그인이 필요합니다.' }
  const users = readUsers()
  const meIdx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase())
  if (meIdx === -1) return { ok: false, error: '사용자를 찾을 수 없습니다.' }
  // 동일 CI 는 하나의 계정만(중복가입 방지).
  if (ci && users.some((u, i) => i !== meIdx && u.identityCi === ci))
    return { ok: false, code: 'duplicate', error: '이미 다른 계정에서 본인인증된 정보입니다.' }
  const now = new Date().toISOString()
  users[meIdx] = {
    ...users[meIdx],
    identityVerified: true, identityVerifiedAt: now, identityProvider: agency || 'mock',
    identityCi: ci || null, identityDi: di || null,
    // 본인인증 완료는 휴대폰 인증 완료로 간주(기존 VERIFICATION 체계와 매핑).
    isPhoneVerified: true, phoneVerifiedAt: now,
    verificationMethod: 'phone', verificationStatus: VERIFICATION.PHONE_VERIFIED,
  }
  writeUsers(users)
  return { ok: true, user: publicUser(users[meIdx]) }
}

// 본인인증 결과 저장(facade). Provider verify() 결과를 그대로 넘긴다.
//   • 실 Provider(serverWritten): Edge Function 이 이미 profiles 에 CI/DI 저장 →
//     세션 프로필만 재로드해 최신 상태 반영.
//   • Mock Provider(ci/di 보유): Supabase 는 RPC claim_identity(중복확인·저장, CI 비교는
//     서버에서), Mock 모드는 localStorage 에 저장.
export async function completeIdentityVerification(result) {
  if (!result || result.ok === false) {
    return { ok: false, code: result?.code || 'failed', error: result?.error || '본인인증에 실패했습니다.' }
  }
  const { agency, ci, di, serverWritten } = result
  if (isSupabaseConfigured) {
    if (!cachedUser) return { ok: false, error: '로그인이 필요합니다.' }
    if (serverWritten) {
      await loadCurrentSupabaseUser()
      return cachedUser?.identityVerified
        ? { ok: true }
        : { ok: false, error: '본인인증 상태를 확인하지 못했습니다.' }
    }
    // Mock Provider + Supabase: CI/DI 를 서버 RPC 로 저장(중복확인 포함, CI 비교는 서버).
    const { data, error } = await supabase.rpc('claim_identity', {
      p_ci: ci, p_di: di, p_agency: agency || 'mock',
    })
    if (error) return { ok: false, error: '본인인증 저장에 실패했습니다.' }
    if (!data?.ok) {
      return { ok: false, code: data?.code || 'failed',
        error: data?.code === 'duplicate' ? '이미 다른 계정에서 본인인증된 정보입니다.' : '본인인증에 실패했습니다.' }
    }
    await loadCurrentSupabaseUser()
    return { ok: true }
  }
  return mockClaimIdentity({ agency, ci, di })
}

// 사용자에게 보이는 안전 문구(내부 사유·공급자 응답·코드값은 절대 노출하지 않는다).
const EMAIL_SEND_FAIL_MSG = '인증번호를 전송하지 못했습니다. 이메일 주소를 확인한 후 다시 시도해 주세요.'
// 검증 실패 사유별 안전 문구.
function verifyErrMsg(reason) {
  switch (reason) {
    case 'expired': return '인증번호가 만료되었습니다. 다시 요청해 주세요.'
    case 'too_many_attempts': return '인증 시도가 많습니다. 인증번호를 다시 요청해 주세요.'
    case 'consumed': return '이미 사용된 인증번호입니다. 다시 요청해 주세요.'
    default: return '인증번호가 올바르지 않습니다.'
  }
}

// 이메일 인증번호 발급 — 실제 이메일 발송 성공이 전제.
// 서버(send-email-code Edge)가 이메일 형식 검증 → 발송 공급자(RESEND) 발송 성공 → OTP 해시
// 저장까지 마쳐야 ok. 코드값은 절대 반환하지 않는다(화면/로그 노출 금지). 공급자 미설정/발송
// 실패 시 인증 진행 불가(Mock·로컬 코드 폴백 없음). Mock 모드(백엔드 미설정)도 발송 불가로 차단.
export async function issueEmailCode(email) {
  const q = (email || '').trim()
  if (!q) return { ok: false, code: 'empty', error: '이메일을 입력해 주세요.' }
  if (!isSupabaseConfigured) {
    // 백엔드(발송 공급자) 미설정 → 인증번호를 보낼 수 없다. 로컬 코드 발급/우회 금지.
    logger.error('[email-code] 발송 불가: 공급자 미설정(mock mode)')
    return { ok: false, code: 'provider_unconfigured', error: EMAIL_SEND_FAIL_MSG }
  }
  const { data: exists } = await supabase.from('profiles').select('id').ilike('email', q).limit(1)
  if (exists && exists.length) return { ok: false, code: 'duplicate', error: '이미 가입된 이메일입니다.' }
  const { data, error } = await invokeFunction('send-email-code', { body: { action: 'send', email: q } })
  if (error || !data?.ok) {
    // 내부 사유(email_provider_unconfigured/email_send_failed/invalid_email 등)는 서버 로그에만
    // 남긴다(시크릿·공급자 응답 미노출). 사용자에겐 안전 문구만.
    const reason = data?.error || error?.message || 'unknown'
    logger.error('[email-code] 발송 실패', { context: { reason } })
    return { ok: false, code: data?.error || 'send_failed', error: EMAIL_SEND_FAIL_MSG }
  }
  return { ok: true, sent: true } // 코드 미반환
}

// 이메일 인증번호 확인 — 서버(Edge)에서 입력값을 해시해 비교한다. 클라이언트 로컬 비교/우회 없음.
// Mock 모드(백엔드 미설정)는 검증 자체가 불가하므로 성공 처리하지 않는다(임의 코드 성공 금지).
export async function confirmEmailCode(email, code) {
  const q = (email || '').trim()
  if (!isSupabaseConfigured) {
    return { ok: false, code: 'provider_unconfigured', error: '이메일 인증을 완료할 수 없습니다.' }
  }
  const { data, error } = await invokeFunction('send-email-code', {
    body: { action: 'verify', email: q, code: (code || '').trim() },
  })
  if (error || !data?.ok) {
    const reason = data?.error || 'mismatch'
    return { ok: false, code: reason, error: verifyErrMsg(reason) }
  }
  return { ok: true }
}

// 회원가입 직후 서버측 이메일 확정. 화면에서 커스텀 인증번호로 이미 이메일을
// 인증(verify)했음을 send-email-code 가 verified_at 표식으로 알고 있으므로, 그 표식과
// userId↔email 소유 일치를 확인해 auth 사용자 이메일을 확정한다. 실패해도(예: 코드
// 미검증) false 만 돌려주고, signup() 은 기존 "메일 확인" 폴백으로 자연스럽게 진행된다.
async function confirmSignupEmail(email, userId) {
  try {
    const { data, error } = await invokeFunction('send-email-code', {
      body: { action: 'confirm', email: (email || '').trim(), userId },
    })
    return !error && data?.ok === true
  } catch { return false }
}

// ── 이메일 미제공 소셜 계정: 나중에 이메일 등록/연결 ──
// 인증번호(issueEmailCode/confirmEmailCode)로 이메일 소유를 검증한 뒤, RPC
// claim_profile_email 로 중복 확인 + profiles.email 갱신을 원자적으로 처리한다.
// 반환: { ok } | { ok:false, code:'duplicate'|'invalid'|..., error }
export async function attachEmail(email, code) {
  const q = (email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(q)) return { ok: false, code: 'invalid', error: '올바른 이메일 형식이 아닙니다.' }

  if (!isSupabaseConfigured) {
    // Mock: 로컬 세션 사용자에 이메일만 반영.
    const r = mockPatchSessionUser({ email: q, isEmailVerified: true })
    return r.ok ? { ok: true } : r
  }

  // 1) 인증번호 검증(이메일 소유 확인)
  const vr = await confirmEmailCode(q, code)
  if (!vr.ok) return { ok: false, code: 'code', error: vr.error || '인증번호가 올바르지 않습니다.' }

  // 2) 중복 확인 + profiles.email 갱신(SECURITY DEFINER RPC)
  const { data, error } = await supabase.rpc('claim_profile_email', { p_email: q })
  if (error) return { ok: false, error: error.message }
  if (!data?.ok) {
    if (data?.code === 'duplicate') return { ok: false, code: 'duplicate', error: '이미 다른 계정에서 사용 중인 이메일입니다.' }
    return { ok: false, code: data?.code || 'failed', error: '이메일 등록에 실패했습니다. 다시 시도해 주세요.' }
  }

  // 3) 캐시 갱신 + auth.users 이메일 동기(확인 메일 흐름은 선택 — 실패해도 무시)
  if (cachedUser) cachedUser = { ...cachedUser, email: q, isEmailVerified: true }
  try { await supabase.auth.updateUser({ email: q }) } catch { /* Secure email change 설정 시 확인 메일 발송 — 표시 이메일은 이미 반영됨 */ }
  return { ok: true }
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
  const fe = nicknameFormatError(name)
  if (fe) return fe
  const info = nicknameChangeInfo()
  if (!info.canChange)
    return { ok: false, error: '닉네임은 90일마다 변경할 수 있습니다.', nextChangeAt: info.nextChangeAt }
  const me = getCurrentUser()
  if (await isNicknameTaken(name, { exceptId: me?.id, exceptEmail: me?.email }))
    return { ok: false, error: '이미 사용 중인 닉네임입니다.', code: 'nickname_taken' }
  if (isSupabaseConfigured) {
    const now = new Date().toISOString()
    const res = await patchSupabaseProfile({ nickname: name, nickname_updated_at: now })
    if (res.ok && cachedUser) cachedUser = { ...cachedUser, nickname: name, nicknameUpdatedAt: now }
    return res
  }
  return mockPatchSessionUser({ nickname: name, lastNicknameChangeAt: new Date().toISOString() })
}

// ── 나이대 변경 ── 닉네임 90일 쿨다운과 무관하게 언제든 수정 가능(설정 화면).
export async function changeAgeGroup(ageGroup) {
  const ag = (ageGroup || '').trim()
  if (!ag) return { ok: false, error: '나이대를 선택해 주세요.' }
  if (isSupabaseConfigured) {
    if (cachedUser) cachedUser = { ...cachedUser, ageGroup: ag } // 낙관적 반영
    return patchSupabaseProfile({ age_group: ag })
  }
  return mockPatchSessionUser({ ageGroup: ag })
}

// ── 성별 변경 ── 선택 항목(빈 값 허용 = '미설정'). 닉네임 쿨다운과 무관.
export async function changeGender(gender) {
  const g = gender || null // 'male' | 'female' | 'na' | null
  if (isSupabaseConfigured) {
    if (cachedUser) cachedUser = { ...cachedUser, gender: g } // 낙관적 반영
    return patchSupabaseProfile({ gender: g })
  }
  return mockPatchSessionUser({ gender: g })
}

// ── 비밀번호 변경 ──
export async function changePassword(currentPassword, newPassword) {
  if (isSupabaseConfigured) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return { ok: false, error: translateAuthError(error) }
    return { ok: true }
  }
  const email = readMockSession()
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
  const email = readMockSession()
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
    // 재설정 링크는 새 비밀번호 입력 화면(/reset-password)으로 돌려보낸다.
    const { error } = await supabase.auth.resetPasswordForEmail(q, { redirectTo: `${window.location.origin}/reset-password` })
    return { ok: !error }
  }
  return { ok: readUsers().some(u => u.email.toLowerCase() === q.toLowerCase()) }
}

// ── 비밀번호 재설정 완료 ── 재설정 메일 링크로 들어온 복구(recovery) 세션에서
//    새 비밀번호를 저장한다. (현재 비밀번호 없이 — 복구 세션이 인증을 대신함)
export async function completePasswordReset(newPassword) {
  if (!newPassword || newPassword.length < 4) return { ok: false, error: '비밀번호는 4자 이상이어야 합니다.' }
  if (isSupabaseConfigured) {
    // 복구 링크가 심어준 세션이 있어야 성공한다(없으면 링크 만료/무효).
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { ok: false, error: '재설정 링크가 만료되었거나 유효하지 않습니다. 다시 요청해 주세요.', code: 'no_session' }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return { ok: false, error: translateAuthError(error) }
    return { ok: true }
  }
  // Mock: 복구 링크 흐름이 없으므로 현재 세션 사용자의 비밀번호를 갱신.
  return mockPatchSessionUser({ password: newPassword })
}
