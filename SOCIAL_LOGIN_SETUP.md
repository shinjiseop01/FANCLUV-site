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
로그인 후 앱으로 되돌아오는 주소는 코드에서 `redirectTo: window.location.origin` 으로 지정되어 있습니다.
Supabase 대시보드 → Authentication → URL Configuration 의 **Redirect URLs** 에
앱 주소(예: `http://localhost:5173`, 배포 도메인)를 추가하세요.

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
- Supabase 대시보드 → Authentication → Providers → **"Allow linking accounts with the same email"** 활성화 시,
  같은 이메일의 기존(이메일 가입) 계정과 소셜 계정이 자동 연결됩니다.
- MVP 기본값에서는 별도 identity 로 처리되며, 앱은 Supabase 가 반환하는 안내/오류 메시지를 표시합니다.
- (Mock 모드에서는 `auth.socialLogin` 이 같은 이메일 계정을 자동 연결합니다.)

## 6. 이메일 로그인
기존 이메일 회원가입/로그인은 그대로 유지됩니다(소셜과 독립적으로 동작).
