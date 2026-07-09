// FANCLUV — OAuth provider abstraction (MVP mock).
//
// 실제 OAuth / Supabase Auth 연동 전에 화면과 계정 로직을 완성할 수 있도록
// Provider 인터페이스를 정의한다. 각 Provider는 `signIn()`을 구현하며,
// MVP 단계에서는 실제 인증 대신 Mock 프로필을 즉시 반환한다.
//
// ── 실서비스 전환 지점 ──
//   각 Provider의 signIn() 내부만 아래처럼 교체하면
//   SocialAuth 컴포넌트와 auth.socialLogin() 은 그대로 동작한다.
//
//   • Supabase Auth:
//       supabase.auth.signInWithOAuth({ provider: 'google' | 'kakao' | ... })
//       → 리다이렉트 콜백에서 세션/프로필을 받아 normalizeProfile() 형태로 변환
//   • 직접 구현:
//       provider authorize URL 로 redirect → callback 에서 code ↔ token 교환
//       → userinfo API 호출 후 normalizeProfile() 형태로 변환
//
// signIn() 이 반환해야 하는 표준 프로필(normalizeProfile)은 다음과 같다:
//   { provider, providerUserId, email, nickname, profileImage }

// 서비스별 placeholder 프로필 이미지(data URI SVG).
// 실서비스에서는 provider가 내려주는 실제 프로필 사진 URL로 대체된다.
function placeholderAvatar(seed, bg, fg = '#FFFFFF') {
  const initial = (seed || '?').trim().charAt(0).toUpperCase()
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">` +
    `<rect width="96" height="96" rx="48" fill="${bg}"/>` +
    `<text x="48" y="52" font-size="44" font-family="Pretendard,Arial,sans-serif" ` +
    `font-weight="700" fill="${fg}" text-anchor="middle" dominant-baseline="central">${initial}</text>` +
    `</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// signIn() 결과를 표준 프로필 형태로 정규화한다.
// 실 provider 응답(각기 다른 필드명)을 이 함수 한 곳에서 매핑하면 된다.
export function normalizeProfile({ provider, providerUserId, email, nickname, profileImage }) {
  return {
    provider,
    providerUserId: String(providerUserId),
    email: email || null,
    nickname: nickname || 'FANCLUV 팬',
    profileImage: profileImage || null,
  }
}

// 모든 Provider의 공통 베이스.
// 하위 클래스는 signIn() 만 override 하면 된다.
export class OAuthProvider {
  constructor({ id, label, brandColor }) {
    this.id = id              // 'google' | 'kakao' | 'naver'
    this.label = label        // 버튼에 표시되는 서비스명
    this.brandColor = brandColor
  }

  // MVP: Mock 프로필 반환. (실서비스에서 override)
  // 약간의 지연을 두어 실제 리다이렉트/네트워크처럼 느껴지게 한다.
  async signIn() {
    await new Promise(r => setTimeout(r, 500))
    return this.mockProfile()
  }

  // 각 Provider가 제공하는 데모 프로필 (override 지점).
  mockProfile() {
    return normalizeProfile({
      provider: this.id,
      providerUserId: `${this.id}_0000`,
      email: `${this.id}@example.com`,
      nickname: `${this.label} 팬`,
      profileImage: placeholderAvatar(this.label, this.brandColor),
    })
  }
}

export class GoogleProvider extends OAuthProvider {
  constructor() {
    super({ id: 'google', label: 'Google', brandColor: '#4285F4' })
  }
  // 실서비스: supabase.auth.signInWithOAuth({ provider: 'google' })
  mockProfile() {
    return normalizeProfile({
      provider: 'google',
      providerUserId: 'google_100000000000000000001',
      email: 'google.fan@gmail.com',
      nickname: '구글 팬',
      profileImage: placeholderAvatar('G', '#4285F4'),
    })
  }
}

export class KakaoProvider extends OAuthProvider {
  constructor() {
    super({ id: 'kakao', label: 'Kakao', brandColor: '#FEE500' })
  }
  // 실서비스: supabase.auth.signInWithOAuth({ provider: 'kakao' })
  mockProfile() {
    return normalizeProfile({
      provider: 'kakao',
      providerUserId: 'kakao_3300001111',
      email: 'kakao.fan@kakao.com',
      nickname: '카카오 팬',
      profileImage: placeholderAvatar('K', '#FEE500', '#3C1E1E'),
    })
  }
}

export class NaverProvider extends OAuthProvider {
  constructor() {
    super({ id: 'naver', label: 'NAVER', brandColor: '#03C75A' })
  }
  // 실서비스: supabase.auth.signInWithOAuth({ provider: 'naver' })  (또는 커스텀 OAuth)
  mockProfile() {
    return normalizeProfile({
      provider: 'naver',
      providerUserId: 'naver_ncid_abcd1234',
      email: 'naver.fan@naver.com',
      nickname: '네이버 팬',
      profileImage: placeholderAvatar('N', '#03C75A'),
    })
  }
}

// 화면에서 순회 렌더링하는 Provider 목록. 순서 = 버튼 노출 순서.
// Provider 추가 시 클래스 정의 후 이 배열에만 넣으면 로그인/회원가입에 함께 노출된다.
export const OAUTH_PROVIDERS = [
  new GoogleProvider(),
  new KakaoProvider(),
  new NaverProvider(),
]

export function getProvider(id) {
  return OAUTH_PROVIDERS.find(p => p.id === id) || null
}

// ── Supabase Auth 연동 설정 ──
// `native: true`  → Supabase 가 기본 지원 → supabase.auth.signInWithOAuth({ provider })
// `native: false` → Supabase 미지원(예: NAVER) → 커스텀 OAuth(Edge Function) 필요.
// 설정 방법: OAUTH_SETUP.md
// `scopes` 를 지정하면 Supabase 가 provider 에 보내는 기본 scope 를 덮어쓴다.
//   · Kakao: 기본값에 account_email 이 포함되어, 비즈 앱이 아니면 KOE205
//     (설정하지 않은 동의 항목: account_email) 오류가 난다. → 비즈 앱 전환 전에는
//     account_email 을 빼고 profile_nickname / profile_image 만 요청한다.
//     (비즈 앱 전환 후 'account_email' 을 다시 추가하면 이메일도 수집된다 — OAUTH_SETUP.md)
export const SUPABASE_PROVIDER_CONFIG = {
  google: { supabaseProvider: 'google', native: true },
  kakao:  { supabaseProvider: 'kakao', native: true, scopes: 'profile_nickname profile_image' },
  naver:  { supabaseProvider: null, native: false },
}
