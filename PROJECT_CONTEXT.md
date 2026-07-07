# FANCLUV — 프로젝트 컨텍스트 (핸드오프 문서)

> 새 채팅에서 이 파일을 읽으면 바로 이어서 작업할 수 있도록 정리한 문서입니다.
> 최종 정리: 2026-07-06 / `main` 브랜치 기준 (B2B 고객관리 30차까지 — 관리자 운영도구·AI 리포트·구단 리포트 전달·B2B 고객관리 포함)

## 1. 프로젝트 개요

**FANCLUV** — K리그1(2026 시즌) 축구 팬 커뮤니티 웹 앱 (MVP / 목업 단계).
팬이 응원 구단을 고르고, 의견을 나누고, 경기·뉴스·랭킹·AI 인사이트를 보는 SPA.

- **스택**: React 19 + Vite 8 + React Router 7 (`react-router-dom`)
- **언어/스타일**: JavaScript (TS 아님), 페이지별 `*.jsx` + `*.css` 1:1 구성
- **상태/데이터**: 백엔드 없음. 전부 **localStorage 기반 목 데이터**
- **배포**: Vercel (SPA fallback — `vercel.json`의 rewrites로 모든 경로 → `index.html`)
- **디자인 시스템**: `DESIGN.md` — Coinbase 스타일 분석 기반 (흰 캔버스, 절제된 포인트 컬러, 카드 레이어링)
- **lint**: oxlint (`npm run lint`)

### 실행 방법
```bash
npm run dev      # 개발 서버 (Vite)
npm run build    # 프로덕션 빌드 → dist/
npm run lint     # oxlint
./start-dev.sh   # nvm node v20.20.2 경로 고정 후 vite 실행
```

## 2. 라우팅 구조 (`src/main.jsx`)

`RequireAuth`로 보호되는 라우트는 비로그인 시 `/`(로그인)로 리다이렉트.

| 경로 | 페이지 | 보호 |
|------|--------|------|
| `/` | LoginPage | ✗ |
| `/signup` | SignupPage | ✗ |
| `/find-id` | FindIdPage (아이디 찾기) | ✗ |
| `/find-password` | FindPasswordPage (비밀번호 찾기) | ✗ |
| `/verify-email` | VerifyEmailPage (이메일 인증) | ✓ |
| `/team-select` | TeamSelectPage | ✓ |
| `/club/:teamId` | ClubHomePage (구단 홈) | ✓ |
| `/club/:teamId/opinions` | OpinionsPage (팬 의견 목록) | ✓ |
| `/club/:teamId/opinions/:opinionId` | OpinionDetailPage (의견 상세 + 댓글) | ✓ |
| `/club/:teamId/survey` | SurveyPage (설문 목록) | ✓ |
| `/club/:teamId/survey/:surveyId` | SurveyDetailPage (설문 상세/참여) | ✓ |
| `/club/:teamId/write` | CreateOpinionPage (의견 작성) | ✓ |
| `/club/:teamId/activity` | MyActivityPage (내 활동 대시보드) | ✓ |
| `/club/:teamId/matches` | MatchCenterPage (경기센터) | ✓ |
| `/club/:teamId/news` `…/news/:newsId` | TeamNewsPage (팀 뉴스) | ✓ |
| `/club/:teamId/insights` | AIInsightsPage (AI 인사이트) | ✓ |
| `/club/:teamId/ranking` | FanRankingPage (팬 랭킹) | ✓ |
| `/club/:teamId/settings` | SettingsPage (설정) | ✓ |
| `/club/:teamId/profile` | ProfileEditPage (프로필 수정) | ✓ |
| `/club/:teamId/password` | ChangePasswordPage (비밀번호 변경) | ✓ |
| `/club/:teamId/about` `…/privacy` `…/terms` | InfoPage (page prop 분기: 소개/개인정보/약관) | ✓ |
| `*` | NotFoundPage (404) | — |

**관리자 콘솔** (`/admin`, `RequireAdmin` — 비로그인→로그인, 일반유저→AccessDenied):

| 경로 | 페이지 |
|------|--------|
| `/admin` | AdminDashboard (index) |
| `/admin/members` | AdminMembers (회원 관리) |
| `/admin/opinions` | AdminOpinions (의견/댓글 관리) |
| `/admin/surveys` | AdminSurveys (설문 관리) |
| `/admin/news` | AdminNews (뉴스 관리) |
| `/admin/news-sources` | AdminNewsSources (뉴스 소스 관리 — 33차) |
| `/admin/notices` | AdminNotices (공지사항 관리 — 25차) |
| `/admin/reports` | AdminReports (신고 관리) |
| `/admin/report-docs` | AdminReportDocs (구단 전달용 AI 리포트 관리 — 27~28차) |
| `/admin/customers` | AdminCustomers (B2B 고객/계약 관리 — 30차) |
| `/admin/system` | AdminSystemStatus (통합 상태 대시보드 — 34차) |
| `/admin/settings` | AdminSettings (설정) |

- 레이아웃: `src/admin/AdminLayout.jsx` · 목 데이터: `src/admin/adminData.js` · 스타일: `src/admin/admin.css`

전역 Provider: `ThemeProvider` → `LanguageProvider` → `BrowserRouter`.

## 3. 핵심 모듈

### 테마(다크모드) — `src/contexts/ThemeContext.jsx` + `src/theme.css`
- `useTheme()` → `{ theme, resolved, setTheme }`. `theme`은 사용자 선호('light'|'dark'|'system'), `resolved`는 실제 적용된 'light'|'dark'.
- localStorage 키: `fancluv_theme` (기본 `system`). 선택값을 `<html data-theme="light|dark">`로 반영.
- `system` 선택 시 `matchMedia('(prefers-color-scheme: dark)')`로 OS 설정을 따르고 변경을 실시간 구독.
- `index.html`에 **첫 페인트 전 부트 스크립트**가 있어 새로고침 시 깜빡임(FOUC) 방지.
- 다크 토큰은 `theme.css`의 `html[data-theme="dark"]` / `html[data-theme="dark"] .ch-root`에서 중앙 오버라이드. 팀 컬러(`--team`/`--team-deep`)는 다크에서도 유지.
- 팀 컬러 틴트는 `color-mix(... var(--mix-base))` 패턴 사용 — `--mix-base`가 라이트=흰색 / 다크=어두운 표면으로 전환되어 틴트가 자연스럽게 어두워짐.
- 설정 페이지에서 ☀️라이트 / 🌙다크 / 💻시스템 선택.

### 설문 / 설문 응답 — `src/lib/surveysRepo.js` (Supabase-우선 + Mock 폴백)
- **Supabase 이관 완료**. `SurveyPage`(팬) + `AdminSurveys`(관리자)의 단일 데이터 소스. Supabase 설정 시 `surveys`/`survey_responses` + `surveys_view`(응답수·현재 사용자 참여여부 집계) 사용, 아니면 Mock.
- 팬 API: `listSurveys(teamId)`(대상 구단 team_id 또는 전체, **종료 3일 경과 시 팬 화면에서만 자동 숨김** — `SURVEY_HIDE_DAYS=3`, 데이터 삭제 아님·관리자/AI/통계엔 계속 포함), `submitResponse(surveyId, teamId, answers)`(1인 1회, DB `unique(survey_id,user_id)`).
- 관리자 API: `adminListSurveys`/`createSurvey`/`updateSurvey`/`closeSurvey`/`deleteSurvey` → Supabase CRUD(관리자 RLS `is_admin()`), Mock은 세션 배열.
- **중복 참여 방지**: 참여한 설문은 카드가 "참여 완료" 상태(비활성) 표시. Mock은 `fancluv_survey_participated` localStorage, Supabase는 `surveys_view.has_responded`.
- **목록/상세 라우트 분리(12차)**: 내부 `selectedId` state 폐기 → `SurveyPage`(목록, `/survey`) + **`SurveyDetailPage`(상세/참여, `/survey/:surveyId`)** 별도 컴포넌트·Route. 목록 카드 클릭·알림 "새 설문" 클릭 모두 `/survey/:surveyId`로 이동. 상세는 `getSurvey(teamId, surveyId)`로 단건 로드. 상세 폼(별점·객관식·주관식 Q1~Q4)은 고정 템플릿 유지(UI 불변), 응답은 `answers` jsonb로 저장. 제목/설명은 Supabase=DB값, Mock=locale 키 겸용.
- 상세 진입 시 상태 처리: 없거나 종료 → `survey.notFound`, 이미 참여 → "이미 참여" 안내, 제출 완료 → 완료 화면(모두 "목록으로 돌아가기"). **뒤로가기 버튼은 상세/참여 화면에만 표시**(목록 화면엔 없음) — 2차 UX 수정.
- 상태 필터(전체/진행 중/종료). 새 설문 알림 URL은 `/survey/:id`(DB 트리거 `0006`·Mock 동일).

### 상단 로고 동작 — 모든 `.ch-*` 헤더 공통
- 로그인 상태에서 **FANCLUV 로고 클릭 시 항상 구단 홈(`/club/:teamId`)으로 이동**. 로고는 `role="button" tabIndex={0}` + Enter/Space 키 지원(키보드 접근 가능).

### 팬 랭킹 아이콘 — `src/components/RankIcon.jsx`
- 팬 랭킹 페이지의 이모지(🥇🔥🏆📝 등)를 **모노크롬 SVG 라인 아이콘**으로 통일. `currentColor` 상속 → 팀 컬러(`--team-deep`)/다크·라이트 자동 대응.
- 메달(금/은/동, `MEDAL_COLORS`), 주간 통계·배지(opinions/comments/surveys/empathy), 팬 레벨(rookie/active/super/legend) 아이콘 제공.

### 공통 UI 프리미티브 (Phase 1 품질 개선)
재사용 컴포넌트는 `src/components/`, 스타일은 `src/components/components.css`(main.jsx에서 1회 import). 모두 토큰 기반이라 라이트/다크 자동 대응.
- **EmptyState** (`components/EmptyState.jsx`) — 아이콘+제목+메시지+선택적 CTA. 팬 의견/설문/뉴스/AI 인사이트/랭킹/내 활동/검색결과 빈 화면.
- **Skeleton** (`components/Skeleton.jsx`) — `Skeleton`/`SkeletonCard`/`SkeletonList`. 로딩 중 표시. 로딩 시뮬레이션은 `lib/useFakeLoading.js`(기본 550ms, 실제 API 연동 시 교체 지점).
- **Avatar** (`components/Avatar.jsx`) — 기본 이니셜 아바타, 향후 `src`(프로필 이미지) 지원 구조.
- **RankIcon** (`components/RankIcon.jsx`) — 팬 랭킹용 SVG 라인 아이콘 세트(위 참조).
- **SocialAuth** (`components/SocialAuth.jsx` + `.css`) — Google/Kakao/NAVER 소셜 로그인·회원가입 버튼(공식 로고 + 브랜드 컬러) + "또는" 구분선. 로그인/회원가입 화면 공용. `onSuccess/onError`로 라우팅·에러 위임.
- **전역 키보드 focus 링 (a11y)** — `components.css`에 `:focus-visible` 규칙. 버튼/링크/입력창에 팀 컬러(`var(--team, #2563EB)` 폴백) 아웃라인. 마우스 클릭 시엔 안 보이고 Tab 이동 시에만 표시.
- **Toast** — ❌ 제거됨(MVP). 전역 Toast Provider/Context는 삭제. 완료 피드백은 화면 전환·버튼 상태·목록 갱신으로 대체. (단, 의견 상세의 공유/신고용 로컬 `od-toast`는 별도 인라인 메시지로 유지)
- **NotFoundPage** (`NotFoundPage.jsx`) — `path="*"` 404. 로그인+팀 선택 시 구단 홈으로, 아니면 로그인으로.
- **상대 시간** (`lib/relativeTime.js`) — `relativeTime(hours, lang)` → 방금 전/N분 전/N시간 전/어제/N일 전. 의견 목록·상세·댓글에 사용.
- **활동 배지** (`lib/activityBadge.js`) — 점수 기반 🌱Rookie→⚽Active→🔥Super→👑Legend. 내 활동 레벨 카드에 사용.
- **페이지네이션 준비** — 팬 의견 목록은 `PAGE_SIZE=5` + "더 보기" 버튼(향후 무한 스크롤/페이지네이션 전환 대비).

### 인증 — `src/lib/auth.js` (Supabase-우선 + Mock 폴백 어댑터)
- **데모 계정 시드(중요, 34차 수정)**: `if (!isSupabaseConfigured) ensureSeed()` — **Mock 모드면 dev/프로덕션 빌드 모두** `admin@fancluv.kr`/`admin123`(role=admin), `fan@fancluv.kr`/`1234`(role=fan)를 시드. (Phase 1에서 dev 전용으로 막았던 걸 되돌림 → 프로덕션 Mock 빌드에서도 관리자 로그인 가능해야 한다는 요구사항.) 로그인 성공 시 `LoginPage.routeAfterAuth`가 `ADMIN_ROLES` 이면 `/admin`, 아니면 구단 홈/팀선택으로 이동. **실서비스는 Supabase 설정 → 데모 계정 미시드, `profiles.role='admin'` 기준**. `supabase.js`가 프로덕션+미설정 시 콘솔 경고로 Mock 모드를 알림.
- **Supabase 연동 완료(1차: Auth + Profile)**. `.env` 에 키가 있으면(`isSupabaseConfigured`) 실제 **Supabase Auth + `profiles` 테이블** 사용, 없으면 기존 **localStorage Mock 자동 폴백**(앱 안 깨짐). 설정법: [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
- `src/lib/supabase.js` — env 로 client 생성 + `isSupabaseConfigured` 감지. `src/contexts/AuthContext.jsx` — 비동기 세션/프로필 로드 + 라우트 가드 `loading` 게이트(`main.jsx`의 `RequireAuth`/`RequireAdmin`가 모드별 분기).
- **동기 캐시**: `getCurrentUser()`/`isAuthenticated()`/`isAdmin()` 는 여전히 동기. Supabase 모드에서는 AuthContext가 로드한 프로필을 auth.js 캐시(`cachedUser`)에 반영해 기존 화면 코드가 그대로 동작.
- 스키마: `0001_profiles.sql`(profiles + RLS + 트리거), `0003_nickname_and_find_account.sql`(닉네임 쿨다운 컬럼 + 아이디찾기 RPC), `0004_opinions_comments_likes.sql`(팬 의견/댓글/공감 + `opinions_view`), `0002_data_tables.sql`(설문 — 다음 단계 준비).
- `login`/`signup`/`logout`/`socialLogin`/`changePassword`/`changeNickname`/`requestPasswordReset`/`findAccountByHint` 등은 **async**(양 모드 지원). Google 소셜 = `supabase.auth.signInWithOAuth`, **Kakao/NAVER는 인터페이스만 유지(다음 단계)**.
- **닉네임 쿨다운(3개월/90일)**: Supabase는 `profiles.nickname_updated_at`, Mock은 `lastNicknameChangeAt` 기준. `nicknameChangeInfo()`/`changeNickname()`이 양 모드 공통 처리 → 프로필 수정 화면 연동.
- **아이디 찾기**: Supabase는 서버 RPC `find_account_by_hint`(SECURITY DEFINER, 마스킹 이메일 반환) → 클라이언트가 전체 유저를 조회하지 않음. Mock은 로컬 조회.
- **온보딩(9차)**: 소셜 신규 사용자(닉네임/나이대 미입력, 관리자 제외)는 `needsOnboarding()` → `/onboarding`(OnboardingPage, signup 디자인). 닉네임(필수·중복불가)·성별(선택)·나이대(필수) 입력 + 소셜 프로필 이미지 표시 → `completeOnboarding()` → 팀 선택. 기존 정보 있으면 건너뜀.
- **닉네임 중복 방지**: `isNicknameTaken(name,{exceptId,exceptEmail})` — 회원가입/온보딩/닉네임변경 공통. 본인 것은 허용, 중복 시 "이미 사용 중인 닉네임입니다.".
- **이메일 인증번호**: `issueEmailCode`/`confirmEmailCode`(async). Supabase는 Edge Function `send-email-code`(Resend, 미설정 시 devCode 폴백) + `email_codes` 테이블, Mock은 클라이언트 코드. **양 모드 모두 인증 완료해야 회원가입**. 미인증/탈퇴 계정 로그인 차단.
- **회원탈퇴(10차 — 완전 삭제)**: 설정 버튼 → 확인 모달(‘탈퇴합니다’ 입력) → `deleteAccount()`. Supabase는 **Edge Function `delete-account`**(service_role)가 profiles 익명화 후 `auth.admin.deleteUser(본인 JWT의 user.id)` → FK CASCADE로 개인 데이터 삭제, 콘텐츠 author는 NULL 익명화. 실패 시 비활성화 폴백. Mock은 레코드 삭제. → 세션 제거 후 로그인 이동. **본인 계정만 삭제**(삭제 id = 검증된 JWT). 스키마: `0010_account_hardening.sql`. 배포: `supabase functions deploy delete-account`(시크릿 불필요, 자동 주입).
- **온보딩 닉네임**: 소셜 임시 닉네임으로 채우지 않고 **빈칸으로 시작**(사용자가 직접 입력).
- localStorage 키(Mock 모드): `fancluv_users`(가입자 배열), `fancluv_session`(현재 로그인 email).
- 데모 시드 계정(Mock 모드 전용): **`fan@fancluv.kr` / `1234`** (닉네임 `민준`), `admin@fancluv.kr` / `admin123`.
- export 함수: `signup`, `login`, `logout`, `getCurrentUser`, `isAuthenticated`, `setSelectedTeam` 등 + `isAdmin()`(관리자 판정).
- **권한 체계(`ROLES`/`ADMIN_ROLES`)**: `fan`(기본) / `admin`, 그리고 예정 `superadmin`·`staff`(FANCLUV 직원)·`club_admin`(구단 관리자). 관리자 접근 판정은 `ADMIN_ROLES` 배열 한 곳으로 일원화 → 역할 추가 시 배열만 확장.
- **본인인증 체계(`VERIFICATION`)**: `unverified` / `email_verified` / `phone_verified`. MVP는 **이메일 Mock 인증만 동작**. 사용자 객체에 `isEmailVerified`/`emailVerifiedAt`/`isPhoneVerified`/`isPhoneVerifiedAt` 플래그 보관 → 향후 휴대폰 본인인증(PASS/NICE/KCB)을 그대로 얹을 수 있게 구조 선반영.
- ⚠️ 비밀번호 평문 저장 (MVP 한정). 실서비스 전 반드시 교체.

### 소셜 로그인 — `src/lib/oauth.js` + `auth.socialLogin()`
- **OAuth Provider 추상화**: `OAuthProvider` 베이스 + `GoogleProvider`/`KakaoProvider`/`NaverProvider`. `OAUTH_PROVIDERS` 배열에 등록 → 화면(SocialAuth)에서 순회 렌더. Provider 추가는 클래스 정의 후 배열에만 추가하면 됨.
- 각 Provider의 `signIn()`은 표준 프로필 `{ provider, providerUserId, email, nickname, profileImage }`(`normalizeProfile`)을 반환. **MVP는 Mock 프로필 즉시 반환**, 실서비스는 `signIn()` 내부만 `supabase.auth.signInWithOAuth({ provider })`로 교체.
- 프로필 이미지는 현재 **placeholder(data URI SVG)** — 실 provider 사진 URL로 대체 예정. `avatarUrl`에 저장되어 Avatar가 자동 표시.
- `auth.socialLogin(providerId)` 계정 매칭: ① provider+providerUserId 일치 → 로그인 ② 같은 이메일 기존 계정 → **자동 연결(account linking)** ③ 없으면 신규 소셜 계정 생성. 소셜 계정은 `password:null`, 이메일 인증 완료로 간주.
- 사용자 스키마에 `provider`/`providerUserId` 필드 추가(이메일 계정은 null).

**Supabase 실연동(4차)** — 설정법: [SOCIAL_LOGIN_SETUP.md](SOCIAL_LOGIN_SETUP.md).
- `SUPABASE_PROVIDER_CONFIG`(oauth.js): `google`·`kakao`=native, `naver`=custom.
- Supabase 모드 `socialLogin`: **Google·Kakao → `supabase.auth.signInWithOAuth({ provider })`**(native, ID/Secret은 Supabase 대시보드). **NAVER → Supabase 미지원 → 커스텀 OAuth**: `VITE_NAVER_CLIENT_ID` 있으면 NAVER authorize 로 리다이렉트(콜백 토큰교환은 Edge Function `naver-callback`), 없으면 설정 안내 메시지.
- **프로필 매핑**: `0007_social_login.sql` — `profiles.provider_user_id` 컬럼 추가 + `handle_new_user` 트리거가 OAuth 메타데이터(provider/provider_user_id/nickname/avatar_url)를 profiles에 매핑.
- **중복 이메일**: Supabase "Allow linking accounts with same email" 활성 시 자동 연결, 기본값은 안내/오류 표시(Mock은 자동 연결). 이메일 로그인/회원가입은 그대로 유지.
- **NAVER Edge Function(5차, 6차 강화)** — `supabase/functions/naver-callback/index.ts`(Deno): code→token 교환 → 프로필(email/nickname/profile_image/id) → **`profiles.email` 인덱스 조회**(`0008_profiles_email_index.sql`)로 기존 사용자 확인 → ①기존 naver/미설정 프로필이면 `provider_user_id` 연결(중복 프로필 미생성) ②다른 provider면 `?error=account_exists_<provider>` 안전 안내 ③없으면 `admin.createUser`(트리거가 profiles 생성) → `generateLink(magiclink)`로 세션 발급 후 앱 복귀(`state`에 origin 인코딩).
- 배포: **`supabase functions deploy naver-callback --no-verify-jwt`**(외부 NAVER 콜백엔 JWT 없음 → 검증 끄고 service_role로 서버 처리). 시크릿(서버 전용, 프론트 노출 금지): `NAVER_CLIENT_ID/SECRET`, `NAVER_REDIRECT_URI`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. 프론트는 `VITE_NAVER_CLIENT_ID`/`VITE_NAVER_CALLBACK_URL`만(공개 안전).

**소셜 로그인 UX(7차)** — `LoginPage`:
- 계정 충돌 콜백 `?error=account_exists_<provider>` → provider별 안내 문구(`login.conflict*`)를 폼 상단 `.auth-alert`(error)로 표시 후 `history.replaceState`로 쿼리 제거(새로고침 반복 방지).
- 소셜 로그인 성공(Mock onSuccess / Supabase 세션 감지) → `.auth-alert`(success) "환영합니다" 1초 표시 후 이동. Toast 미사용, 기존 로그인 디자인 유지.
- Redirect URLs 등록 필수 안내(dev/prod 예시 + 미등록 증상)는 [SOCIAL_LOGIN_SETUP.md](SOCIAL_LOGIN_SETUP.md).

### 다국어 — `src/contexts/LanguageContext.jsx` + `src/locales/{ko,en}.js`
- `useLang()` → `{ lang, setLang, t }`. `t(key, vars?)`는 `{token}` 보간 지원, 누락 시 ko 폴백 → raw key 폴백.
- localStorage 키: `fancluv_lang` (기본 `ko`).
- **ko/en 각각 911개 키** (현재 동기화됨).
- `NAV_KEYS`: 한글 내비 라벨 → 번역 키 매핑. **메뉴 배열은 한글을 canonical 키로 유지**(라우팅/active 판정용), 표시 라벨만 번역.

### 구단 데이터 — `src/teams.jsx`
- `TEAMS`: K리그1 12개 구단 (id, name, short, color, colorDeep).
- `MENU_ITEMS`: 상단 내비 8개 메뉴(한글 canonical). `menuPath(item, teamId)`로 경로 변환. `getTeam(id)`.
- `TeamEmblem`: SVG 축구공 엠블럼 컴포넌트 (구단 컬러 적용).

### 팬 의견 / 댓글 / 공감 — `src/lib/opinionsRepo.js` (Supabase-우선 + Mock 폴백)
- **Supabase 이관 완료(2차)**. `OpinionsPage`/`OpinionDetailPage`/`CreateOpinionPage`의 단일 데이터 소스. Supabase 설정 시 `opinions`/`comments`/`likes` 테이블 + `opinions_view`(작성자·공감수·댓글수 집계) 사용, 아니면 Mock(seeded 풀 + `opinionStore.js` localStorage).
- API(모두 async): `listOpinions(teamId)`(구단 필터), `getOpinionDetail(teamId,id)`(+연관), `createOpinion`, `listComments`/`addComment`, `getLikeState`/`toggleLike`(1인 1회, 취소 가능).
- 화면은 `useEffect`로 비동기 로드(로딩 상태 포함). **UI/디자인은 기존 그대로**. 작성 의견 상세 열람도 정상 동작.
- **댓글 입력(OpinionDetailPage)**: Enter = 바로 작성, Shift+Enter = 줄바꿈(한글 IME 조합 중엔 `isComposing` 가드로 무시) — 2차 UX 수정. 관리자 콘솔엔 댓글 입력창이 없어(숨김/삭제 관리만) 해당 없음.
- `src/opinionStore.js` = Mock 작성 의견 localStorage 백엔드(`fancluv_created_opinions`) — repo가 Mock 모드에서 사용.
- **URL query 필터(4차 탐색)**: `?category=<카테고리>` / `?keyword=<검색어>`를 `useSearchParams`로 읽어 카테고리 선택·검색어를 자동 적용(직접 접속/새로고침 대응). 홈의 인기 카테고리·주제, 사이드바 인기 카테고리·키워드 클릭이 이 필터로 연결됨. 기존 검색/카테고리/정렬 UI는 그대로.
- **홈(ClubHomePage) 탐색 링크(4차)**: 인기 의견 카드 클릭 → 해당 의견 상세(`/opinions/:id`), 인기 카테고리 → `/opinions?category=`, 인기 주제(키워드) → `/opinions?keyword=`, "전체 보기/더 보기" → 목록. 홈 데이터의 카테고리/키워드를 의견 페이지 분류와 일치시킴.

### 팀 뉴스 Provider 아키텍처 — `src/lib/news/` (실제 뉴스 연동 — Edge Function)
- **팀 뉴스 페이지는 `getTeamNews(clubId)`(서비스) 하나만 호출**한다. `TeamNewsPage`는 Supabase/Mock/외부를 직접 부르지 않고 Provider를 통해 뉴스를 받는다. **UI 불변.**
- **구조**
  - `src/lib/news/newsSources.js` — **12개 구단 뉴스 소스 등록**: `clubId·clubName·officialWebsite·newsUrl·rssUrl·instagramUrl·youtubeUrl`. 공식/SNS URL은 `clubLinks.js` 재사용, 구단별 `SOURCE_OVERRIDES`에 실제 뉴스 페이지(newsUrl)를 채움. **공개 RSS 없는 구단은 `rssUrl: null`**(공식 홈 스크래핑/ Mock 폴백).
  - `src/lib/news/providers/` — **`edgeNewsProvider`(실제 연동, 운영 기본)** = Edge Function `news-fetcher` 호출(`invokeFunction`, 재시도 3회). + `rss/official/newsApi`(클라이언트 직접, CORS로 보통 `[]` — 구조 유지) + `mockNewsProvider`(fallback 데모 뉴스).
  - `src/lib/news/teamNewsProvider.js` — 오케스트레이터: 우선순위 조합 + 표준화 + 10분 캐시 + 폴백.
- **Edge Function `news-fetcher`(Deno)** — 브라우저 CORS 우회. 요청 `{clubId, clubName, rssUrl, newsUrl, officialWebsite}` → **① `news_cache` 10분 캐시 확인 → ② RSS 파싱(우선) → ③ 공식 홈페이지 HTML 스크래핑(best-effort) → 표준화 → 캐시 저장**. 실패 시 마지막 캐시(stale) → 없으면 `items:[]`. RSS/Atom 정규식 파싱(title/link/description/pubDate/이미지 enclosure·media). `verify_jwt` 기본 유지(로그인 사용자만). 시크릿 불필요(SERVICE_ROLE 자동 주입). 캐시 테이블 `0019_news_cache.sql`(RLS on·공개 정책 없음 → service_role 전용).
- **활성 조건**: `VITE_NEWS_PROVIDER=edge` + Supabase 설정 시 `edgeNewsProvider` 사용. 미설정이면 저장 뉴스 + Mock 폴백(기존 동작 유지).
- **우선순위**: ① 실제 Provider(edge→rss→newsApi→official) → ② **관리자 저장 뉴스(`team_news`) 항상 병합** → ③ **Mock fallback**. **dedupe 시 관리자(stored) 뉴스가 앞 → 외부 뉴스가 관리자 공지를 덮어쓰지 못함(요구사항 6).** 관리자 뉴스는 `sourceUrl` 없음 → 내부 상세, 외부 뉴스는 `sourceUrl` 있음 → 원본 새 탭.
- **표준 뉴스 형태**: `{ id, clubId, title, summary, imageUrl, source, sourceUrl, publishedAt, category, isOfficial }` (+ 기존 UI 호환 필드 date/body/views/opinions/survey/important). `imageUrl` 은 `LazyImage`(지연 로딩·실패 시 구단 엠블럼 폴백)로 표시.
- **캐시/에러**: 클라이언트 `withCache('teamnews:'+clubId, 10m)` + Edge `news_cache`(10분). **실패 시 lastGood → Mock**. 각 소스 개별 catch → 페이지 안 깨짐(Loading/Error/Empty/Mock 폴백 모두 처리).
- **향후 확장**: 새 소스는 provider 하나 추가 후 `REAL_PROVIDERS`에 넣으면 됨. 뉴스 API 붙이면 `news-fetcher`에 fetch 분기 추가. 각 구단 실제 RSS 확인 시 `SOURCE_OVERRIDES.rssUrl`만 채우면 RSS 우선 사용.

### 뉴스 소스 관리 (관리자) — `src/lib/news/newsSourcesRepo.js` + `admin/AdminNewsSources.jsx` (33차)
- **관리자가 코드 수정 없이** 구단별 뉴스 소스를 관리. `/admin/news-sources`. Supabase `news_sources`(`0021`, 읽기=로그인·쓰기=관리자·상태기록=service_role) 또는 Mock(localStorage `fancluv_news_sources`).
- **관리 항목**: 공식 홈페이지 · **뉴스 URL(복수 `sources: [{label,url}]`)** · RSS URL · 사용여부(enable/disable) + **수집 상태**(마지막 성공/실패 시간·실패 횟수·마지막 테스트 결과).
- **유효 소스** = `getEffectiveSource(clubId)` = 코드 기본값(`newsSources.js` `SOURCE_OVERRIDES`, 12구단 실제 뉴스 URL) 위에 DB 오버라이드 병합. `teamNewsProvider`가 이걸로 사용여부·URL 참조(disabled면 실 Provider 건너뜀 → 저장뉴스+Mock).
- **상태 배지**(SVG 아이콘, 이모지 없음): 정상(check)·RSS 없음(rss)·연결 실패(alert)·비활성화(power). `statusOf(src)`.
- **연결 테스트**(`testSource`): Supabase는 `news-fetcher(force:true)` 실제 수집 → 개수/실패사유, Mock은 설정 기반 시뮬레이션(데모 개수). 결과=성공여부·뉴스개수·테스트시간·실패사유.
- **자동 실패 감지**(`FAILURE_THRESHOLD=3`): 수집/테스트 실패가 3회 이상이면 **관리자 알림 생성**("{구단} 뉴스 연결 실패 3회") + 관리 화면 상단 경고 배너. Supabase는 `news-fetcher`(service_role)가 매 수집 시 상태 기록 + admin 사용자에게 notifications insert, Mock은 `pushMockNotification`.
- **복수 URL**: `news-fetcher`가 `newsUrls` 배열을 순서대로 시도(RSS 우선 → 각 뉴스 URL). 울산(구단소식+리뷰/프리뷰)·포항(공지+보도자료) 등.

### 팀 뉴스 저장소 — `src/lib/newsRepo.js` (Supabase-우선 + Mock 폴백)
- **Supabase 이관 완료(3차)**. `AdminNews`(관리자) + Provider의 저장 뉴스 소스. Supabase 설정 시 `team_news` 테이블(제목·내용·team_id·category·image_url·author·status·is_important), 아니면 Mock. `listNews(teamId)`는 Supabase `team_news`(published) 또는 Mock 관리자 등록 뉴스를 반환(팬 데모 뉴스는 `mockNewsProvider`로 분리됨).
- 팬 API: `listNews(teamId)`(구단 필터, 최신순/중요 뉴스 정렬). 관리자 API: `adminListNews`/`createNews`/`updateNews`/`deleteNews`(관리자 RLS `is_admin()`). SQL: `0006_news_notifications.sql`.
- **키워드 필터(4차 탐색)**: 키워드 칩 클릭 → `?keyword=` query 로 제목·요약·본문에 해당 키워드가 포함된 뉴스만 표시(활성 칩 ✕로 해제). AI 인사이트 키워드 클릭도 `/club/:id/news?keyword=<kw>`로 이동. 직접 URL 접속/새로고침 대응(`useSearchParams`).
- **구단 바로가기(`src/clubLinks.js`)**: 12개 구단별 공식 홈페이지/티켓/Instagram/YouTube 실제 링크(`CLUB_LINK_CHANNELS`). **X(Twitter) 제거**, 모두 새 창(`target=_blank rel=noopener`). 특정 채널 미지정 시 `getClubLinks()`가 공식 홈페이지로 fallback. 라벨은 locale(`news.link*`).

### 알림 — `src/lib/notificationsRepo.js` + `components/NotificationBell.jsx`
- **Supabase 이관 완료(3차) + 실동작 완성(11차)**. 벨에 안읽음 배지 + 목록 + 개별/전체 읽음. Supabase 설정 시 `notifications` 테이블, 아니면 Mock(localStorage, 시드 포함).
- **알림 생성은 DB 트리거**(`0006`·`0011`, SECURITY DEFINER): 댓글/공감(의견 작성자에게), 새 설문/새 뉴스(대상 구단 팬에게), **관리자 공지 `notice`**(`0011`의 `notices` 트리거 → 대상/전체 팬). Mock 모드는 각 repo가 `pushMockNotification`으로 데모 생성(모두 이동 URL 포함).
- **알림 클릭 → 관련 페이지 이동 + 자동 읽음**: 댓글/공감 → 의견 상세(`/club/:id/opinions/:oid`), 새 설문 → 설문 목록, 새 뉴스 → 뉴스 상세(`/news/:nid`). **관리자 공지(`notice`)는 이동 페이지가 없어 벨에서 모달로 본문 표시**. 읽지 않은 알림은 왼쪽 강조 바 + 볼드 + 점으로 강조.
- 클라이언트 조회/읽음: `listNotifications`/`unreadCount`/`markRead`/`markAllRead`(본인 알림만 RLS). **관리자 공지 발송**: `createNotice({title,body,teamId})`(Supabase=`notices` insert→트리거, Mock=로컬 알림) — 관리자 대시보드 "공지 발송" 패널에서 호출.

### 신고 — `src/lib/reportsRepo.js` + `components/ReportModal.jsx` + `admin/AdminReports.jsx`
- **신고 접수/관리 완성(11차)**. Supabase 설정 시 `reports` 테이블(`0011`, RLS: 로그인 사용자 본인 명의 insert / 관리자만 select·update·delete), 아니면 Mock(localStorage, `MOCK_REPORTS` 시드).
- **신고 모달(ReportModal)**: 의견 상세 🚩버튼 → 사유 7종(욕설/광고/허위/음란/개인정보/도배/기타) 라디오, **기타 선택 시 직접 입력 textarea**. `submitReport({targetType,targetId,targetExcerpt,reason,detail})` → 저장 항목: 대상·신고자·사유·기타내용·시간·상태(pending). 사유 코드는 locale `report.reason.<code>`.
- **관리자 신고 관리(AdminReports)**: 상태 필터(전체/미처리/처리됨), 목록 + **상세 보기 패널**(대상·신고자·사유·기타내용·신고일·상태), 조치 — 게시글/댓글 **숨김·삭제**(`moderateTarget`: Supabase는 opinions/comments status='hidden' 또는 delete), **처리 완료**(`resolveReport`), 신고 삭제(`deleteReport`). 대시보드 "최근 신고"도 사유 라벨 번역 반영.

### AI 팬 인사이트 — `src/lib/ai/analyzeFanInsights.js` + Edge Function
- **OpenAI 기반 실제 분석(8차)**. OpenAI 호출/키는 **Edge Function `analyze-insights`**(서버)에서만 — 프론트 미노출. 클라이언트 `analyzeFanInsights.js`는 함수 호출(`runAnalysis`)·결과 조회(`getLatestInsight`)만.
- 분석 항목: 감정(긍/중/부%)·키워드·카테고리별 불만·만족도 요약·핵심 이슈·우선 개선 추천 → `ai_insights` 테이블(`0009_ai_insights.sql`)에 저장(core 컬럼 + `details` jsonb).
- **관리자 대시보드**에 "AI 팬 인사이트 분석" 패널(구단 선택 + 실행). 의견 30개 미만이면 부족 안내. Edge Function은 요청자 admin role 재확인(verify_jwt 유지).
- **AIInsightsPage**: 최신 `ai_insights` 로드 → 표시. 결과 없으면(Supabase) "의견 30개 이상 모이면 분석 시작" Empty State. **Mock 모드**는 별점/카테고리 기반 로컬 간이 분석으로 폴백(앱 유지). UI 기존 그대로.
- **에러 처리(검증 강화)**: Edge Function은 처리된 실패를 `200 + {ok:false, code}`(unauthorized/forbidden/openai_not_configured/insufficient/openai_failed/save_failed)로 반환 → 관리자 화면이 code별 구체 메시지 표시. 배포 검증 체크리스트·문제해결은 [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

### 통합 상태 대시보드 — `src/lib/admin/integrationHealthRepo.js` + `admin/AdminSystemStatus.jsx` (34차)
- **외부 서비스 8종 상태를 운영자가 한눈에**. `/admin/system`. Supabase `integration_health`/`integration_logs`(`0022`, 관리자 RLS) 또는 Mock(localStorage).
- **서비스**: Supabase Database · Supabase Auth · Edge Functions · Team News · League API · OpenAI API · Email Service · Push Notification.
- **점검 방식**: 서버 의존(db/auth/edge/openai/email)은 **Edge Function `health-check`**(관리자 인증 + DB 핑·OpenAI models 핑·Resend 키 확인, 비밀키 미반환)로 1회 조회. Team News/League 는 실제 파이프라인(`getTeamNews`/`getStandings`) 응답으로, Push 는 브라우저 `Notification.permission` 으로 점검. **Mock 모드는 서버 서비스=비활성화**, 뉴스/리그=정상(Mock), Push=권한 기반.
- **상태 배지**(SVG 아이콘, 이모지 없음): 정상(check)·지연(clock, >1500ms)·오류(alert)·비활성화(power). 각 카드에 **응답시간(ms)·마지막 성공/실패 시간·연결 테스트 버튼**(성공여부·ms·오류사유). "전체 테스트" 버튼.
- **자동 장애 감지**(`FAILURE_THRESHOLD=3`): 같은 서비스 연속 3회 실패 → **관리자 알림 생성**("{서비스} 연속 3회 이상 연결 실패") + 상단 경고 배너. Supabase는 admin notifications insert, Mock은 `pushMockNotification`.
- **시스템 로그**: 오류/지연 발생 시 `integration_logs`에 기록, 최근 **100개**(시간·서비스·상태·오류 내용) 표로 조회.

### 관리자 콘솔 — `src/admin/`
- `RequireAdmin` 가드로 보호. `AdminLayout` + 중첩 라우트(대시보드/회원/의견/설문/뉴스/신고/설정).
- 데이터는 `adminData.js`의 Mock. 댓글 관리 기능 포함, 토스트 없이 인라인 피드백.
- **회원 관리(AdminMembers) — 운영자 전용 상세 정보(22차)**: 회원 테이블은 요약(닉네임·이메일·가입일·응원팀·인증·상태)만, 행별 **"상세" 버튼 → 인라인 상세 패널**에서 **Member ID·닉네임·이메일·가입일·로그인 방식·응원팀·성별·나이대·이메일 인증 여부·계정 상태·마지막 활동일** 표시. `MOCK_MEMBERS`에 `provider`/`gender`/`ageGroup`/`lastActiveAt` 보강. 상세 정보는 **`RequireAdmin` 가드 내부에서만 렌더** → 일반 사용자 화면·URL 직접 접근으로는 노출 안 됨. 패널은 신고 상세와 동일한 `adm-report-dl` 토큰 재사용(라이트/다크 자동). **Member ID·로그인 방식·마지막 활동일 등 상세 식별 정보는 일반 사용자 설정/프로필 화면엔 절대 표시하지 않음.**
- **대시보드 고도화**(`AdminDashboard.jsx` + `AdminCharts.jsx`): KPI 10종, 구단별 현황 테이블(만족도·참여율 미니바), 최근 활동(가입/의견/댓글/설문/신고), 차트(라인·바·도넛·감정 누적바 — 순수 SVG, 라이브러리 없음), 빠른 작업, **AI 인사이트 분석 실행 패널**, **AI 리포트 PDF 생성 패널**.
- **대시보드 전체가 실집계로 전환(24차) — `src/lib/admin/adminStats.js`**: `getAdminDashboard()` 하나가 KPI·구단별·최근 활동·차트를 모두 반환. Supabase 설정 시 **RPC `admin_dashboard_stats(days)` 1회 호출**(`0013_admin_dashboard_stats.sql`, `SECURITY DEFINER`+`is_admin()`)로 서버 집계, 아니면 결정적 시드 Mock. **비관리자면 빈 통계(0)** 반환(이중 방어). `withCache('admin:dashboard')` 30초, `refreshAdminDashboard()`로 무효화. → 이전 "구단별/최근/차트는 Mock" TODO 해소.
- **관리자 CRUD가 Supabase에 반영**: 설문(`surveysRepo`)·뉴스(`newsRepo`)·공지(`noticesRepo`)·리포트(`clubReportsRepo`)·고객(`customersRepo`)은 관리자 RLS(`is_admin()`)로 서버 반영. `/admin` 접근은 `RequireAdmin`+`isAdmin()`(profiles.role) → 일반 사용자 차단.
- **CSV 내보내기 — `src/lib/admin/csv.js`**: `exportCsv(baseName, columns, rows)` = `buildCsv`+`downloadCsv`. UTF-8 BOM(엑셀 한글 깨짐 방지) + 파일명 날짜 접미사. 회원/의견 등 관리자 목록 다운로드에 사용.

### 관리자 공지사항 — `src/lib/noticesRepo.js` + `admin/AdminNotices.jsx` (25차)
- **공지 관리 페이지(AdminNotices)** + **사용자 노출(홈 배너 · 알림)**의 단일 소스. Supabase `notices` 테이블(`0014_admin_ops.sql`, insert 트리거가 대상 팬에게 `notice` 알림 broadcast) 또는 Mock(localStorage, 시드 2건).
- 공지 필드: 제목·내용·**중요 공지 여부**(`is_important`, `0015_notice_important.sql`)·노출 시작/종료일·**상단 고정(pinned)**·숨김. 사용자에겐 `listActiveNotices(teamId)`가 숨김 제외 + 노출 기간 내 + (전체 또는 내 구단) 공지를 **고정→중요→최신** 정렬로 반환.
- 관리자 API: `adminListNotices`/`createNotice`/`updateNotice`/`setNoticeHidden`/`setNoticePinned`/`deleteNotice`. **공지는 이동 페이지가 없어 알림 클릭 시 벨에서 모달로 본문 표시**(NotificationBell). `createNotice`가 숨김이 아니면 알림 생성(Mock은 `pushMockNotification`).

### 운영자 내부 메모 — `src/lib/adminNotesRepo.js` (25차)
- 회원·의견·댓글·신고·고객 각 대상에 **운영자만 보는 메모**(예: "반복 신고 사용자"). `listNotes/addNote/deleteNote(entityType, entityId)`. **일반 사용자에게 절대 미노출**: Supabase `admin_notes` RLS `is_admin()`(`0014`) + 모든 API `isAdmin()` 사전검사(이중 방어). `AdminNoteBox.jsx`(공용 UI 컴포넌트)로 각 관리자 상세 패널에 삽입.

### AI 리포트(PDF) 생성 — `src/lib/ai/report/` (26차)
- **관리자용 AI 팬 인사이트 PDF 리포트**. 진입점 `report/index.js`: `generateAiReport({clubId, periodType, t})`(최신 인사이트로 즉시 생성) / `generateReportPdfFromDoc(doc, t)`(저장된 리포트 문서로 생성).
- `reportModel.js` — `getLatestInsight`(`ai_insights`) + `getAdminDashboard`(집계)를 모아 PDF가 그릴 정규화 모델 생성. **기간 유형 `REPORT_PERIODS`**(current/monthly/quarterly/yearly) → 표지 라벨·파일명 토큰(YYYY-MM / YYYY-Qn / YYYY) 분기. 향후 기간별 데이터는 `buildReportModel` 내부만 교체.
- `generatePdf.js` — jspdf + html2canvas(package.json 의존성 추가)로 표지·감정·키워드·카테고리·만족도·개선제안·KPI 렌더. **content엔 집계/요약만 담겨 개인정보(이메일/닉네임/원본 의견) 미포함.**

### 구단 전달용 리포트 관리 — `src/lib/admin/clubReportsRepo.js` + `admin/AdminReportDocs.jsx` (27~28차)
- 운영자가 AI 인사이트를 **스냅샷해 리포트 초안 생성 → 검토·수정 → 승인 → 구단 전달**하는 워크플로우. Supabase `club_reports`/`report_deliveries`(`0016_club_reports.sql`·`0017_report_delivery.sql`) 또는 Mock.
- 상태 `REPORT_STATUSES` = draft/review/approved/delivered. API: `adminListReports`/`createReport`(구단+기간 선택, 인사이트 없으면 `no_insight`)/`getReport`/`updateReport`(제목·본문 수정)/`setStatus`/`deliverReport`/`deleteReport`/`listDeliveries`.
- **전달(`deliverReport`)은 승인된 리포트만**. 전달 방식 `DELIVERY_METHODS` = pdf/email/link(이메일·링크는 구조만, 실전송 미구현) + 전달 메모 → 상태 delivered + 전달 이력(`report_deliveries`) 기록. **content 스냅샷은 집계 필드만**(개인정보 제외). `operatorComment`/`finalSummary`는 운영자가 검토·수정.

### B2B 고객(구단) 관리 — `src/lib/admin/customersRepo.js` + `admin/AdminCustomers.jsx` (30차)
- 계약 구단(고객)의 **상태·플랜·담당자·계약 이력** 관리. Supabase `customers`/`customer_contract_history`(`0018_customers.sql`) 또는 Mock(시드 2건: FC서울 active/professional, 울산 pilot/basic).
- 상태 `CONTRACT_STATUSES` = pilot/negotiating/active/ended/terminated, 플랜 `SERVICE_PLANS` = basic/professional/enterprise. API: `adminListCustomers`/`createCustomer`/`updateCustomer`/`deleteCustomer` + 계약 이력 `listHistory`/`addHistory`. **상태·플랜 변경 시 이력 자동 기록**(`autoHistory`). 운영자 메모는 `adminNotesRepo`(entityType `customer`) 재사용. 모든 API `isAdmin()` 방어.

### 실시간 데이터 아키텍처 / 캐시 (13차)
- **캐시** — `src/lib/cache.js`: `withCache(key, fetcher, ttl=30000)` 인메모리 TTL 캐시(기본 30초). 진행 중 Promise 재사용, 실패 시 캐시 미저장. `invalidate(prefix)`/`clearCache()`. 순위/일정/홈 인기/관리자 KPI에 사용.
- **League Provider 아키텍처 — `src/services/league/`** (K리그 순위/일정/결과, 실제 연동 — Edge Function)
  - **구조**: `mockLeagueProvider.js`(데모) · `apiLeagueProvider.js`(클라이언트 직접 API, 공개키/키없는 소스용) · **`edgeLeagueProvider.js`(실제 연동, 운영 기본 — Edge Function `league-fetcher` 호출)** · `leagueProvider.js`(**facade**: Provider 선택 + 캐시 + 폴백). 화면은 `src/lib/matchRepo.js`(표시 어댑터)만 호출.
  - **Provider 선택(요구사항 1/2)**: `VITE_LEAGUE_PROVIDER=edge`(운영 권장) / `LEAGUE_PROVIDER=api`(직접) / `mock`(기본). 미지정 시 edge 가능하면 edge → api base 있으면 api → mock. facade 우선순위: **edge → api → mock**.
  - **Edge Function `league-fetcher`(Deno)**: 요청 `{resource:'standings'|'fixtures', teamId?}` → **① `league_cache` 캐시 확인(순위 5분/경기 5분) → ② 외부 API 호출(키는 서버 시크릿 `LEAGUE_API_KEY`) → ③ 표준 정규화 → 캐시 저장**. 실패 시 stale 캐시 → 없으면 `{ok:false}`(클라이언트 Mock 폴백). 벤더 무관 normalizer(rank/position, team.name, goals.for 등 폭넓게 수용) + **팀명→clubId 매핑**(CLUB_ALIASES). `verify_jwt` 기본 유지. **API 키 프론트 미노출**(서버 시크릿). 캐시 테이블 `0020_league_cache.sql`(RLS on·service_role 전용).
  - **표준 형태(요구사항 4)** — 외부 계약(정규화): 순위 `{ rank, clubId, teamName, played, wins, draws, losses, goalsFor, goalsAgainst, goalDifference, points, form }`, 경기 `{ id, homeClubId, awayClubId, homeTeamName, awayTeamName, matchDate, matchTime, stadium, status, homeScore, awayScore, round, competition }`. **내부 Provider 표준**(화면용): 순위 `{rank, teamId, teamName, played, win, draw, loss, goalsFor, goalsAgainst, goalDiff, points, form}`, 경기 `{id, date, kickoff, homeTeamId, awayTeamId, ..., status, homeScore, awayScore, finished, round, competition}`, fixtures `{next, live, upcoming[], recent[]}`. `edgeLeagueProvider`가 외부계약→내부표준 매핑 → **화면 코드 불변.**
  - **벤더 교체(요구사항 2)**: API-Football / Sportmonks / Football-data / K리그 공식 / 자체 수집 등 어떤 소스든 `league-fetcher`의 `normalizeStandings`/`normalizeMatch`(또는 `LEAGUE_API_VENDOR` 분기)만 맞추면 됨. 특정 벤더 응답이 앱에 퍼지지 않음(정규화 경계 = Edge Function).
  - **캐시/폴백(요구사항 8/10/11)**: 클라이언트 `withCache` 순위 5분/경기 5분 + Edge `league_cache`(동일 TTL). 실패 시 **lastGood → Mock**. 사용자에겐 에러 대신 폴백 데이터 자연 노출. `refreshLeague(teamId)`로 무효화.
  - **연동 화면(요구사항 5~9)**: **MatchCenterPage**(순위표·일정·결과, 스켈레톤/Error/EmptyState/새로고침) + **ClubHomePage**(다음/최근 경기·리그 순위·시즌 성적). 둘 다 `matchRepo`→facade 경유라 **데이터 소스만 바뀌고 UI 불변**.
- **홈 인기 콘텐츠** — `src/lib/homeRepo.js`: `getHomeContent(teamId)`가 Supabase `opinions_view` 1회 조회로 **인기 의견(공감순)·인기 카테고리(집계)·트렌딩 키워드(사전 매칭)** 계산, 실패/미설정 시 Mock. 캐시 30초. **ClubHomePage**가 비동기 로드(스켈레톤) — 클릭 네비게이션(의견 상세/카테고리·키워드 필터)은 유지.
- **AI 키워드 선택** — `AIInsightsPage`: 키워드 클릭 시 **팬 의견 / 뉴스 선택 모달**(`.ai-kwmenu`) → `/opinions?keyword=` 또는 `/news?keyword=`로 이동(두 페이지 모두 query param 필터 적용).

### 계정 복구 / 프로필 / 정보 페이지
- **FindIdPage / FindPasswordPage** (`RecoveryPages.css`) — 아이디·비밀번호 찾기 (Mock).
- **VerifyEmailPage** — Mock 이메일 인증 흐름 (`AccountPages.css`).
- **ProfileEditPage / ChangePasswordPage** — 프로필 수정·비밀번호 변경.
  - **회원정보 노출 최소화(22차)**: 프로필 수정 화면은 **수정 기능 중심(프로필 이미지 + 닉네임)**만 유지 → **활동 통계 카드 제거**(관련 `profileStatsRepo` 로드 로직도 제거). 설정 페이지 **프로필 정보 카드는 이메일·가입일·성별·나이대만** 노출(Member ID·로그인 방식·다음 닉네임 변경 가능일 등 상세 식별 정보 미표시). 상세 회원 정보는 운영자 회원 관리에서만 확인.
  - **응원팀 카드는 유지**: 읽기 전용 회원정보가 아니라 **구단 변경 기능 카드**(현재 팀 엠블럼·이름 + "구단 변경" 버튼)라 설정 화면에 그대로 둠.
- **InfoPage** (`InfoPage.jsx` + `infoContent.js`) — `page` prop으로 소개/개인정보/약관 렌더.

### 브랜드 로고 / PWA 아이콘 — `public/`
- **로고 리프레시(23차)**: 브랜드 소스 로고를 `FANCLUV logo.jpeg`(루트, 금색 FC-하트 모노그램·검정 배경 820×808)로 교체. 헤더/로그인 화면의 **"FANCLUV" 로고는 이미지가 아니라 텍스트 워드마크**(`.ch-logo` 등 타이포그래피)라 로고 파일 교체와 무관하게 그대로 렌더된다.
- 로고 **이미지가 실제 소비되는 지점 = PWA/파비콘 아이콘**. 새 로고에서 `public/icon-192.png`·`public/icon-512.png`를 재생성(정사각 크롭 후 리사이즈). `public/logo.png`도 새 로고로 갱신(1.1MB→약 53KB). manifest `theme/background_color #0e0e0e`가 로고의 검정 배경과 조화.
- 아이콘 참조처: `manifest.webmanifest`(icon-192/512), `index.html`의 `apple-touch-icon`(/icon-192.png), `lib/browserPush.js`(알림 아이콘 /icon-192.png), `sw.js`(캐싱). 브라우저 탭 파비콘은 별도의 벡터 마크 `public/favicon.svg`(보라 #863bff)로, 이번 교체에서 건드리지 않음(향후 통일 여지).

## 4. 완료된 작업 (git 히스토리, 최신 → 과거)

**운영 준비 · 실연동 시리즈 (최신)**

0. 통합 상태 대시보드 + 관리자 로그인 수정 — 34차: `AdminSystemStatus`(`/admin/system`) + `integrationHealthRepo` + `health-check` Edge Function + `integration_health`/`integration_logs`(`0022`). 8개 외부 서비스 상태·응답시간·연결테스트·연속3회 실패 알림·시스템 로그(100개). **관리자 로그인 수정**: 데모 계정 시드를 Mock 모드 전체(프로덕션 빌드 포함)에서 하도록 되돌림 → `admin@fancluv.kr`/`admin123` 로그인→`/admin` 정상 ("Add integration health dashboard and fix admin login").
0. 뉴스 소스 관리(관리자) — 33차: `AdminNewsSources`(`/admin/news-sources`) + `newsSourcesRepo` + `news_sources`(`0021`). 구단별 뉴스 URL(복수)/RSS/사용여부 관리·연결 테스트·상태 배지(SVG)·실패 3회 자동 알림. `news-fetcher` 확장(newsUrls 배열·force·상태기록·admin 알림), 12구단 실제 뉴스 URL 기본값. 기존 Provider/Mock 폴백 유지 ("Add admin news source management").
0. 실제 K리그 데이터 연동 — 32차: Edge Function `league-fetcher`(외부 API→표준 정규화·순위/경기 5분 캐시·API 키 서버 보관·벤더 무관 normalizer) + `edgeLeagueProvider`(`VITE_LEAGUE_PROVIDER=edge`) + `league_cache`(`0020`) + facade edge 모드 + form/round/competition 표준 필드. UI 불변, Mock 폴백 유지 ("Implement production K League integration").
0. 실제 팀 뉴스 연동 — 31차: Edge Function `news-fetcher`(RSS/공식홈 스크래핑·10분 캐시·CORS 우회) + `edgeNewsProvider`(`VITE_NEWS_PROVIDER=edge`) + `news_cache`(`0019`) + 12구단 소스 등록(`SOURCE_OVERRIDES`) + 관리자 뉴스 우선 병합(덮어쓰기 방지). UI 불변, Mock 폴백 유지 ("Implement production team news integration").
0. Production Readiness 2단계 — Error Boundary·404/500·LazyImage·코드 스플리팅·Skeleton·Retry(`retry.js`/`edgeFunctions.js`)·Analytics(`services/analytics`)·Logger(`logger.js`)·A11y ("Production readiness phase 2").
0. Production Readiness 1단계 — Mock 격리(데모계정 dev 전용)·환경변수 정리·RLS/보안 감사·Edge Function 점검·캐시·에러처리·콘솔 정리 ("Production readiness phase 1").

**관리자 운영 콘솔 확장 시리즈**

0. B2B 고객 관리 — 30차: `AdminCustomers` + `customersRepo`(customers/customer_contract_history, `0018`). 계약 상태·플랜·담당자·이력 CRUD + 상태/플랜 변경 시 이력 자동기록, 운영자 메모 재사용 (`7801fe2` Add B2B customer management).
0. 실 팀뉴스 Provider 아키텍처 — 29차: `src/lib/news/` provider(rss/newsApi/official 구조 + mock fallback) + `teamNewsProvider` 오케스트레이터(우선순위·표준화·5분 캐시·폴백), `newsRepo` 정리 (`1265f20` Add real team news provider architecture).
0. 리그 데이터 Provider 아키텍처 — 29차: `src/services/league/`(mock/api/facade + 5분 캐시 + lastGood/Mock 폴백), `matchRepo` 표시 어댑터화, `ClubHomePage` 경기/순위 연동, `.env` `VITE_LEAGUE_API_BASE`/`LEAGUE_PROVIDER` (`a7205ba` Add league data provider architecture).
0. 리포트 전달(delivery) 관리 — 28차: `AdminReportDocs` 전달 워크플로 + `clubReportsRepo.deliverReport`/`listDeliveries`(방식 pdf/email/link·메모·이력), `report_deliveries`(`0017`) (`90b8949` Add report delivery management workflow).
0. 구단 전달용 리포트 관리 — 27차: `AdminReportDocs` + `clubReportsRepo`(AI 인사이트 스냅샷→초안→검토→승인, `club_reports` `0016`) (`20d12d9` Add admin report management workflow).
0. AI 리포트(PDF) 생성 + 알림전용 공지(중요 플래그) — 26차: `src/lib/ai/report/`(reportModel·generatePdf, jspdf/html2canvas), 대시보드 리포트 생성 패널, `0015_notice_important` (`263e850` Add AI report generation and notification-only admin announcements).
0. 관리자 운영 도구 강화 — 25차: 공지 관리(`AdminNotices`+`noticesRepo`)·운영자 내부 메모(`AdminNoteBox`+`adminNotesRepo`)·CSV 내보내기(`lib/admin/csv.js`), AdminMembers/Opinions/Reports 개선, `0014_admin_ops` (`9a6ba30` Enhance admin operation tools).
0. 실제 관리자 대시보드 통계 — 24차: `src/lib/admin/adminStats.js` = 대시보드 전체(KPI 10종·구단별·최근·차트)를 RPC `admin_dashboard_stats`(`0013`) 1회 집계 or Mock, 30초 캐시·비관리자 빈통계 (`e2df910` Implement real admin dashboard statistics).

**Supabase 백엔드 연동 시리즈**

0. 브랜드 로고 리프레시 — 23차: 소스 로고를 `FANCLUV logo.jpeg`로 교체 → `public/icon-192/512.png`·`public/logo.png` 재생성(헤더/로그인 로고는 텍스트 워드마크라 불변, favicon.svg는 유지). PROJECT_CONTEXT 최신화 동반 (`Update project context and refresh FANCLUV logo`).
0. 회원정보 노출범위 정리 — 22차: 일반 사용자 설정/프로필에서 상세 회원 식별정보(Member ID·로그인 방식·다음 닉네임 변경일 등) 미노출 확정, 프로필 수정 화면 **활동 통계 카드 제거**(수정 기능만), 운영자 **회원 상세 패널**에 Member ID·로그인 방식·성별·나이대·마지막 활동일 등 11개 필드 추가(`RequireAdmin` 가드 내부 전용). 응원팀 카드는 구단 변경 기능으로 유지 (`978eec7` Restrict detailed member info to admin).
0. 프로필 정리·로고 PWA 아이콘 — 21차: 실제 로고(`FANCLUV logo.png`)로 `icon-192/512.png` 생성(any+maskable, manifest·apple-touch·SW·알림 아이콘 갱신, theme/bg `#0e0e0e`). 닉네임 제한 안내 "닉네임은 90일마다 변경할 수 있습니다."(날짜 미표시). 설정 프로필 정보 카드 = 이메일·가입일·성별·나이대만(로그인방식·응원팀·다음변경일 제거).
0. PWA·브라우저 알림 — 20차: `manifest.webmanifest`(standalone·theme #863bff·아이콘 `icon.svg` 192/512/maskable) + `public/sw.js`(앱셸 캐싱·오프라인 fallback·업데이트 대응) `registerSW`(PROD 전용). 설정에 **브라우저 알림 카드**(권한 허용/차단/미요청 + 토글 + 테스트 알림) `browserPush.js`, 알림 설정 영속화 `notifyPrefs.js`(브라우저/이메일/설문/뉴스/댓글/공감/공지). 향후 이벤트 연결 지점 `pushEventNotification(type)`(comment/like/survey/news/notice)
0. 프로필 관리 고도화 — 19차: 아바타 업로드/미리보기/교체/기본복원(형식 jpg·jpeg·png·webp/5MB 검증) + **1:1 크롭(원형 미리보기)** `AvatarCropper`, 저장소 추상화 `avatarStorage`(Supabase Storage `avatars` 버킷=`0012` / Mock dataURL), 활동 통계 `profileStatsRepo`(Supabase count/Mock), 설정 프로필정보(이메일·가입일·로그인방식·응원팀·성별·나이대)·다음 닉네임 변경일·계정 보안 기기정보 `deviceInfo`
0. 표 액션컬럼·카드 정렬 통일 — 18차: 관리자 액션컬럼 고정폭(184)·설문 질문 div화·팬랭킹 사이드 카드 간격
0. UI 정렬·아이콘 통일 — 17차: OS 이모지 전면 제거→공용 SVG 아이콘(`Icon.jsx` 확장, EmptyState는 `iconName` prop), 관리자 액션버튼 정렬 통일(min-width 72·height 32·세로중앙), 설문 legend 정렬, 아이콘+텍스트 `ic-txt`(flex/align-center) 유틸, 감정/배지 아이콘 SVG화(`activityBadge` icon 필드), locale 내 이모지 제거
0. 닉네임 정책 강화 — 16차: 실시간 검증(형식+중복) `useNicknameCheck`/`NicknameStatus`, 규칙 일원화 `nicknameValidation.js`(완성형 한글·영문·숫자만, 공백/특수문자/자음모음/한자/이모지 불가, 한글 8자·총 12자, 예약어 `reservedNicknames.js`·금칙어 `bannedWords.js`), 회원가입·온보딩·프로필수정 3폼 적용(사용가능/중복 안내·저장버튼 비활성)
0. 디테일 개선 — 15차: 구단 공식 링크 실 URL(4채널·SVG·새창), 이모지→SVG(`Icon.jsx`), 팀 색상 보정(서울/포항/부천 레드 구분·대전 그린), 팀명 다국어(`teamName(team,lang)`·`nameEn`), 공감/댓글 localStorage 영속화, 댓글 줄바꿈(`white-space:pre-wrap`), 설문 카드 정렬, 환영 이메일(`welcomeEmail.js`+`send-welcome-email`), 홈 진행중설문 클릭→상세
0. 실시간 데이터 Provider 구조 + 캐시 — 14차 (`cache.js`·`matchRepo`·`leagueProvider`·`homeRepo`·AI 키워드 선택)
0. 링크/탐색 개선 — 13차 (구단 공식 링크 `clubLinks.js`·키워드/카테고리 query 필터·홈 카드 이동, `6e114e3`)
0. 설문 상세를 별도 Route(`/survey/:surveyId`)로 분리 — 12차 (`SurveyDetailPage`, `a6e1aeb`)
0. 알림 실동작 + 관리자 공지 + 신고 접수/관리 완성 — 11차 (`reports`·`notices` = `0011`, `749276d`)
0. 설문/댓글/랭킹 2차 UX 개선 (`c349434`)
0. 안전한 회원탈퇴 Edge Function(`delete-account`, service_role) — 10차 (`ea49ca8`)
0. 온보딩·본인인증·회원탈퇴 개선 — 9차 (`6724e90`)
0. AI 인사이트 배포 흐름 검증 (`34cd414`)
0. 실제 AI 팬 인사이트 분석(OpenAI Edge Function `analyze-insights`) — 8차 (`8efdbeb`)
0. 소셜 로그인 UX·에러 처리 개선 — 7차 (`40f3b31`)
0. NAVER OAuth 콜백 Edge Function 강화 — 6차 (`2aede23`)
0. NAVER OAuth 콜백 Edge Function 구현 — 5차 (`872c793`)
0. Kakao·Naver 소셜 로그인 Supabase 연동 — 4차 (`272ce0e`)
0. 뉴스·알림·관리자 데이터 Supabase 이관 — 3차 (`3d66f16`)
0. 설문·설문응답 Supabase 이관 (`36a5079`)
0. 팬 의견·댓글·공감 Supabase 이관 — 2차 (`f46ad57`)
0. 관리자 대시보드 고도화(KPI·차트·활동) (`7ae116e`)
0. Supabase Auth + Profile 연동 — 1차 (Mock 폴백 유지) (`23113d5`)
0. 소셜 로그인 아키텍처 추가 (`ba4ee4a`)
0. 전반 UI 일관성·UX 개선 (`8cbf3f4`)

**기능 골격 구축 (이전)**

1. 앱 정보 페이지(소개/개인정보/약관) 추가 + 설정 UI 개선 (`79fc2e7`)
2. 계정 인증·프로필 설정 개선 (`01b0205`)
3. Mock 이메일 인증 구조 추가 (`77f13a4`)
4. 관리자 팀 선택 대비(contrast)·헤더 액션 정렬 수정 (`ad9f0b0`)
5. 댓글 관리 추가 + 토스트 알림 제거 (`78fce00`)
6. **FANCLUV 관리자 콘솔 MVP** 구현 (`e534abd`)
7. 계정 복구 페이지(아이디/비번 찾기) (`dbc0739`)
8. 전반적 UI/UX 품질 개선 (`803abc6`)
9. **다크모드** 구현 (`259aa01`)
10. 설문 리스트로 설문 흐름 개선 (`df0f014`)
11. **Settings 페이지** 구현 (`966cb11`)
12. **한/영 다국어** 구현 (`2a2ec78`)
13. 페이지 헤더에 **로그인 유저 닉네임 표시** (`a28662b`)
14. **목 인증 영속화** (localStorage 세션 유지) (`c9537cd`)
15. Survey / AI Insights / Fan Ranking **라우팅 버그 수정** (`050c495`)
16. Fan Ranking: 리그/클럽 랭킹 탭, 기준 필터, 순위 변동 추가 (`1aa515d`, `d28b21d`)
17. AI Insights 페이지 (`43c209a`)
18. Team News 페이지 (`6728831`)
19. Match Center 페이지 + 로고 크기 조정 (`8659b83`, `53fc663`)
20. My Activity 대시보드 (`54d64fd`)
21. 의견 작성 플로우 / 상세 / 댓글 / 목록 UI (`92251e6`, `89ef1cf`, `508215b`, `1fcac2e`)
22. Survey 버튼 연결 (`3befb12`)
23. Vercel 404 수정: 클라이언트 라우팅 + SPA fallback (`d150b0e`)
24. 초기 커밋 (`b22a591`)

→ **팬 화면 8개 + 계정 복구/인증/정보 페이지 + 관리자 콘솔 10섹션 + Supabase 백엔드 1~30차 연동 완료**(Auth/Profile·의견/댓글/공감·설문·뉴스/알림·소셜로그인·AI인사이트·온보딩·회원탈퇴·신고/공지·**관리자 실통계·운영도구·AI 리포트·구단 리포트 전달·B2B 고객관리**). 모든 데이터 레이어는 **Supabase-우선 + Mock 폴백** 어댑터 구조라 키 없이도 앱이 동작.

## 5. 남은 TODO / 알려진 특이사항

### 실제 외부 연동 (Mock/Provider 골격 → 실서비스)
- [x] **실제 K리그 API 연동** — 완료(32차). Edge Function `league-fetcher`(외부 API→표준 정규화·순위/경기 5분 캐시·키 서버 보관) + `edgeLeagueProvider`(`VITE_LEAGUE_PROVIDER=edge`) + `league_cache`(`0020`). **남은 일**: (1) 실제 벤더 선택 후 시크릿 `LEAGUE_API_BASE`/`LEAGUE_API_KEY` 설정 + `league-fetcher` 배포 + `VITE_LEAGUE_PROVIDER=edge`, (2) 벤더 응답이 표준과 다르면 `league-fetcher`의 `normalizeStandings`/`normalizeMatch`(또는 `LEAGUE_API_VENDOR` 분기) 조정, (3) 팀명↔clubId 매핑(`CLUB_ALIASES`) 검증.
- [x] **실제 팀별 뉴스 연동** — 완료(31차). Edge Function `news-fetcher`(RSS→공식 홈 스크래핑, 10분 캐시) + `edgeNewsProvider`(VITE_NEWS_PROVIDER=edge) + `news_cache`(`0019`). **남은 일**: (1) 각 구단 실제 `rssUrl`/정확한 뉴스 경로를 `SOURCE_OVERRIDES`에 확정(현재 newsUrl best-effort, 실패 시 Mock 폴백), (2) 사이트별 스크래핑 셀렉터 정교화(현재 범용 앵커 추출), (3) `news-fetcher` 배포 + `VITE_NEWS_PROVIDER=edge` 설정.
- [x] **관리자 대시보드 실집계** — 완료(24차). KPI 10종·구단별 현황·최근 활동·차트 전부 Supabase RPC `admin_dashboard_stats`(`0013`) 실집계 or Mock, 30초 캐시(`adminStats.js`). **남은 여지**: RPC 미배포 환경 검증, 기간별(월/분기) 세분화.
- [ ] **리포트 실제 전달 채널** — 구단 리포트 전달(`deliverReport`)의 `email`/`link` 방식은 구조만 있고 실제 전송 미구현(현재 pdf 다운로드만 실동작). 이메일/공유링크 발송 연동 필요.
- [ ] **휴대폰 본인인증(PASS / NICE / KCB) 실제 연동** — 사용자 스키마·`VERIFICATION` 상태(`phone_verified`)·설정 UI 자리만 준비됨. 이메일 인증만 실동작. 실제 본인인증 게이트웨이 연동 필요.

### Edge Function 배포 확인 (Supabase)
- [ ] `send-email-code` — 이메일 인증번호 발송(Resend, 미설정 시 devCode 폴백).
- [ ] `naver-callback` — NAVER OAuth 콜백. 반드시 **`--no-verify-jwt`**로 배포(외부 콜백엔 JWT 없음, service_role 서버 처리). 시크릿: `NAVER_CLIENT_ID/SECRET`, `NAVER_REDIRECT_URI`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] `analyze-insights` — AI 팬 인사이트(OpenAI). **verify_jwt 유지**(요청자 admin role 재확인).
- [ ] `delete-account` — 안전한 회원탈퇴(service_role, 시크릿 자동 주입).
- 검증 체크리스트: [SUPABASE_SETUP.md](SUPABASE_SETUP.md) / 소셜 배포·시크릿: [SOCIAL_LOGIN_SETUP.md](SOCIAL_LOGIN_SETUP.md).

### 보안 / 코드 정리
- [ ] **Mock 모드 평문 비밀번호 제거** — Supabase 모드는 Supabase Auth가 관리(안전). **Mock 모드 한정 평문 저장**은 데모 전용 → 실서비스 전 제거/해시화 필수.
- [ ] **`src/App.jsx` 정리** — 여전히 Vite 기본 템플릿(실제 진입점은 `main.jsx`). 미사용 → 정리/삭제.
- [ ] **`README.md` Vite 기본 템플릿 잔재 정리** — 프로젝트 실제 내용으로 갱신.
- [ ] **소셜 프로필 이미지** — 일부 provider가 placeholder(SVG data URI). 실 사진 URL 매핑 확인.
- [ ] 파비콘(`public/favicon.svg`, 보라 #863bff)이 PWA 아이콘(금색 FC-하트)과 다른 마크 → 브랜드 통일 여부 검토(이번 로고 교체에선 미변경).
- [ ] 루트/작업 잔재: `log-in page.docx`, `tmp/`, `.DS_Store` 등 정리 여지.

### 상태 요약
- **Supabase 핵심 이관 완료**: Auth/Profile · 팬 의견/댓글/공감 · 설문 · 뉴스/알림 · 소셜로그인 · AI인사이트 · 온보딩 · 회원탈퇴 · 신고/공지 · **관리자 대시보드 실통계(RPC) · 공지/운영자메모 · 구단 리포트/전달 · B2B 고객관리**. 마이그레이션 `0001~0018`. 모든 데이터 레이어가 **Supabase-우선 + Mock 폴백** 구조라 키 없이도 앱 동작.
- **소셜 로그인**: Google·Kakao = Supabase native, NAVER = 커스텀 Edge Function(`naver-callback`).

## 6. 운영 안정화 체크리스트 (Production Readiness — 1단계)

> 2026-07-06 Production Readiness Phase 1 점검 결과. **기존 기능 변경 없음**(감사·격리·문서화 중심).

### 6.1 Mock 격리 (운영에서 Mock 데이터/계정/Provider 비노출)
- **데모 계정 시드는 개발(dev) 빌드의 Mock 모드에서만** — `src/lib/auth.js`: `if (!isSupabaseConfigured && import.meta.env.DEV) ensureSeed()`. 운영 빌드에서 Supabase 미설정이어도 `admin@fancluv.kr`/`admin123` 같은 **고정 관리자 자격증명이 생성되지 않음**(보안 구멍 차단).
- **운영 미설정 경고** — `src/lib/supabase.js`: `import.meta.env.PROD && !isSupabaseConfigured` 이면 `console.error`로 배포 설정 오류를 크게 알림(앱 강제 종료는 안 함 — 의도된 데모 배포 보호). `isMockMode` 플래그도 export.
- **Mock Provider = graceful fallback**: 리그(`services/league/`)·뉴스(`lib/news/`) Provider는 실 API 실패/미설정 시 `lastGood → Mock` 순으로 폴백(앱이 안 깨지도록). 운영에서 "가짜 데이터 절대 금지"가 필요하면 각 provider의 Mock fallback을 비활성화하는 것이 결정 지점(현재는 UX 우선으로 유지).

### 6.2 환경변수 분리 (`.env.example` 최신)
- **클라이언트(VITE_, 공개 안전)**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_NAVER_CLIENT_ID`, `VITE_NAVER_CALLBACK_URL`, `VITE_LEAGUE_API_BASE`, `VITE_LEAGUE_API_KEY`, `VITE_NEWS_API_ENABLED`, `LEAGUE_PROVIDER`(vite.config `envPrefix`로 노출).
- **서버 전용(VITE_ 없음, 절대 프론트 금지)**: `SUPABASE_SERVICE_ROLE_KEY`, `NAVER_CLIENT_SECRET`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `RESEND_API_KEY`, `EMAIL_FROM` → 모두 `supabase secrets set`.
- **`VITE_OPENAI_MODEL`은 의도적으로 없음**: OpenAI 호출은 `analyze-insights` Edge Function(서버)에서만 → 모델명은 서버 시크릿 `OPENAI_MODEL`로만 관리(프론트 노출 무의미·불필요).

### 6.3 Supabase 보안 (감사 결과: 양호)
- **RLS**: 사용자 데이터 테이블 전부 RLS + 정책(총 46개). 본인 데이터(profiles/notifications/likes 등)는 `auth.uid()` 기준, 관리자 데이터(surveys/news/reports/notices/admin_notes/club_reports/report_deliveries/customers/customer_contract_history)는 `is_admin()` 기준.
- **anon key만 클라이언트에 사용**(공개 안전). **`service_role`은 Edge Function 4곳에서만**(delete-account·naver-callback·send-email-code, analyze-insights) — 프론트/번들 미노출.
- **권한 체크 이중 방어**: 클라이언트(`isAdmin()`) + 서버(RLS `is_admin()` / RPC `SECURITY DEFINER`). `admin_notes`·리포트·고객 repo는 API 진입 시 `isAdmin()` 선검사도 수행.
- **회원정보 노출 최소화**(22차): 상세 식별정보는 `RequireAdmin` 내부에서만 렌더.

### 6.4 Edge Function 배포 상태 (Supabase)
| 함수 | JWT | 시크릿 | 배포 명령 |
|------|-----|--------|-----------|
| `send-email-code` | **--no-verify-jwt** | `RESEND_API_KEY`,`EMAIL_FROM`(선택, 없으면 devCode) | `supabase functions deploy send-email-code --no-verify-jwt` |
| `send-welcome-email` | **--no-verify-jwt** | `RESEND_API_KEY`,`EMAIL_FROM`(선택, 없으면 미발송) | `supabase functions deploy send-welcome-email --no-verify-jwt` |
| `naver-callback` | **--no-verify-jwt** | `NAVER_CLIENT_ID/SECRET`,`NAVER_REDIRECT_URI`,`SITE_URL`(선택) | `supabase functions deploy naver-callback --no-verify-jwt` |
| `analyze-insights` | **verify_jwt=true**(기본) | `OPENAI_API_KEY`,`OPENAI_MODEL`(선택) | `supabase functions deploy analyze-insights` |
| `delete-account` | **verify_jwt=true**(기본) | (없음 — 자동 주입) | `supabase functions deploy delete-account` |
| `news-fetcher` | **verify_jwt=true**(기본) | (없음 — 자동 주입) | `supabase functions deploy news-fetcher` (+ `0019_news_cache.sql`, `VITE_NEWS_PROVIDER=edge`) |
| `league-fetcher` | **verify_jwt=true**(기본) | `LEAGUE_API_BASE`,`LEAGUE_API_KEY`,`LEAGUE_API_VENDOR`(선택) | `supabase functions deploy league-fetcher` (+ `0020_league_cache.sql`, `VITE_LEAGUE_PROVIDER=edge`) |
| `health-check` | **verify_jwt=true**(기본, 내부 admin 재확인) | (없음 — 기존 OPENAI/RESEND 키 재사용, 자동 주입) | `supabase functions deploy health-check` (+ `0022_integration_health.sql`) |
- `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY`는 플랫폼 자동 주입(로컬 실행 시만 수동). `--no-verify-jwt`는 외부 콜백(네이버)·비로그인 흐름(이메일 코드) 때문에 필요 → 함수 내부에서 `service_role`로 안전 처리. verify_jwt 유지 함수는 요청자 role/JWT를 서버에서 재확인.

### 6.5 캐시 (in-memory TTL — `src/lib/cache.js`, `withCache`)
| 캐시 키 | TTL | 폴백 |
|---------|-----|------|
| `home:{teamId}` (홈 인기 콘텐츠) | 30초 | 실패 시 Mock |
| `admin:dashboard` (관리자 통계) | 30초 | RPC 실패 시 Mock, 비관리자 빈값 |
| `teamnews:{clubId}` (팀 뉴스) | 5분 | 실 Provider→저장뉴스 병합→lastGood→Mock |
| `league:standings` · `league:fixtures:{teamId}` | 5분 | 실패 시 lastGood→Mock |
- 진행 중 Promise 재사용(중복 요청 합침), 실패는 캐시 미저장. `invalidate(prefix)`/`refresh*()`로 강제 갱신.

### 6.6 에러 처리 / 상태 (감사 결과: 양호)
- **repo는 throw 하지 않음** — 내부 try/catch 후 안전값(빈 배열/`{ ok:false, error/code }`) 반환(37개 파일). 화면은 반환값으로 상태 전환.
- **모든 데이터 페이지 = Loading(Skeleton) + EmptyState** 보유(Opinions/Survey/AI/Match/News/Ranking/Activity/Home). **인증 폼 = 지역화 error 메시지**(Login/Signup). AI 인사이트는 `loading|ready|empty` 명시 상태.

### 6.7 콘솔 정리
- `src/` 내 `console.*` = 2건뿐. **welcomeEmail의 Mock 로그는 `import.meta.env.DEV`로 게이트**(운영 콘솔 노이즈 제거). adminStats의 `console.warn`은 Supabase 집계 실패 시에만 나오는 **운영 진단 로그라 유지**. `TODO`는 뉴스 Provider 3건(실 연동 지점, 의도된 골격).

### 6.8 성능
- **PDF 라이브러리(jspdf·html2canvas ~600KB)는 동적 import**(`generatePdf.js` 내부 `import('jspdf')`) → 관리자가 리포트 생성할 때만 로드, 메인 번들·팬 화면엔 미포함(별도 청크로 분리 확인).
- 메인 번들 gzip ~237KB. 추가 최적화 여지: 라우트별 `lazy()` 코드 스플리팅(추후).

## 6-2. 운영 안정화 체크리스트 (Production Readiness — 2단계)

> 2026-07-06 Phase 2 점검 결과. 성능 최적화 · 모니터링 · 운영 안정성 강화. **기존 기능 변경 없음.**

### 6-2.1 전역 Error Boundary — `src/components/ErrorBoundary.jsx`
- 클래스 컴포넌트 Error Boundary. 예상치 못한 렌더 오류 시 **흰 화면 대신 500 스타일 안내**(제목 `err.heading` "예상치 못한 오류가 발생했습니다." + **새로고침** + **홈으로 이동**)를 표시하고 `logger.error` 로 기록.
- `main.jsx` 배치: `LanguageProvider` 아래(그래서 fallback 에서 `useLang` 사용 가능) · `AuthProvider`/`BrowserRouter` 위(그들의 오류까지 포착). 이동/새로고침은 라우터 비의존 `window.location` 사용.

### 6-2.2 404 / 500 페이지
- **404**(`NotFoundPage.jsx`): FANCLUV 디자인 + **홈으로 돌아가기**(primary) + **이전 페이지**(`navigate(-1)`, 이력 없으면 홈). i18n `nf.*`.
- **500**(ErrorBoundary fallback): 서버 오류 안내 + **새로고침**(`reload`) + **홈으로 이동**. i18n `err.*`. 스타일 `.fc-errpage*`(404와 공통 토큰).

### 6-2.3 이미지 최적화 — `src/components/LazyImage.jsx`
- `loading="lazy"` + `decoding="async"` + **로딩 실패 시 placeholder 폴백**(onError). placeholder 미지정 시 `.fc-img-ph` 회색 자리표시자.
- 적용: **프로필 아바타**(`Avatar.jsx` → 실패 시 이니셜), **설정 아바타**(`SettingsPage`), **뉴스 이미지**(`TeamNewsPage` Thumb → 실패 시 구단 엠블럼). 로고/팀 엠블럼은 SVG(래스터 아님)라 대상 외.

### 6-2.4 코드 스플리팅 (초기 번들 축소) — `main.jsx`
- 랜딩(`LoginPage`)만 즉시 로드, **나머지 팬/관리자 페이지 전부 `React.lazy` + `<Suspense>`**(fallback = `SkeletonList`). 관리자 콘솔은 별도 청크(운영자만 로드).
- **메인 번들 894KB → 560KB (gzip 237KB → 162KB)**. 페이지별 2~19KB 청크로 분리. PDF 라이브러리(jspdf/html2canvas)는 기존대로 동적 import(리포트 생성 시만).

### 6-2.5 Loading UX (Skeleton)
- 팬 데이터 화면(홈/뉴스/의견/AI/랭킹/활동/설문)은 이미 Skeleton 사용. **관리자 신고·리포트·고객 페이지의 텍스트 로딩("불러오는 중")을 `SkeletonList` 로 교체**. 라우트 청크 로딩 중에도 `SkeletonList` 표시.

### 6-2.6 API 재시도(Retry) — `src/lib/retry.js`
- `withRetry(fn, {retries=3, baseDelay, factor, shouldRetry})` — 지수 백오프 + 지터, **최대 3회 재시도**. 4xx 등은 `shouldRetry` 로 즉시 중단.
- `retrySupabase(queryFn)` — Supabase `{data,error}` 를 재시도(일시적 pg 오류만; 권한/제약 위반 23/42/28xxx 은 중단).
- 적용 지점: **Edge Function**(`lib/edgeFunctions.js` `invokeFunction` — analyze-insights·send-email-code·send-welcome-email·delete-account), **리그 Provider**(`apiLeagueProvider` fetch), **Supabase 읽기**(`adminStats` RPC·`homeRepo` 조회), **뉴스 Provider**(실 연동 시 `invokeFunction` 경유 → 재시도 자동). 캐시(`withCache`) + lastGood/Mock 폴백과 함께 동작.

### 6-2.7 성능/사용성 측정 구조 — `src/services/analytics/`
- `analytics.pageView()/track()/identify()` 인터페이스 + Provider 교체 구조. 현재 **`mockAnalyticsProvider`**(개발 콘솔 로그만, 운영 no-op). `main.jsx` 가 `initAnalytics()` + 라우트 변경마다 `pageView` 호출.
- 향후 `VITE_ANALYTICS=ga|clarity` 로 GA4/Clarity Provider 추가 시 `pickProvider()` 한 곳만 확장(화면 코드 불변).

### 6-2.8 운영 로그 — `src/lib/logger.js`
- `logger.debug/info/warn/error(message, { error, context })` Wrapper. **개발=전체 레벨, 운영=warn/error 만** 콘솔 출력. warn/error 는 등록된 sink 로도 전달 → `addSink()` 로 Sentry 등 원격 수집 연결 준비.
- 앱 내 직접 `console.*` 제거(logger 경유로 일원화). supabase 미설정 경고·관리자 통계 실패·Edge Function 실패 등이 logger 로 기록.

### 6-2.9 접근성(A11y)
- 이미지: 모든 `<img>` 에 `alt`(장식용은 `alt=""`). 아이콘 버튼: 비밀번호 표시 토글에 `aria-label`(`common.showPassword/hidePassword`) + `aria-pressed` 추가. 헤더 아이콘 버튼은 기존 `aria-label` 유지.
- 폼: 라벨 텍스트 제공, `autoComplete` 지정(로그인/비밀번호). 전역 `:focus-visible` 링(Phase 1)으로 키보드 내비 가시성 확보. 로딩/빈/오류 영역에 `role="status"`/`role="alert"`.

## 7. 작업 시 참고

- 페이지 추가 시: `src/XxxPage.jsx` + `src/XxxPage.css` 쌍 생성 → `main.jsx`에 `RequireAuth` 라우트 등록(코드 스플리팅: `const X = lazy(() => import('./X.jsx'))`) → 내비 메뉴면 `teams.jsx`의 `MENU_ITEMS`/`menuPath` + `NAV_KEYS` 갱신.
- **console.* 대신 `logger.*`**, 이미지엔 `LazyImage`, 외부 요청엔 `withRetry`/`retrySupabase`/`invokeFunction` 사용.
- **새 UI 텍스트는 반드시 ko/en 양쪽 locale에 키 추가** (911/911 동기화 유지).
- 디자인 토큰/컬러/타이포는 `DESIGN.md` 기준을 따를 것.
- **운영/개발 모드**: Supabase env 설정 시 실서비스, 미설정 시 Mock. 데모 계정은 dev 빌드에서만 시드(§6.1).
