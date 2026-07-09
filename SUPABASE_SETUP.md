# FANCLUV — Supabase 연동 & 베타 배포 프로비저닝 가이드

이 문서대로 하면 **실제 회원가입 / 로그인 / 세션 / 프로필 / 의견 / 설문 / AI / 리포트**가 동작합니다.
키를 넣기 전(개발)에는 앱이 **localStorage Mock**으로 동작하지만, **프로덕션 빌드에서 Supabase 미설정 시에는
로그인이 차단**되고 "서비스 설정이 완료되지 않았습니다" 안내만 표시됩니다(데모 계정 미시드 — 보안).

---

## 0. 베타 배포 프로비저닝 (필수 요약)

프로덕션 베타 배포 전 아래를 **순서대로** 완료해야 합니다.

1. Supabase 프로젝트 생성 → `Project URL` / `anon public key` 확보 (§1)
2. 배포 환경(Vercel)에 환경변수 설정 (§2)
3. 마이그레이션 `0001~0026` 실행 (§3, 아래 표)
4. Edge Function 배포 + 시크릿 설정 (§0-B, 9종 표)
5. 관리자/구단 계정 발급 (§0-C)
6. RLS 정책 검증 (§0-D)
7. `health-check` 로 배포 확인 (§0-E)

> ⚠️ **프로덕션에서 Supabase 미설정 시**: `isProdMisconfigured`(src/lib/supabase.js)가 true 가 되어
> 데모 관리자 계정(`admin@fancluv.kr` 등)이 **시드되지 않고**, 로그인 화면이 차단됩니다.
> Mock 데모 데이터/계정은 **개발(`import.meta.env.DEV`)에서만** 허용됩니다.

### 0-A. 마이그레이션 실행 순서 (Supabase SQL Editor)

| 순서 | 파일 | 역할 |
|------|------|------|
| 1 | `0001_profiles.sql` | profiles + RLS + 신규가입/이메일확인 트리거 · `is_admin()` 기반 정책 기초 |
| 2 | `0003_nickname_and_find_account.sql` | 닉네임 쿨다운 컬럼 + 아이디찾기 RPC(`find_account_by_hint`) |
| 3 | `0004_opinions_comments_likes.sql` | 팬 의견/댓글/공감 + `opinions_view` |
| 4 | `0005_surveys.sql` | 설문/설문응답 + `is_admin()` |
| 5 | `0006_news_notifications.sql` | 팀 뉴스/알림 + 알림 생성 트리거 |
| 6 | `0007_social_login.sql` | 소셜 로그인 프로필 매핑(handle_new_user) |
| 7 | `0008_profiles_email_index.sql` | profiles.email 인덱스(소셜 콜백 조회) |
| 8 | `0009_ai_insights.sql` | AI 팬 인사이트 결과 저장 |
| 9 | `0010_account_hardening.sql` | 회원탈퇴(`deactivated_at`) + `email_codes` |
| 10 | `0011_reports_notices.sql` | 신고/공지 + 알림 트리거 |
| 11 | `0012_avatars_storage.sql` | 프로필 이미지 Storage(`avatars` 버킷) |
| 12 | `0013_admin_dashboard_stats.sql` | 관리자 대시보드 집계 RPC(`admin_dashboard_stats`) |
| 13 | `0014_admin_ops.sql` | 공지 테이블 / 운영자 내부 메모 |
| 14 | `0015_notice_important.sql` | 공지 중요 플래그 |
| 15 | `0016_club_reports.sql` | 구단 전달용 리포트 |
| 16 | `0017_report_delivery.sql` | 리포트 전달 이력 |
| 17 | `0018_customers.sql` | B2B 고객 / 계약 이력 |
| 18 | `0019_news_cache.sql` | 팀 뉴스 캐시(news-fetcher) |
| 19 | `0020_league_cache.sql` | 리그 데이터 캐시(league-fetcher) |
| 20 | `0021_news_sources.sql` | 뉴스 소스 관리 + 수집 상태 |
| 21 | `0022_integration_health.sql` | 통합 상태 + 시스템 로그 |
| 22 | `0023_club_kpi_history.sql` | KPI 주차 히스토리 |
| 23 | `0024_club_actions.sql` | 구단 액션 + 전후 KPI 스냅샷 |
| 24 | `0025_club_action_result.sql` | 구단 액션 운영자 메모 |
| 25 | `0026_identity_verification.sql` | 본인인증 CI/DI + `claim_identity` RPC + insert 게이트 |
| 26 | `0027_roles_and_admin_members.sql` | 역할 enum 확장(superadmin/staff/club/club_admin) + `is_admin()` 보강 + 관리자 회원 조회/상태 RPC |

> `0002_data_tables.sql` = **DEPRECATED**(실행 불필요). 실행 후 아래 테이블 존재 확인:
> `profiles, opinions, comments, likes, surveys, survey_responses, team_news, notifications, reports, notices, ai_insights, club_reports, report_deliveries, customers, customer_contract_history, news_sources, integration_health, integration_logs, club_kpi_history, club_actions, news_cache, league_cache, email_codes`.

### 0-B. Edge Function 9종 배포 체크리스트

Supabase CLI(`supabase login` → `supabase link --project-ref <ref>`) 후 배포합니다.

| Function | 목적 | 시크릿(서버 전용) | 배포 명령 | 미배포/실패 시 fallback | 베타 필수 |
|----------|------|------------------|-----------|------------------------|-----------|
| `send-email-code` | 회원가입 이메일 인증번호 발송/검증 | `RESEND_API_KEY`,`EMAIL_FROM`(선택) | `deploy --no-verify-jwt` | 키 없으면 devCode 화면 표시(개발) | **필수** |
| `delete-account` | 회원 완전 탈퇴(본인만) | (자동주입) | `deploy` | 실패 시 프로필 비활성화 폴백 | **필수** |
| `analyze-insights` | AI 팬 인사이트 분석(OpenAI) | `OPENAI_API_KEY`,`OPENAI_MODEL`(선택) | `deploy` | 미설정 시 `openai_not_configured` 안내 / Mock 로컬분석 | **권장(핵심)** |
| `health-check` | 외부 서비스 상태 점검 | (기존 키 재사용) | `deploy` | Mock 모드 서버서비스=비활성 표시 | 권장 |
| `send-welcome-email` | 가입 환영 메일 | `RESEND_API_KEY`,`EMAIL_FROM` | `deploy --no-verify-jwt` | 키 없으면 미발송(비차단) | 선택 |
| `naver-callback` | NAVER OAuth 콜백 | `NAVER_CLIENT_ID/SECRET`,`NAVER_REDIRECT_URI` | `deploy --no-verify-jwt` | 미설정 시 NAVER 로그인 버튼 안내 | 선택 |
| `league-fetcher` | K리그 순위/일정/결과 | `LEAGUE_API_BASE/KEY/VENDOR` | `deploy` | 미설정 시 lastGood→Mock(데모 데이터) | 선택 |
| `news-fetcher` | 팀 뉴스 수집(RSS/스크래핑) | (자동주입) | `deploy` | 미설정 시 저장뉴스+Mock | 선택 |
| `identity-verify` | 본인인증(PASS/NICE/KCB) | `IDENTITY_VENDOR/CLIENT_ID/SECRET/API_BASE/SITE_URL` | `deploy` | 미설정 시 `provider_unconfigured` → 베타는 **이메일 인증만** 사용 | 선택(베타 제외 가능) |

> `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`는 플랫폼이 자동 주입합니다(직접 set 불필요).
> 시크릿 설정 예: `supabase secrets set RESEND_API_KEY=re_... EMAIL_FROM="FANCLUV <no-reply@도메인>"`

### 0-C. 관리자 / 구단 계정 발급 (실서비스 방식)

**데모 자격증명(admin@fancluv.kr/admin123)은 프로덕션에서 생성되지 않습니다.** 아래로 발급하세요.

1. 대상 이메일로 앱에서 회원가입(또는 Supabase 대시보드 Authentication → Add user).
2. SQL Editor 에서 role 부여:
   ```sql
   -- 관리자
   update public.profiles set role = 'admin'      where email = '운영자이메일';
   -- 최상위 관리자
   update public.profiles set role = 'superadmin' where email = '최상위관리자이메일';
   -- 구단(B2B) 계정 — club_id 는 teams.jsx 의 구단 id (예: seoul, ulsan …)
   update public.profiles set role = 'club', club_id = 'seoul' where email = '구단담당자이메일';
   ```
3. 재로그인 → 앱의 `mapDbRole`(auth.js)이 `superadmin/staff/admin`→관리자, `club/club_admin`→구단 계정으로 매핑.
   - 관리자/최상위관리자 → `/admin` 콘솔
   - 구단 계정 → `/executive` (자기 구단 데이터만, 원본 팬 데이터 접근 불가)

### 0-D. RLS 정책 검증

```sql
-- 사용자 데이터 테이블 RLS 활성 여부(전부 true 여야 함)
select relname, relrowsecurity from pg_class
 where relname in ('profiles','opinions','comments','likes','surveys','survey_responses',
   'notifications','reports','notices','ai_insights','club_reports','customers',
   'club_kpi_history','club_actions','email_codes','league_cache','news_cache');
-- 테이블별 정책 수
select tablename, count(*) from pg_policies group by tablename order by tablename;
-- is_admin() 함수 존재 확인
select proname from pg_proc where proname in ('is_admin','is_identity_verified','claim_identity','admin_dashboard_stats');
```
확인 포인트: 본인 데이터(profiles/notifications/likes)는 `auth.uid()` 기준, 관리자 데이터
(surveys/news/reports/notices/customers 등)는 `is_admin()` 기준, 캐시 테이블(league/news_cache)은
service_role 전용(공개 정책 없음).

### 0-E. Health-check (배포 확인)

```bash
supabase functions deploy health-check
```
배포 후 **관리자 로그인 → `/admin/system` → "전체 테스트"** 로 8개 서비스(DB/Auth/Edge/뉴스/리그/OpenAI/Email/Push)
상태를 확인합니다. 각 서비스가 정상/지연/오류/비활성으로 표시되고, 연속 3회 실패 시 관리자 알림이 생성됩니다.

---

## 1. Supabase 프로젝트 만들기
1. https://supabase.com 에서 프로젝트 생성.
2. **Project Settings → API** 에서 두 값을 복사:
   - `Project URL`
   - `anon` `public` key (클라이언트 공개용 — 노출돼도 안전)

## 2. 환경변수 설정
프로젝트 루트에서:
```bash
cp .env.example .env
```
`.env` 를 열어 값을 채웁니다:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```
> `.env` 는 `.gitignore` 로 커밋되지 않습니다. `service_role` key 는 절대 넣지 마세요.

개발 서버를 재시작하면(`npm run dev`) Supabase 모드로 전환됩니다.

## 3. 데이터베이스 스키마 적용
Supabase 대시보드 → **SQL Editor** 에서 아래 파일 내용을 실행:
1. `supabase/migrations/0001_profiles.sql` — **필수** (프로필 테이블 + RLS + 신규가입 트리거)
2. `supabase/migrations/0002_data_tables.sql` — 선택 (Opinions/Surveys, 다음 단계 준비)

`0001` 을 실행하면:
- `profiles` 테이블 생성 (닉네임/이메일/응원팀/성별/나이대/프로필이미지/role/인증상태)
- 회원가입 시 `auth.users` → `profiles` row 자동 생성 트리거
- 이메일 인증 완료 시 프로필 인증상태 자동 동기화
- 본인 프로필만 조회/수정 가능한 RLS

## 4. 이메일 인증 설정 (선택)
- 대시보드 → **Authentication → Providers → Email**
- "Confirm email" 을 켜면 가입 후 확인 메일 링크로 인증(앱이 "확인 메일 발송" 안내를 표시).
- 끄면 가입 즉시 로그인 세션이 생성됩니다(개발 편의).

## 5. Google 로그인 (OAuth)
1. 대시보드 → **Authentication → Providers → Google** 활성화.
2. Google Cloud Console 에서 OAuth 클라이언트 생성 후 Client ID/Secret 입력.
3. **Authorized redirect URL** 에 Supabase 가 안내하는 콜백 URL
   (`https://xxxx.supabase.co/auth/v1/callback`) 추가.
4. 앱의 "Google로 계속하기" 버튼이 `supabase.auth.signInWithOAuth({ provider: 'google' })`
   로 리다이렉트 → 로그인 후 앱으로 복귀(`redirectTo = window.location.origin`).

> **Kakao / NAVER** 는 이번 단계에서 버튼/Provider 인터페이스만 유지합니다.
> (버튼을 누르면 "다음 단계에서 연동 예정" 안내) 다음 단계에서 Supabase Provider 또는
> 커스텀 OAuth 로 `socialLogin()` 분기만 추가하면 됩니다.

## 6. 관리자(Admin) 계정
1. 앱에서 관리자용 이메일로 가입.
2. SQL Editor 에서:
   ```sql
   update public.profiles set role = 'admin' where email = 'admin@fancluv.kr';
   ```
3. 재로그인하면 `/admin` 콘솔 접근 가능(앱의 `isAdmin()` 이 role 로 판정).

---

## 동작 구조 요약
| 구성요소 | 파일 | 역할 |
|----------|------|------|
| 클라이언트 | `src/lib/supabase.js` | env 로 client 생성 · `isSupabaseConfigured` 감지 |
| 인증 어댑터 | `src/lib/auth.js` | Supabase-우선 / Mock-폴백. `getCurrentUser()` 는 동기 캐시로 유지 |
| 세션 로딩 | `src/contexts/AuthContext.jsx` | 비동기 세션/프로필 로드 · 라우트 가드 `loading` 게이트 |
| 라우트 가드 | `src/main.jsx` | Supabase 모드=async 게이트 / Mock 모드=기존 동기 판정 |
| 스키마 | `supabase/migrations/*.sql` | profiles(+opinions/surveys 준비) |

## 이번 단계 범위 / 다음 단계
- ✅ 이번: 이메일 회원가입·로그인·로그아웃·세션유지·이메일 인증 구조·프로필 테이블·role(user/admin)·Google(OAuth 구조)
- ⏭️ 다음: 팬 의견/댓글/공감/설문/설문응답/팀 뉴스/알림/관리자 데이터의 Supabase 완전 이관, Kakao·NAVER 실제 연동, 아이디 찾기 서버 함수, 닉네임 변경 쿨다운 컬럼

---

## AI 팬 인사이트 분석 (OpenAI)
팬 의견/설문을 OpenAI 로 분석해 `ai_insights` 에 저장하고, AI 인사이트 화면에 표시합니다.
**OpenAI 키는 Edge Function 에서만 사용**하며 프론트엔드에 노출하지 않습니다.

1. 스키마 적용: `supabase/migrations/0009_ai_insights.sql` 실행.
2. Edge Function 시크릿:
   ```bash
   supabase secrets set OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-4o-mini
   ```
3. 배포(기본 verify_jwt=true — 로그인 사용자만 호출, 함수 내부에서 관리자 role 재확인):
   ```bash
   supabase functions deploy analyze-insights
   ```
4. 사용: 관리자 대시보드 → **AI 팬 인사이트 분석** → 구단 선택 → "AI 분석 실행".
   - 의견이 30개 미만이면 분석하지 않고 부족 안내를 반환합니다.
   - 성공 시 `ai_insights` 에 저장되고, 팬 **AI 인사이트** 화면에 반영됩니다.
   - 결과가 없으면 팬 화면은 "의견 30개 이상 모이면 분석 시작" Empty State 를 표시합니다.
5. 구조: 클라이언트 `src/lib/ai/analyzeFanInsights.js` 는 Edge Function 호출/결과 조회만 담당하고,
   실제 OpenAI 호출·프롬프트는 `supabase/functions/analyze-insights/index.ts` 에 있습니다.
   (Supabase 미설정 시엔 별점/카테고리 기반 로컬 간이 분석으로 폴백)

### 배포 검증 절차 (analyze-insights)

**A. 시크릿 확인**
```bash
supabase secrets list      # OPENAI_API_KEY 존재 확인
# 없으면:
supabase secrets set OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-4o-mini
```
> `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 는 배포 시 자동 주입됩니다(직접 set 불필요).

**B. 배포**
```bash
supabase functions deploy analyze-insights
supabase functions list                 # analyze-insights 가 목록에 있는지
supabase functions logs analyze-insights # 실행 로그 관찰(문제 진단)
```

**C. ai_insights 테이블 확인 (SQL Editor)**
```sql
-- 존재/컬럼 확인
select column_name, data_type from information_schema.columns
 where table_schema='public' and table_name='ai_insights' order by ordinal_position;
-- RLS 정책 확인
select policyname, cmd from pg_policies where tablename='ai_insights';
-- 저장 결과 확인(분석 실행 후)
select club_id, period, sentiment_positive, sentiment_neutral, sentiment_negative,
       jsonb_array_length(keywords) as kw, created_at
  from public.ai_insights order by created_at desc limit 5;
```

**D. 기능 검증 체크리스트**
- [ ] 관리자 계정으로 로그인 (profiles.role = 'admin')
- [ ] 관리자 대시보드 → **AI 팬 인사이트 분석** 패널 표시
- [ ] 구단 선택 → **AI 분석 실행** 클릭
- [ ] 의견 30개 이상: "AI 분석이 완료되어 저장되었습니다." + ai_insights 에 row 추가
- [ ] 의견 30개 미만: "의견이 부족합니다 (n/30)…" 안내
- [ ] 팬 **AI 인사이트** 화면에서 저장된 결과(감정/키워드/요약/추천) 표시
- [ ] 결과 없는 구단: "의견 30개 이상 모이면 분석 시작" Empty State
- [ ] 일반 사용자로 함수 호출 시 차단(관리자 role 확인)

### 오류 해결 (Troubleshooting)
| 증상 / code | 원인 | 해결 |
|---|---|---|
| `openai_not_configured` | OPENAI_API_KEY 미설정 | `supabase secrets set OPENAI_API_KEY=...` 후 재배포 |
| `forbidden` | 호출자가 admin 아님 | `update profiles set role='admin' where email='...'` |
| `insufficient` | 의견 30개 미만 | 의견이 더 쌓인 뒤 실행(임계값은 함수 `MIN_OPINIONS`) |
| `openai_failed` | OpenAI 호출/파싱 실패 | `functions logs` 확인, 키/모델/쿼터 점검 |
| `save_failed` | ai_insights insert 실패 | 0009 마이그레이션 실행 여부·컬럼 확인 |
| `network` / 호출 자체 실패 | 함수 미배포/CORS | `functions list` 로 배포 확인, 재배포 |
| 함수는 되는데 화면 반영 안 됨 | ai_insights read RLS | select 정책(authenticated) 확인, 재로그인 |

> API Key 가 아예 없을 때: 프론트는 **Supabase 미설정이면 로컬 간이 분석**으로 폴백하고,
> **Supabase 는 설정됐지만 OPENAI_API_KEY 만 없으면** 관리자 화면에 `openai_not_configured` 안내를 표시합니다.

---

## 회원 완전 탈퇴 (delete-account Edge Function)
설정 → 회원탈퇴 모달에서 "탈퇴합니다" 입력 시 `delete-account` 함수가 **본인 계정만** 완전 삭제합니다.

- 스키마: `supabase/migrations/0010_account_hardening.sql` 적용
  (`profiles.deactivated_at`, `email_codes`; `email_codes` 는 email PK 인덱스 보유).
- 배포(로그인 사용자만 호출 → 기본 verify_jwt=true 유지):
  ```bash
  supabase functions deploy delete-account
  ```
- 시크릿: **불필요**. `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 는 자동 주입됩니다.
  (service_role 키는 이 함수 안에서만 사용 — 프론트 노출 금지)

### 동작
1. 요청자 JWT 검증(비로그인 차단). 삭제 대상은 **검증된 JWT 의 user.id 로 고정** → 타인 계정 삭제 불가.
2. profiles 를 익명화(닉네임 '탈퇴한 사용자', email/avatar 등 제거)한 뒤
   `auth.admin.deleteUser(user.id)` 로 완전 삭제.
3. FK `ON DELETE CASCADE` 로 opinions/comments/likes/survey_responses/notifications 삭제,
   team_news/surveys 의 author 는 NULL 로 익명화(콘텐츠는 보존).
4. 클라이언트는 세션 제거 후 로그인 페이지로 이동.

> 함수 미배포/실패 시 앱은 폴백으로 프로필을 비활성화(`deactivated_at`)하고 로그아웃하여
> 로그인은 즉시 차단됩니다.

### 검증 체크리스트
- [ ] 본인 계정으로 탈퇴 → auth.users/profiles 행 삭제 확인
      `select count(*) from auth.users where id='<uid>';` → 0
- [ ] 삭제 후 같은 계정 로그인 불가
- [ ] 함수는 JWT 의 user.id 만 삭제 → 다른 사용자 삭제 불가(입력 id 없음)
- [ ] Mock 모드: 로컬 사용자 레코드 삭제 + 세션 제거
