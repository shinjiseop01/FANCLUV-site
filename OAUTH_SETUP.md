# FANCLUV — 소셜 로그인(OAuth) 설정 가이드

Google · Kakao · NAVER 소셜 로그인을 **실제로 작동**시키기 위한 설정 문서입니다.
코드(프론트 OAuth 호출, `/auth/callback` 처리, 프로필 자동 생성 트리거, NAVER용
Edge Function)는 **이미 배포되어 있습니다.** 남은 것은 각 플랫폼에서 앱을 만들고
**Client ID / Secret 을 발급받아 Supabase(또는 시크릿)에 넣는 일**뿐입니다.

> 이 값들은 자격증명이라 대신 입력해 드릴 수 없습니다. 아래 단계대로 발급 → 붙여넣기 하시면 됩니다.

---

## 0. 공통 정보 (그대로 복사해서 사용)

| 항목 | 값 |
|---|---|
| Supabase Project Ref | `cuuzbddxnzhhlrqmmebz` |
| **Supabase Auth Callback** (Google·Kakao 공용) | `https://cuuzbddxnzhhlrqmmebz.supabase.co/auth/v1/callback` |
| **NAVER Edge Function Callback** | `https://cuuzbddxnzhhlrqmmebz.supabase.co/functions/v1/naver-callback` |
| Production 앱 URL | `https://fancluv-site.vercel.app` |
| Production 앱 콜백(리다이렉트 복귀) | `https://fancluv-site.vercel.app/auth/callback` |
| 개발(localhost) 앱 URL | `http://localhost:5173` |
| 개발 앱 콜백 | `http://localhost:5173/auth/callback` |

> **핵심 구분**
> - **JavaScript Origin / 서비스 URL** 에는 → **앱 주소**(`fancluv-site.vercel.app`, `localhost:5173`)
> - **Authorized redirect URI / Callback URL** 에는 → **Supabase 주소**(위 표의 `/auth/v1/callback` 또는 `/functions/v1/naver-callback`)
> 이 둘을 헷갈리면 `redirect_uri_mismatch` 오류가 납니다.

---

## 1. Supabase Provider 활성화 위치

Supabase Dashboard → 프로젝트 선택 → 왼쪽 **Authentication** → **Providers** (`Sign In / Providers`)
→ 목록에서 **Google**, **Kakao** 를 각각 켜고(Enable) Client ID / Secret 을 붙여넣습니다.

- URL 직접 이동: `https://supabase.com/dashboard/project/cuuzbddxnzhhlrqmmebz/auth/providers`
- **Redirect URL** 항목에 이미 표시된 값(`.../auth/v1/callback`)을 복사해 각 플랫폼 콘솔에 등록하면 됩니다.
- 저장 후 **수 초 내 반영**됩니다(재배포 불필요). 이때부터 `provider is not enabled` 오류가 사라집니다.

> **NAVER 는 Supabase 기본 Provider 가 아닙니다.** Providers 목록에 없으므로,
> NAVER 는 아래 4번의 **Edge Function 방식**으로 처리합니다(이미 구현/배포됨).

### (선택) 같은 이메일 계정 자동 연결
Authentication → Providers 상단(또는 **Auth → Settings**)의
**"Allow linking accounts with the same email"** 를 켜면, 이메일 가입 계정과 소셜 계정을
같은 이메일일 때 자동 연결합니다. 꺼두면 앱이 "이미 가입된 이메일" 안내를 표시합니다.

---

## 2. Google OAuth 설정

### 2-1. Google Cloud Console에서 발급
1. https://console.cloud.google.com → 프로젝트 생성/선택
2. **APIs & Services → OAuth consent screen** → External → 앱 이름/이메일 입력 → 저장
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
4. Application type: **Web application**
5. **Authorized JavaScript origins** (앱 주소):
   - `https://fancluv-site.vercel.app`
   - `http://localhost:5173`
6. **Authorized redirect URIs** (Supabase 주소):
   - `https://cuuzbddxnzhhlrqmmebz.supabase.co/auth/v1/callback`
7. 생성 후 나오는 **Client ID** 와 **Client Secret** 을 복사.

### 2-2. Supabase에 입력
Authentication → Providers → **Google** → Enable →
- **Client ID** ← Google Client ID
- **Client Secret** ← Google Client Secret
- Save

### 2-3. 복사해야 하는 값 요약
| Google에서 복사 | Supabase 붙여넣는 곳 |
|---|---|
| Client ID | Google Provider → Client ID |
| Client Secret | Google Provider → Client Secret |

---

## 3. Kakao OAuth 설정 (커스텀 Edge Function 방식)

> ⚠️ **왜 Supabase 기본 Kakao 를 안 쓰는가**: Supabase(GoTrue) 기본 Kakao provider 는
> scope 에 **`account_email` 을 강제 포함**하며 클라이언트 scope 로 제거되지 않습니다(병합만 됨).
> 비즈 앱이 아니면 `KOE205 – 설정하지 않은 동의 항목: account_email` 이 **반드시** 발생합니다.
> 그래서 FANCLUV 는 NAVER 처럼 **커스텀 콜백(`functions/v1/kakao-callback`)** 으로 scope 를
> `profile_nickname` 만 요청해 KOE205 를 원천 차단하고, **이메일 없이도 로그인**합니다.
> (Supabase → Providers 의 Kakao 는 **끄셔도 됩니다.**)

### 3-1. Kakao Developers에서 발급
1. https://developers.kakao.com → 내 애플리케이션 → **애플리케이션 추가하기**
2. **앱 설정 → 플랫폼 → Web 플랫폼 등록** (사이트 도메인):
   - `https://fancluv-site.vercel.app`
   - `http://localhost:5173`
3. **제품 설정 → 카카오 로그인 → 활성화 ON**
4. **카카오 로그인 → Redirect URI 등록** — ⚠️ **Edge Function 주소**(auth/v1/callback 아님):
   - `https://cuuzbddxnzhhlrqmmebz.supabase.co/functions/v1/kakao-callback`
5. **동의항목**: **닉네임(profile_nickname)** 만 "필수 동의"로 설정하면 충분합니다.
   프로필 사진은 선택. **이메일(account_email)은 켜지 마세요**(비즈 앱 아니면 KOE205 원인).
6. **앱 키 → REST API 키** = Client ID.
7. (선택) **보안 → Client Secret** 활성화 시 그 값을 Client Secret 으로 사용.

### 3-2. Supabase Edge Function 시크릿에 입력 (Providers 아님!)
```bash
npx supabase secrets set \
  KAKAO_CLIENT_ID=<REST_API_KEY> \
  KAKAO_CLIENT_SECRET=<보안_Client_Secret(선택)> \
  KAKAO_REDIRECT_URI=https://cuuzbddxnzhhlrqmmebz.supabase.co/functions/v1/kakao-callback \
  SITE_URL=https://fancluv-site.vercel.app
```
> `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 는 자동 주입.
> Client Secret 을 활성화하지 않았다면 `KAKAO_CLIENT_SECRET` 은 생략 가능.
>
> ⚠️ **보안(필수)**: 콜백은 로그인 후 돌아갈 앱 origin 을 **allowlist** 로 검증한다.
> `SITE_URL`(정식 origin)을 **반드시** 설정해야 커스텀 OAuth(Kakao/Naver)가 동작한다.
> 미설정 시 세션 유출 방지를 위해 안전 폴백(SITE_URL)로 강제되어 로그인이 실패한다.
> 프리뷰 등 추가 origin 을 허용하려면 `ALLOWED_ORIGINS=https://a.com,https://b.com`
> (쉼표구분) 을 함께 설정한다. (`kakao-callback`/`naver-callback` 공통)

### 3-3. 프론트에 Kakao REST API 키 노출 (authorize 이동용, 공개값)
Vercel → Settings → Environment Variables (로컬은 `.env`):
```
VITE_KAKAO_CLIENT_ID = <REST_API_KEY>
```
저장 후 `vercel --prod` 재배포하면 카카오 버튼이 동작합니다.

### 3-4. 복사해야 하는 값 요약
| Kakao에서 복사 | 넣는 곳 |
|---|---|
| REST API 키 | ① `supabase secrets set KAKAO_CLIENT_ID=...`  ② Vercel `VITE_KAKAO_CLIENT_ID` |
| Client Secret(선택) | `supabase secrets set KAKAO_CLIENT_SECRET=...` (프론트에는 절대 안 넣음) |

### 3-5. 이메일 / KOE205 정리
- 커스텀 콜백은 `profile_nickname` 만 요청 → **account_email 미요청** → **KOE205 발생 안 함**.
- 이메일 미제공이라 `profiles.email = NULL`, 닉네임은 카카오 닉네임(없으면 `카카오사용자`).
  로그인/세션은 내부 placeholder 이메일로 성립하지만 화면상 이메일은 비어 있고, 사용자는
  **설정 → 이메일 등록** 카드에서 나중에 이메일을 추가할 수 있습니다(강제 아님).
- **비즈 앱 전환 후 이메일 수집을 원하면**: Kakao 앱을 비즈 앱으로 전환하고 account_email
  동의항목을 활성화한 뒤, `functions/kakao-callback` 의 authorize scope 에 `account_email`
  을 추가하거나(또는 Supabase 네이티브 Kakao 로 되돌리기) → 이메일도 수집됩니다.

### 3-6. Edge Function 배포
```bash
npx supabase functions deploy kakao-callback --no-verify-jwt
```
(외부 Kakao 서버가 JWT 없이 호출하는 공개 콜백이므로 `--no-verify-jwt` 필수)

---

## 4. NAVER OAuth 설정 (Edge Function 방식)

NAVER 는 Supabase 기본 Provider 가 아니므로, 배포된 **`naver-callback` Edge Function**
이 code→token 교환·프로필 조회·세션 발급을 대신 처리합니다. NAVER 앱과 **시크릿**만
설정하면 됩니다.

### 4-1. Naver Developers에서 발급
1. https://developers.naver.com → **Application → 애플리케이션 등록**
2. 사용 API: **네이버 로그인** 선택 → 제공 정보(**이메일 주소, 별명/이름, 프로필 사진**) 체크
3. 환경 추가: **PC 웹**
   - **서비스 URL**: `https://fancluv-site.vercel.app`
   - **Callback URL** (Supabase Edge Function 주소):
     `https://cuuzbddxnzhhlrqmmebz.supabase.co/functions/v1/naver-callback`
4. 등록 후 **Client ID** 와 **Client Secret** 을 복사.

### 4-2. Supabase 시크릿에 입력 (대시보드 Providers 아님!)
NAVER 값은 Providers 화면이 아니라 **Edge Function 시크릿**으로 넣습니다.
터미널에서:
```bash
npx supabase secrets set \
  NAVER_CLIENT_ID=발급받은_Client_ID \
  NAVER_CLIENT_SECRET=발급받은_Client_Secret \
  NAVER_REDIRECT_URI=https://cuuzbddxnzhhlrqmmebz.supabase.co/functions/v1/naver-callback \
  SITE_URL=https://fancluv-site.vercel.app
```
> `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 는 플랫폼이 자동 주입되므로 넣지 않습니다.

### 4-3. 프론트에 NAVER Client ID 노출 (authorize 화면 이동용)
NAVER 는 브라우저가 직접 authorize URL 로 이동하므로 **Client ID(공개값)** 만
프론트 환경변수로 필요합니다. Vercel → Project → Settings → Environment Variables:
```
VITE_NAVER_CLIENT_ID = 발급받은_Client_ID
```
저장 후 재배포(`vercel --prod`)하면 NAVER 버튼이 실제로 동작합니다.
(로컬은 `.env` 에 동일하게 `VITE_NAVER_CLIENT_ID=...` 추가)

### 4-4. 복사해야 하는 값 요약
| NAVER에서 복사 | 넣는 곳 |
|---|---|
| Client ID | ① `supabase secrets set NAVER_CLIENT_ID=...`  ② Vercel `VITE_NAVER_CLIENT_ID` |
| Client Secret | `supabase secrets set NAVER_CLIENT_SECRET=...` (프론트에는 절대 넣지 않음) |

> **Client Secret 은 절대 프론트/깃에 넣지 마세요.** Edge Function 환경에서만 사용됩니다.

---

## 5. Redirect URL 총정리

| 용도 | 등록 위치 | 값 |
|---|---|---|
| Google redirect URI | Google Console | `https://cuuzbddxnzhhlrqmmebz.supabase.co/auth/v1/callback` |
| Kakao Redirect URI | Kakao Redirect URI | `https://cuuzbddxnzhhlrqmmebz.supabase.co/functions/v1/kakao-callback` |
| NAVER Callback URL | Naver Developers Callback URL | `https://cuuzbddxnzhhlrqmmebz.supabase.co/functions/v1/naver-callback` |
| JS Origin / 서비스 URL(prod) | Google/Kakao/Naver 콘솔 | `https://fancluv-site.vercel.app` |
| JS Origin(dev) | Google/Kakao 콘솔 | `http://localhost:5173` |
| 앱 복귀 경로(코드가 사용) | (설정 불필요, 코드 내장) | `/auth/callback` |

---

## 6. 설정 후 다시 테스트하는 방법

1. **Google/Kakao**: Supabase Providers 에서 Enable + Client ID/Secret 저장 → 즉시 반영.
2. **NAVER**: 시크릿 설정 + Vercel `VITE_NAVER_CLIENT_ID` 추가 → `vercel --prod` 재배포.
3. https://fancluv-site.vercel.app 에서 각 버튼 클릭 →
   provider 로그인 화면 → 동의 → `/auth/callback`(로딩) → 팀 미선택이면 **팀 선택**,
   선택돼 있으면 **구단 홈**으로 이동하면 성공.
4. 확인: Supabase → **Authentication → Users** 에 계정 생성,
   **Table Editor → profiles** 에 프로필(닉네임/이메일/provider) 생성.

---

## 7. 자주 나는 오류

| 오류 | 원인 / 해결 |
|---|---|
| `provider is not enabled` / `Unsupported provider` | Supabase Providers 에서 해당 provider **미활성화**. 2·3번대로 Enable. |
| `redirect_uri_mismatch` | 콘솔의 redirect URI 가 `.../auth/v1/callback`(NAVER는 `/functions/v1/naver-callback`)과 **정확히** 일치하지 않음. |
| NAVER 버튼이 "설정이 필요합니다" | `VITE_NAVER_CLIENT_ID` 미설정. 4-3 수행 후 재배포. |
| NAVER 로그인 후 `server_misconfigured` | Edge Function 시크릿(NAVER_CLIENT_ID/SECRET/REDIRECT_URI) 누락. 4-2 수행. |
| 로그인 후 이메일 없음 | Kakao/NAVER 이메일 동의 미허용. 동의항목/제공정보에 이메일 추가(닉네임 fallback 은 자동). |

---

## 8. 코드가 이미 처리하는 것 (추가 작업 불필요)

- 버튼 클릭 → `supabase.auth.signInWithOAuth({ provider })` (google/kakao) / NAVER authorize 이동
- 리다이렉트 복귀 → **`/auth/callback`** (로딩 화면 + 세션 자동 교환)
- 세션 성립 → 프로필 자동 생성(트리거 `handle_new_user`: id/email/nickname/avatar/provider,
  이메일·닉네임 fallback 포함, `on conflict do nothing` 로 중복 방지)
- `selected_team` 없으면 **팀 선택**, 있으면 **구단 홈**으로 이동
- 실패 시 안내 문구 + "로그인으로 돌아가기"

---

## 9. 계정 중복 / 연결 정책 (권장안)

- **현재 정책**: 서로 다른 provider(이메일/Google/Kakao/Naver)가 **같은 이메일**을 반환하면,
  NAVER 커스텀 콜백은 기존 프로필이 있으면 새 프로필을 만들지 않고 `account_exists_<provider>`
  안내로 위임합니다. Google/Kakao(네이티브)는 Supabase 의 "동일 이메일 자동 연결" 설정을 따릅니다.
- **profiles 는 `auth.users.id` 기준 1개** — 트리거가 `on conflict (id) do nothing` 로 중복 생성 방지.
- **권장**: Supabase → Authentication → 설정의 **"Allow linking accounts with the same email"** 은
  보안 검토 후 신중히 결정하세요.
  - **ON**: 같은 이메일이면 자동으로 하나의 사용자로 연결(편의 ↑). 단, 한 provider의 이메일이
    검증되지 않으면 계정 탈취 위험이 있으니 **이메일 검증이 보장되는 provider만** 사용할 때 권장.
  - **OFF(현재/보수적)**: 이메일이 같아도 별도 처리 → 앱이 "이미 가입된 이메일" 안내. 안전하지만
    사용자가 로그인 방식을 헷갈릴 수 있음.
  - FANCLUV 베타 권장: **OFF 유지**로 시작하고, 이메일 검증 신뢰도가 확보되면 ON 검토.

## 10. 보안 점검 체크리스트

- ✅ Client Secret / service_role / `NAVER_CLIENT_SECRET` 은 **프론트 번들·깃에 절대 미포함** →
  서버(Supabase Providers 설정 / Edge Function 시크릿)에만.
- ✅ `VITE_` 환경변수에는 **공개 Client ID(Naver)** 와 anon key 만.
- ✅ 콘솔 로그에 token / secret / authorization code 미출력(실패 시 `provider + code` 만 기록).
- ✅ OAuth 콜백 후 URL 토큰 해시 정리(supabase-js) + `/auth/callback` 은 `navigate(replace)`.
- ✅ NAVER state(nonce+origin) 검증 유지. Supabase "Skip nonce checks" 는 **OFF 유지**.

## 11. 장애 시 로그 확인 위치

- **프론트**: 브라우저 콘솔(`[oauth] <provider> login failed: <code>`), Network 탭의
  `/auth/v1/authorize`·`/auth/v1/callback`·`/functions/v1/naver-callback` 응답.
- **Supabase Auth 로그**: Dashboard → **Logs → Auth**.
- **Edge Function 로그**: Dashboard → **Edge Functions → naver-callback / send-email-code → Logs**.
- **provider 콘솔**: Google Cloud(OAuth 동의/자격증명), Kakao Developers(카카오 로그인 로그),
  Naver Developers(로그인 통계/오류).
