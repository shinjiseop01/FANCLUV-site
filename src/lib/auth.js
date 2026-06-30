// FANCLUV — MVP mock authentication (localStorage based).
//
// ⚠️ 실서비스에서는 Supabase Auth로 교체 필요.
//    - 비밀번호 평문 저장 금지 (여기서는 MVP Mock 단계라 임시 저장)
//    - 사용자/세션은 서버·Supabase가 관리해야 함
//
// 인증 관련 로직을 이 한 파일로 분리해 두었으므로, Supabase 도입 시
// 아래 함수들의 내부 구현만 교체하면 화면 코드는 그대로 사용할 수 있습니다.

const USERS_KEY = 'fancluv_users'
const SESSION_KEY = 'fancluv_session' // 현재 로그인한 사용자의 email 을 저장

// 권한(Role) 체계 — 향후 Super Admin / FANCLUV 직원 / 구단 관리자 확장을 대비해
// 역할을 사용자 객체의 `role` 필드로 관리한다. 관리자 콘솔 접근이 가능한 역할을
// ADMIN_ROLES 한 곳에서 관리하므로, 역할 추가 시 이 배열만 확장하면 된다.
export const ROLES = {
  FAN: 'fan',
  ADMIN: 'admin',
  SUPER_ADMIN: 'superadmin', // 예정
  STAFF: 'staff',            // 예정 (FANCLUV 직원)
  CLUB_ADMIN: 'club_admin',  // 예정 (구단 관리자)
}
export const ADMIN_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.STAFF, ROLES.CLUB_ADMIN]

// 본인인증(Verification) 체계 — MVP는 이메일 Mock 인증만 동작한다.
// 데이터 구조는 향후 Supabase Auth + 휴대폰 본인인증(PASS/NICE/KCB)을 그대로
// 얹을 수 있도록 미리 준비한다. 인증 흐름은 verificationStatus 한 곳으로 표현하고,
// 세부 플래그(isEmailVerified / isPhoneVerified + *At 타임스탬프)를 함께 보관한다.
export const VERIFICATION = {
  UNVERIFIED: 'unverified',
  EMAIL_VERIFIED: 'email_verified',
  PHONE_VERIFIED: 'phone_verified',
}

// 신규 사용자의 기본 인증 필드.
function defaultVerification() {
  return {
    isEmailVerified: false,
    emailVerifiedAt: null,
    isPhoneVerified: false,
    phoneVerifiedAt: null,
    verificationMethod: 'none',         // 'none' | 'email' | 'phone'
    verificationStatus: VERIFICATION.UNVERIFIED,
  }
}

// 데모 시드 계정용 — 이미 이메일 인증을 마친 상태.
function seededEmailVerified(at) {
  return {
    isEmailVerified: true,
    emailVerifiedAt: at,
    isPhoneVerified: false,
    phoneVerifiedAt: null,
    verificationMethod: 'email',
    verificationStatus: VERIFICATION.EMAIL_VERIFIED,
  }
}

function readUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || []
  } catch {
    return []
  }
}

function writeUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

// 비밀번호를 제외한 안전한 사용자 정보
function publicUser(u) {
  if (!u) return null
  const { password, ...rest } = u
  return rest
}

function setSession(email) {
  localStorage.setItem(SESSION_KEY, email)
}

// 기존에 안내하던 데모 계정을 한 번 시드해, 가입 없이도 둘러볼 수 있게 함.
// (실서비스 전환 시 제거)
function ensureSeed() {
  const users = readUsers()
  let changed = false

  let fan = users.find(u => u.email === 'fan@fancluv.kr')
  if (!fan) {
    fan = {
      nickname: '민준',
      email: 'fan@fancluv.kr',
      password: '1234', // 평문 — 실서비스에서는 Supabase Auth로 교체 필요
      joinedAt: '2025-03-14T00:00:00.000Z',
      selectedTeam: null,
      role: ROLES.FAN,
    }
    users.push(fan)
    changed = true
  }
  // FANCLUV 운영자(Admin) 데모 계정
  let admin = users.find(u => u.email === 'admin@fancluv.kr')
  if (!admin) {
    admin = {
      nickname: 'FANCLUV 운영자',
      email: 'admin@fancluv.kr',
      password: 'admin123', // 평문 — 데모용. 실서비스에서는 Supabase Auth + 권한 관리로 교체
      joinedAt: '2025-01-01T00:00:00.000Z',
      selectedTeam: null,
      role: ROLES.ADMIN,
    }
    users.push(admin)
    changed = true
  }
  // 데모 계정 backfill — 이메일 인증 완료 상태 + 신규 프로필 필드 보강.
  for (const u of [fan, admin]) {
    if (u.verificationStatus == null) {
      Object.assign(u, seededEmailVerified(u.joinedAt))
      changed = true
    }
    if (!('gender' in u)) { u.gender = null; changed = true }
    if (!('ageGroup' in u)) { u.ageGroup = u === fan ? '20' : null; changed = true }
    if (!('avatarUrl' in u)) { u.avatarUrl = null; changed = true }
    if (!('lastNicknameChangeAt' in u)) { u.lastNicknameChangeAt = null; changed = true }
  }

  if (changed) writeUsers(users)
}
ensureSeed()

// ── 회원가입 ──
// 이메일 인증번호 확인 후 호출되므로, 가입 시점에 이미 이메일 인증을 마친 것으로 본다.
export function signup({ nickname, email, password, gender = null, ageGroup = null }) {
  const users = readUsers()
  const dup = users.find(u => u.email.toLowerCase() === email.toLowerCase())
  if (dup) return { ok: false, error: '이미 가입된 이메일입니다.' }

  const now = new Date().toISOString()
  const user = {
    nickname,
    email,
    password, // 평문 저장 — 실서비스에서는 Supabase Auth로 교체 필요
    gender,            // 'male' | 'female' | 'na' | null
    ageGroup,          // '10' | '20' | '30' | '40' | '50+'
    avatarUrl: null,   // 프로필 이미지 (data URL)
    lastNicknameChangeAt: null, // 닉네임 변경 제한(90일) 기준
    joinedAt: now,
    selectedTeam: null,
    role: ROLES.FAN,
    ...seededEmailVerified(now), // 인증번호 확인을 거쳤으므로 이메일 인증 완료 상태
  }
  users.push(user)
  writeUsers(users)
  setSession(email) // 가입 직후 자동 로그인
  return { ok: true, user: publicUser(user) }
}

// ── 로그인 ──
export function login({ email, password }) {
  const users = readUsers()
  const user = users.find(
    u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  )
  if (!user) return { ok: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' }
  // 이메일 미인증 계정은 로그인 차단(관리자는 예외).
  if (!ADMIN_ROLES.includes(user.role) && !user.isEmailVerified) {
    return { ok: false, error: '이메일 인증이 완료되지 않은 계정입니다.', code: 'unverified' }
  }
  setSession(email)
  return { ok: true, user: publicUser(user) }
}

// ── 로그아웃 ──
export function logout() {
  localStorage.removeItem(SESSION_KEY)
}

// ── 현재 로그인 사용자 (새로고침 후에도 유지) ──
export function getCurrentUser() {
  const email = localStorage.getItem(SESSION_KEY)
  if (!email) return null
  const user = readUsers().find(u => u.email.toLowerCase() === email.toLowerCase())
  return publicUser(user)
}

export function isAuthenticated() {
  return !!getCurrentUser()
}

// 현재 로그인 사용자의 역할 (없으면 fan 으로 간주)
export function getRole() {
  return getCurrentUser()?.role || ROLES.FAN
}

// 관리자 콘솔 접근 권한 여부 (ADMIN_ROLES 기준)
export function isAdmin() {
  return ADMIN_ROLES.includes(getRole())
}

// ── 본인인증 (Mock) ──
// 관리자(ADMIN_ROLES)는 인증 없이 통과시킨다. 일반 사용자는 이메일 인증 필요.
export function requiresEmailVerification(user) {
  if (!user) return false
  if (ADMIN_ROLES.includes(user.role)) return false
  return !user.isEmailVerified
}

function patchUser(email, patch) {
  const users = readUsers()
  const idx = users.findIndex(u => u.email.toLowerCase() === (email || '').toLowerCase())
  if (idx === -1) return { ok: false }
  users[idx] = { ...users[idx], ...patch }
  writeUsers(users)
  return { ok: true, user: publicUser(users[idx]) }
}

// 이메일 인증 완료 처리 (Mock — 실제 메일 발송/검증 없음).
// 실서비스: Supabase 이메일 인증 콜백에서 이 상태를 갱신.
export function verifyEmail(email) {
  return patchUser(email, {
    isEmailVerified: true,
    emailVerifiedAt: new Date().toISOString(),
    verificationMethod: 'email',
    verificationStatus: VERIFICATION.EMAIL_VERIFIED,
  })
}

// 휴대폰 본인인증 완료 처리 — 구조만 준비(현재 UI 미연결, 정식 서비스 예정).
// 실서비스: PASS/NICE/KCB 콜백에서 이 상태를 갱신.
export function verifyPhone(email) {
  return patchUser(email, {
    isPhoneVerified: true,
    phoneVerifiedAt: new Date().toISOString(),
    verificationMethod: 'phone',
    verificationStatus: VERIFICATION.PHONE_VERIFIED,
  })
}

// 이메일 인증번호 발급 (Mock) — 실제 메일 발송 대신 6자리 코드를 만들어 반환한다.
// 실서비스: 서버가 코드를 발송/검증하고 클라이언트에는 노출하지 않는다.
export function issueEmailCode(email) {
  const q = (email || '').trim()
  if (!q) return { ok: false, error: '이메일을 입력해 주세요.' }
  const dup = readUsers().some(u => u.email.toLowerCase() === q.toLowerCase())
  if (dup) return { ok: false, error: '이미 가입된 이메일입니다.' }
  const code = String(Math.floor(100000 + Math.random() * 900000))
  return { ok: true, code }
}

// 세션 사용자에 부분 업데이트
function patchSessionUser(patch) {
  const email = localStorage.getItem(SESSION_KEY)
  if (!email) return { ok: false, error: '로그인이 필요합니다.' }
  return patchUser(email, patch)
}

// ── 프로필 수정 ──
// 프로필 이미지 변경 (data URL 저장)
export function updateAvatar(avatarUrl) {
  return patchSessionUser({ avatarUrl })
}

// 닉네임 변경 제한: 90일에 1회
export const NICKNAME_COOLDOWN_DAYS = 90
export function nicknameChangeInfo() {
  const u = getCurrentUser()
  if (!u) return { canChange: false, nextChangeAt: null }
  if (!u.lastNicknameChangeAt) return { canChange: true, nextChangeAt: null }
  const next = new Date(u.lastNicknameChangeAt).getTime() + NICKNAME_COOLDOWN_DAYS * 86400000
  return { canChange: Date.now() >= next, nextChangeAt: new Date(next).toISOString() }
}
export function changeNickname(nickname) {
  const name = (nickname || '').trim()
  if (!name) return { ok: false, error: '닉네임을 입력해 주세요.' }
  const info = nicknameChangeInfo()
  if (!info.canChange) return { ok: false, error: '닉네임은 90일에 한 번만 변경할 수 있습니다.', nextChangeAt: info.nextChangeAt }
  return patchSessionUser({ nickname: name, lastNicknameChangeAt: new Date().toISOString() })
}

// ── 비밀번호 변경 ──
export function changePassword(currentPassword, newPassword) {
  const email = localStorage.getItem(SESSION_KEY)
  if (!email) return { ok: false, error: '로그인이 필요합니다.' }
  const users = readUsers()
  const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase())
  if (idx === -1) return { ok: false, error: '사용자를 찾을 수 없습니다.' }
  if (users[idx].password !== currentPassword) return { ok: false, error: '현재 비밀번호가 일치하지 않습니다.' }
  users[idx] = { ...users[idx], password: newPassword }
  writeUsers(users)
  return { ok: true }
}

// ── 응원팀 저장 (팀 선택 시) ──
export function setSelectedTeam(teamId) {
  const email = localStorage.getItem(SESSION_KEY)
  if (!email) return
  const users = readUsers()
  const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase())
  if (idx === -1) return
  users[idx].selectedTeam = teamId
  writeUsers(users)
}

// ── 계정 복구 (아이디 찾기 / 비밀번호 찾기) ──
// 모두 Mock 단계이며, Supabase 도입 시 내부 구현만 교체하면 화면 코드는 유지됩니다.
//   - findAccountByHint  → Supabase: 서버 측 조회 후 마스킹된 이메일 응답
//   - requestPasswordReset → Supabase: supabase.auth.resetPasswordForEmail(email)

// 이메일 마스킹: 로컬파트 앞 3글자만 노출. 예) fan@fancluv.kr → fan****@fancluv.kr
export function maskEmail(email) {
  if (!email || !email.includes('@')) return email || ''
  const [local, domain] = email.split('@')
  const visible = local.slice(0, Math.min(3, local.length))
  return `${visible}****@${domain}`
}

// 닉네임(전체/부분) 또는 가입 이메일 일부로 계정을 찾아 마스킹된 이메일을 반환.
export function findAccountByHint(hint) {
  const q = (hint || '').trim().toLowerCase()
  if (!q) return { ok: false }
  const user = readUsers().find(u =>
    u.nickname.toLowerCase().includes(q) ||
    u.email.toLowerCase().includes(q),
  )
  if (!user) return { ok: false }
  return { ok: true, maskedEmail: maskEmail(user.email) }
}

// 비밀번호 재설정 요청 (Mock — 실제 메일 발송 없음).
export function requestPasswordReset(email) {
  const q = (email || '').trim().toLowerCase()
  if (!q) return { ok: false }
  const exists = readUsers().some(u => u.email.toLowerCase() === q)
  return { ok: exists }
}
