# FANCLUV — 프로젝트 컨텍스트 (핸드오프 문서)

> 새 채팅에서 이 파일을 읽으면 바로 이어서 작업할 수 있도록 정리한 문서입니다.
> 최종 정리: 2026-07-01 / `main` 브랜치 기준 (작업 트리 clean, 최신 커밋 `79fc2e7`)

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
| `/club/:teamId/survey` | SurveyPage (설문) | ✓ |
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
| `/admin/reports` | AdminReports (신고 관리) |
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
- 팬 API: `listSurveys(teamId)`(대상 구단 team_id 또는 전체, **종료 7일 경과 자동 숨김**), `submitResponse(surveyId, teamId, answers)`(1인 1회, DB `unique(survey_id,user_id)`).
- 관리자 API: `adminListSurveys`/`createSurvey`/`updateSurvey`/`closeSurvey`/`deleteSurvey` → Supabase CRUD(관리자 RLS `is_admin()`), Mock은 세션 배열.
- **중복 참여 방지**: 참여한 설문은 카드가 "참여 완료" 상태(비활성) 표시. Mock은 `fancluv_survey_participated` localStorage, Supabase는 `surveys_view.has_responded`.
- `selectedId` 내부 상태로 **목록 → 상세 → 완료** 3단계 전환. 상세 폼(별점·객관식·주관식 Q1~Q4)은 고정 템플릿 유지(UI 불변), 응답은 `answers` jsonb로 저장. 제목/설명은 Supabase=DB값, Mock=locale 키 겸용.
- 상태 필터(전체/진행 중/종료), 참여 화면 뒤로가기 없음, 완료 화면은 "목록으로 돌아가기"만 — 기존 UI 유지.

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
- **Supabase 연동 완료(1차: Auth + Profile)**. `.env` 에 키가 있으면(`isSupabaseConfigured`) 실제 **Supabase Auth + `profiles` 테이블** 사용, 없으면 기존 **localStorage Mock 자동 폴백**(앱 안 깨짐). 설정법: [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
- `src/lib/supabase.js` — env 로 client 생성 + `isSupabaseConfigured` 감지. `src/contexts/AuthContext.jsx` — 비동기 세션/프로필 로드 + 라우트 가드 `loading` 게이트(`main.jsx`의 `RequireAuth`/`RequireAdmin`가 모드별 분기).
- **동기 캐시**: `getCurrentUser()`/`isAuthenticated()`/`isAdmin()` 는 여전히 동기. Supabase 모드에서는 AuthContext가 로드한 프로필을 auth.js 캐시(`cachedUser`)에 반영해 기존 화면 코드가 그대로 동작.
- 스키마: `0001_profiles.sql`(profiles + RLS + 트리거), `0003_nickname_and_find_account.sql`(닉네임 쿨다운 컬럼 + 아이디찾기 RPC), `0004_opinions_comments_likes.sql`(팬 의견/댓글/공감 + `opinions_view`), `0002_data_tables.sql`(설문 — 다음 단계 준비).
- `login`/`signup`/`logout`/`socialLogin`/`changePassword`/`changeNickname`/`requestPasswordReset`/`findAccountByHint` 등은 **async**(양 모드 지원). Google 소셜 = `supabase.auth.signInWithOAuth`, **Kakao/NAVER는 인터페이스만 유지(다음 단계)**.
- **닉네임 쿨다운(3개월/90일)**: Supabase는 `profiles.nickname_updated_at`, Mock은 `lastNicknameChangeAt` 기준. `nicknameChangeInfo()`/`changeNickname()`이 양 모드 공통 처리 → 프로필 수정 화면 연동.
- **아이디 찾기**: Supabase는 서버 RPC `find_account_by_hint`(SECURITY DEFINER, 마스킹 이메일 반환) → 클라이언트가 전체 유저를 조회하지 않음. Mock은 로컬 조회.
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

### 다국어 — `src/contexts/LanguageContext.jsx` + `src/locales/{ko,en}.js`
- `useLang()` → `{ lang, setLang, t }`. `t(key, vars?)`는 `{token}` 보간 지원, 누락 시 ko 폴백 → raw key 폴백.
- localStorage 키: `fancluv_lang` (기본 `ko`).
- **ko/en 각각 233개 키** (현재 동기화됨).
- `NAV_KEYS`: 한글 내비 라벨 → 번역 키 매핑. **메뉴 배열은 한글을 canonical 키로 유지**(라우팅/active 판정용), 표시 라벨만 번역.

### 구단 데이터 — `src/teams.jsx`
- `TEAMS`: K리그1 12개 구단 (id, name, short, color, colorDeep).
- `MENU_ITEMS`: 상단 내비 8개 메뉴(한글 canonical). `menuPath(item, teamId)`로 경로 변환. `getTeam(id)`.
- `TeamEmblem`: SVG 축구공 엠블럼 컴포넌트 (구단 컬러 적용).

### 팬 의견 / 댓글 / 공감 — `src/lib/opinionsRepo.js` (Supabase-우선 + Mock 폴백)
- **Supabase 이관 완료(2차)**. `OpinionsPage`/`OpinionDetailPage`/`CreateOpinionPage`의 단일 데이터 소스. Supabase 설정 시 `opinions`/`comments`/`likes` 테이블 + `opinions_view`(작성자·공감수·댓글수 집계) 사용, 아니면 Mock(seeded 풀 + `opinionStore.js` localStorage).
- API(모두 async): `listOpinions(teamId)`(구단 필터), `getOpinionDetail(teamId,id)`(+연관), `createOpinion`, `listComments`/`addComment`, `getLikeState`/`toggleLike`(1인 1회, 취소 가능).
- 화면은 `useEffect`로 비동기 로드(로딩 상태 포함). **UI/디자인은 기존 그대로**. 작성 의견 상세 열람도 정상 동작.
- `src/opinionStore.js` = Mock 작성 의견 localStorage 백엔드(`fancluv_created_opinions`) — repo가 Mock 모드에서 사용.

### 팀 뉴스 — `src/lib/newsRepo.js` (Supabase-우선 + Mock 폴백)
- **Supabase 이관 완료(3차)**. `TeamNewsPage`(팬) + `AdminNews`(관리자)의 단일 데이터 소스. Supabase 설정 시 `team_news` 테이블(제목·내용·team_id·category·image_url·author·status·is_important), 아니면 Mock.
- 팬 API: `listNews(teamId)`(구단 필터, 최신순/중요 뉴스 정렬). 관리자 API: `adminListNews`/`createNews`/`updateNews`/`deleteNews`(관리자 RLS `is_admin()`). SQL: `0006_news_notifications.sql`.

### 알림 — `src/lib/notificationsRepo.js` + `components/NotificationBell.jsx`
- **Supabase 이관 완료(3차)**. 벨에 안읽음 배지 + 목록 + 개별/전체 읽음. Supabase 설정 시 `notifications` 테이블, 아니면 Mock(localStorage, 시드 포함).
- **알림 생성은 DB 트리거**(`0006`, SECURITY DEFINER): 댓글/공감(의견 작성자에게), 새 설문/새 뉴스(대상 구단 팬에게). Mock 모드는 각 repo가 `pushMockNotification`으로 데모 생성.
- 클라이언트는 조회 + 읽음 처리만: `listNotifications`/`unreadCount`/`markRead`/`markAllRead`. 본인 알림만 RLS로 노출.

### 관리자 콘솔 — `src/admin/`
- `RequireAdmin` 가드로 보호. `AdminLayout` + 중첩 라우트(대시보드/회원/의견/설문/뉴스/신고/설정).
- 데이터는 `adminData.js`의 Mock. 댓글 관리 기능 포함, 토스트 없이 인라인 피드백.
- **대시보드 고도화**(`AdminDashboard.jsx` + `AdminCharts.jsx`): KPI 8종, 구단별 현황 테이블(만족도·참여율 미니바), 최근 활동(가입/의견/댓글/신고), 차트(라인·바·도넛·감정 누적바 — 순수 SVG, 라이브러리 없음), 빠른 작업 4종.
- **KPI는 Supabase 집계 연동**: `getDashboardStats()`(async)가 Supabase 설정 시 `count(*)` 쿼리(회원/의견/댓글/오늘 의견/진행 설문/좋아요/응답)로 계산, 아니면 Mock. 나머지 대시보드 데이터(구단별/최근/차트)와 신고는 아직 Mock.
- **관리자 CRUD가 Supabase에 반영**: 설문(`surveysRepo`)·뉴스(`newsRepo`)는 관리자 RLS(`is_admin()`)로 서버 반영. `/admin` 접근은 `RequireAdmin`+`isAdmin()`(profiles.role) → 일반 사용자 차단.

### 계정 복구 / 프로필 / 정보 페이지
- **FindIdPage / FindPasswordPage** (`RecoveryPages.css`) — 아이디·비밀번호 찾기 (Mock).
- **VerifyEmailPage** — Mock 이메일 인증 흐름 (`AccountPages.css`).
- **ProfileEditPage / ChangePasswordPage** — 프로필 수정·비밀번호 변경.
- **InfoPage** (`InfoPage.jsx` + `infoContent.js`) — `page` prop으로 소개/개인정보/약관 렌더.

## 4. 완료된 작업 (git 히스토리, 최신 → 과거)

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

→ **팬 화면 8개 + 계정 복구/인증/정보 페이지 + 관리자 콘솔까지 구현 완료.** 기능 골격 완성 단계이며, 다음 마일스톤은 Supabase 백엔드 연동.

## 5. 알려진 특이사항 / TODO 후보

- `src/App.jsx`는 **여전히 Vite 기본 템플릿** (실제 앱은 `main.jsx`가 진입점). 라우트에 미연결 — 정리/삭제 가능.
- `README.md`도 Vite 기본 템플릿 그대로.
- 백엔드/DB 없음 → **Supabase 연동**이 다음 큰 마일스톤 (auth.js부터 교체 지점 마련됨). 권한(`ROLES`)·본인인증(`VERIFICATION`) 데이터 구조는 이미 확장 대비해 선반영됨.
- 이메일 인증은 **Mock만 동작**, 휴대폰 본인인증(PASS/NICE/KCB)은 구조만 준비된 상태 → 실제 연동 필요.
- 비밀번호 평문 저장 (목업 한정).
- 루트에 `log-in page.docx`, `tmp/`, `.DS_Store` 존재.

## 6. 작업 시 참고

- 페이지 추가 시: `src/XxxPage.jsx` + `src/XxxPage.css` 쌍 생성 → `main.jsx`에 `RequireAuth` 라우트 등록 → 내비 메뉴면 `teams.jsx`의 `MENU_ITEMS`/`menuPath` + `NAV_KEYS` 갱신.
- **새 UI 텍스트는 반드시 ko/en 양쪽 locale에 키 추가** (233/233 동기화 유지).
- 디자인 토큰/컬러/타이포는 `DESIGN.md` 기준을 따를 것.
