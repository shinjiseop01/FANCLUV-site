# FANCLUV — 소셜 로그인 설정 가이드 (Google · Kakao · NAVER)

Supabase Auth 기준 소셜 로그인 설정 방법입니다. 실제 Client ID/Secret 은 각
개발자 콘솔에서 발급해 아래 위치에 입력하세요. (이 저장소에는 placeholder 만 있습니다.)

공통 사전 준비: `SUPABASE_SETUP.md` 대로 프로젝트/`.env`/마이그레이션(0001·0007 포함)을 완료.

---

## 0. 요약 — Provider별 지원 방식

| Provider | Supabase 기본 지원 | 연동 방식 | 설정 위치 |
|----------|:---:|-----------|-----------|
| **Google** | ✅ | `supabase.auth.signInWithOAuth({ provider: 'google' })` | Supabase 대시보드 |
| **Kakao**  | ✅ | `supabase.auth.signInWithOAuth({ provider: 'kakao' })`  | Supabase 대시보드 |
| **NAVER**  | ❌ | 커스텀 OAuth (Edge Function) | NAVER 콘솔 + Edge Function |

> Google/Kakao 는 Supabase 가 토큰 교환까지 처리하므로 **프론트 .env 에 Secret 이 필요 없습니다**
> (Client ID/Secret 은 Supabase 대시보드에 저장). NAVER 만 Supabase 가 지원하지 않아 커스텀 흐름이 필요합니다.

## 공통 Redirect(콜백) URL — Supabase
Supabase 가 OAuth 콜백을 받는 주소입니다. 각 provider 콘솔의 Redirect/Callback 에 등록:
```
https://<프로젝트-ref>.supabase.co/auth/v1/callback
```

### ⚠️ 필수 — 앱 도메인을 Redirect URLs 에 등록
로그인 후 앱으로 되돌아오는 주소(`redirectTo: window.location.origin` / NAVER 는 magic link)를
Supabase 가 **허용 목록(allow list)** 과 대조합니다. 등록돼 있지 않으면 로그인 자체는 되어도
**앱으로 복귀하지 못합니다.**

경로: **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**
아래 주소를 모두 추가하세요.

| 환경 | 등록할 URL |
|------|-----------|
| Development | `http://localhost:5173` |
| Production | `https://fancluv.com` |

> 와일드카드도 가능: `http://localhost:5173/**`, `https://fancluv.com/**`
> 같은 화면의 **Site URL** 에는 대표 주소(보통 Production)를 지정합니다.

### 등록되지 않았을 때의 증상
- 로그인(동의)은 끝났는데 앱으로 **안 돌아오고** Supabase 기본 페이지/빈 화면/`localhost` 거부에 머무름.
- 주소창에 `?error=redirect_to_not_allowed` 또는 `otp_expired`/`access_denied` 류 파라미터가 붙음.
- 콘솔에 `requested path is invalid` / redirect 관련 오류.
- NAVER 의 경우 magic link `redirectTo` 가 거부되어 세션이 앱에 심어지지 않음.
→ 위 표의 주소를 Redirect URLs 에 추가하면 해결됩니다.

---

## 1. Google (Supabase 기본 지원)
1. Google Cloud Console → OAuth 2.0 클라이언트(웹) 생성.
2. **승인된 리디렉션 URI**: `https://<ref>.supabase.co/auth/v1/callback`
3. Supabase 대시보드 → Authentication → Providers → **Google** 활성화 → Client ID/Secret 입력.
4. 앱의 "Google로 계속하기" 버튼이 이미 연결됨(`socialLogin('google')`).

## 2. Kakao (Supabase 기본 지원)
1. Kakao Developers → 애플리케이션 생성.
2. 제품 설정 → **카카오 로그인** 활성화.
3. **Redirect URI**: `https://<ref>.supabase.co/auth/v1/callback`
4. 앱 키 → **REST API 키**(= Client ID), 보안 → **Client Secret** 발급.
5. 동의항목에서 이메일/닉네임/프로필 이미지 사용 설정.
6. Supabase 대시보드 → Authentication → Providers → **Kakao** 활성화 → REST API 키/Secret 입력.
7. 앱의 "Kakao로 계속하기" 버튼이 이미 연결됨(`socialLogin('kakao')`).

## 3. NAVER (Supabase 미지원 → 커스텀 OAuth)
Supabase 에 NAVER provider 가 없으므로, **NAVER authorize 리다이렉트(프론트) + 콜백 토큰 교환(Edge Function)** 으로 구성합니다.

### 3-1. NAVER Developers
1. https://developers.naver.com → 애플리케이션 등록.
2. 사용 API: **네이버 로그인**. 제공 정보: 이메일/별명/프로필사진.
3. **Callback URL** 등록 (아래 Edge Function 주소):
   ```
   https://<ref>.supabase.co/functions/v1/naver-callback
   ```
4. **Client ID / Client Secret** 발급.

### 3-2. 환경변수 (`.env`)
```
VITE_NAVER_CLIENT_ID=<발급받은 Client ID>            # 공개(authorize URL 생성용)
VITE_NAVER_CALLBACK_URL=https://<ref>.supabase.co/functions/v1/naver-callback
```
Client **Secret** 은 프론트에 두지 말고 Edge Function 시크릿으로:
```
supabase secrets set NAVER_CLIENT_SECRET=<secret> NAVER_CLIENT_ID=<id>
```

### 3-3. 흐름
1. 버튼 클릭 → `socialLogin('naver')` 가 NAVER authorize 로 리다이렉트(`VITE_NAVER_CLIENT_ID` 필요).
   `state` 에 앱 복귀 주소(origin)를 담아 보냅니다.
2. 사용자가 동의 → NAVER 가 `VITE_NAVER_CALLBACK_URL`(Edge Function)로 `code`·`state` 전달.
3. **Edge Function**(`supabase/functions/naver-callback/index.ts`)이:
   - `code` → NAVER **token endpoint** 로 access token 교환
   - **profile API**(`/v1/nid/me`) 호출 → email·nickname·profile_image·id(provider_user_id) 추출
   - **service_role** 로 사용자 조회: 없으면 `admin.createUser`(트리거가 profiles 자동 생성),
     같은 이메일이 이미 있으면 profiles 에 NAVER 정보 연결
   - `admin.generateLink({ type:'magiclink' })` 의 `action_link` 로 브라우저 리다이렉트 → 세션 발급
4. 앱은 세션을 감지(`detectSessionInUrl`)해 로그인 완료.

### 3-4. Edge Function 배포 (Supabase CLI)
```bash
# 1) CLI 설치 & 로그인 & 프로젝트 연결
npm i -g supabase        # 또는 brew install supabase/tap/supabase
supabase login
supabase link --project-ref <ref>

# 2) 시크릿 설정 (프론트엔드에 절대 넣지 않는 값)
supabase secrets set \
  NAVER_CLIENT_ID=<naver-client-id> \
  NAVER_CLIENT_SECRET=<naver-client-secret> \
  NAVER_REDIRECT_URI=https://<ref>.supabase.co/functions/v1/naver-callback \
  SITE_URL=http://localhost:5173
# SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 배포 환경에 자동 주입됩니다.

# 3) 배포 — NAVER 가 JWT 없이 호출하므로 --no-verify-jwt 필수
supabase functions deploy naver-callback --no-verify-jwt

# 로컬 테스트
supabase functions serve naver-callback --no-verify-jwt --env-file ./supabase/.env.local
```

### 3-5. 필요한 환경변수 (Edge Function 시크릿)
| 변수 | 설명 |
|---|---|
| `NAVER_CLIENT_ID` | NAVER 애플리케이션 Client ID |
| `NAVER_CLIENT_SECRET` | NAVER 애플리케이션 Client Secret (**서버 전용**) |
| `NAVER_REDIRECT_URI` | `https://<ref>.supabase.co/functions/v1/naver-callback` (NAVER 콘솔 Callback 과 동일) |
| `SUPABASE_URL` | 프로젝트 URL (플랫폼 자동 주입) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role 키 (**Edge Function 에서만**, 자동 주입) |
| `SITE_URL` | (선택) 로그인 후 복귀 앱 주소 폴백 |

프론트엔드 `.env` 에는 `VITE_NAVER_CLIENT_ID` 와 `VITE_NAVER_CALLBACK_URL` 만 둡니다(공개 안전).

> Redirect/Callback URL 은 **세 곳이 정확히 일치**해야 합니다:
> NAVER 콘솔 Callback = `VITE_NAVER_CALLBACK_URL`(프론트) = `NAVER_REDIRECT_URI`(Edge Function).
> 예: `https://abcd1234.supabase.co/functions/v1/naver-callback`

> `VITE_NAVER_CLIENT_ID` 가 비어 있으면 앱은 "NAVER 로그인 설정이 필요합니다" 안내를 표시합니다.

### 3-6. 왜 `--no-verify-jwt` 인가
`naver-callback` 은 **외부 NAVER OAuth 서버**가 브라우저 리다이렉트로 직접 호출하는 공개 콜백입니다.
이 요청에는 Supabase JWT(`Authorization` 헤더)가 없으므로, 기본값(`verify_jwt=true`)으로 배포하면
401 로 차단되어 콜백을 처리할 수 없습니다. 따라서 `--no-verify-jwt` 로 배포하고, 대신 함수 내부에서
`code`/`state` 검증 + `service_role` 로 안전하게 사용자/세션을 처리합니다.

### 3-7. 기존 사용자 조회 & 중복 처리
- 콜백은 `profiles.email` **인덱스**(`0008_profiles_email_index.sql`)로 기존 사용자를 조회합니다
  (전체 스캔 아님).
- **기존 프로필이 있고 `provider = 'naver'`(또는 미설정)** → 신규 프로필을 만들지 않고 기존 프로필에
  `provider_user_id` 를 저장해 연결한 뒤 로그인합니다.
- **기존 프로필이 있고 다른 방식(email/google/kakao)** → 충돌로 보고 자동 병합하지 않습니다.
  앱으로 `?error=account_exists_<provider>` 를 반환하여 안전 안내를 표시합니다.
- **기존 프로필이 없으면** → `admin.createUser` 로 생성(트리거가 `profiles` 자동 생성).

### 3-8. 테스트 방법
1. `.env` 에 `VITE_NAVER_CLIENT_ID`, `VITE_NAVER_CALLBACK_URL` 설정 후 `npm run dev`.
2. 로그인 화면 → **NAVER로 계속하기** 클릭 → `nid.naver.com/oauth2.0/authorize` 로 이동하는지 확인.
3. NAVER 동의 → `naver-callback` 으로 돌아오는지 확인
   (로컬은 `supabase functions serve naver-callback --no-verify-jwt` 로 함수 로그 관찰).
4. 함수 로그에서 token 교환·프로필 조회 성공 확인 → magic link 로 앱 복귀 → 세션 생성 확인.
5. 같은 이메일로 이메일 가입 계정이 있는 경우, 앱 URL 에 `?error=account_exists_email` 이 붙는지 확인.
6. `profiles` 에 `provider='naver'`, `provider_user_id` 가 저장됐는지 확인(중복 프로필 미생성).

---

## 4. 소셜 로그인 → 프로필 매핑
가입 시 `handle_new_user` 트리거(마이그레이션 `0007_social_login.sql`)가
`auth.users` 메타데이터를 `profiles` 로 매핑합니다:

| profiles 컬럼 | 소스 |
|---|---|
| `provider` | app_metadata.provider (google/kakao/naver) |
| `provider_user_id` | user_metadata.provider_id / sub / id |
| `email` | auth.users.email |
| `nickname` | user_metadata.nickname / name / full_name |
| `avatar_url` (프로필 이미지) | user_metadata.avatar_url / picture |
| `is_email_verified` / `verification_status` | email_confirmed_at 기반 |
| `selected_team` · `role` · `gender` · `age_group` | 이후 앱에서 설정(팀 선택/기본값) |

## 5. 같은 이메일 중복 처리
- **NAVER(커스텀 콜백)**: `naver-callback` 이 `profiles.email` 로 조회하여
  - 기존 프로필이 `naver`(또는 미설정)면 → 기존 프로필에 `provider_user_id` 를 연결하고 로그인(중복 프로필 미생성).
  - 기존 프로필이 다른 방식(email/google/kakao)이면 → 자동 병합하지 않고 `?error=account_exists_<provider>` 안전 안내.
- **Google/Kakao(Supabase native)**: 대시보드 → Authentication → Providers → **"Allow linking accounts with the same email"**
  활성화 시 같은 이메일 계정이 자동 연결됩니다. 기본값에서는 별도 identity 로 처리되며 Supabase 오류/안내가 표시됩니다.
- (Mock 모드에서는 `auth.socialLogin` 이 같은 이메일 계정을 자동 연결합니다.)

## 6. 이메일 로그인
기존 이메일 회원가입/로그인은 그대로 유지됩니다(소셜과 독립적으로 동작).
