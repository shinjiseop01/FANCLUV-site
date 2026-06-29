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
  if (!users.some(u => u.email === 'fan@fancluv.kr')) {
    users.push({
      nickname: '민준',
      email: 'fan@fancluv.kr',
      password: '1234', // 평문 — 실서비스에서는 Supabase Auth로 교체 필요
      joinedAt: '2025-03-14T00:00:00.000Z',
      selectedTeam: null,
    })
    writeUsers(users)
  }
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
