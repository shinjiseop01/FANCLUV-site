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
  if (!users.some(u => u.email === 'fan@fancluv.kr')) {
    users.push({
      nickname: '민준',
      email: 'fan@fancluv.kr',
      password: '1234', // 평문 — 실서비스에서는 Supabase Auth로 교체 필요
      joinedAt: '2025-03-14T00:00:00.000Z',
      selectedTeam: null,
      role: ROLES.FAN,
    })
    changed = true
  }
  // FANCLUV 운영자(Admin) 데모 계정
  if (!users.some(u => u.email === 'admin@fancluv.kr')) {
    users.push({
      nickname: 'FANCLUV 운영자',
      email: 'admin@fancluv.kr',
      password: 'admin123', // 평문 — 데모용. 실서비스에서는 Supabase Auth + 권한 관리로 교체
      joinedAt: '2025-01-01T00:00:00.000Z',
      selectedTeam: null,
      role: ROLES.ADMIN,
    })
    changed = true
  }
  if (changed) writeUsers(users)
}
ensureSeed()

// ── 회원가입 ──
export function signup({ nickname, email, password }) {
  const users = readUsers()
  const dup = users.find(u => u.email.toLowerCase() === email.toLowerCase())
  if (dup) return { ok: false, error: '이미 가입된 이메일입니다.' }

  const user = {
    nickname,
    email,
    password, // 평문 저장 — 실서비스에서는 Supabase Auth로 교체 필요
    joinedAt: new Date().toISOString(),
    selectedTeam: null,
    role: ROLES.FAN,
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
