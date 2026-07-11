# FANCLUV 스테이징 구축 — 단계별 안내

> 현재: **스테이징 미존재. 로컬은 프로덕션(cuuzbddxnzhhlrqmmebz)에 링크됨.**
> 아래 **Step 1 은 사용자가 대시보드에서 직접** 하고, "스테이징 생성 완료"를 알려주시면
> Step 2~6(마이그레이션·함수·Preview·계정·Smoke)은 제가 실행합니다.

## Step 1 — Supabase 스테이징 프로젝트 생성 (👤 사용자 직접)
1. https://supabase.com/dashboard → **New project**
2. 이름: **`fancluv-staging`** (프로덕션과 다른 별도 프로젝트) · Region 자유 · DB 비밀번호 설정(메모)
3. 생성 후(수 분) → **Project Settings → API** 에서 다음 3개 값을 확보:
   - **Project URL** (예: `https://<STAGING_REF>.supabase.co`)
   - **anon / publishable key** (공개 키)
   - **Project ref** (URL 의 서브도메인, 예: `<STAGING_REF>`)
4. 저에게는 **URL 과 project ref 만** 알려주세요(둘 다 공개값).
   - ❗ **service_role 키·DB 비밀번호는 채팅에 붙여넣지 마세요.** 그 값들은 아래 Step 4/7에서
     `npx supabase ...`(대시보드 로그인 기반) 로 처리하거나, 필요한 경우 **로컬 비추적 파일**
     (`.env.staging.local`, git-ignored)에 사용자가 직접 넣어 스크립트가 env 로만 읽습니다.

## Step 2 — 링크 & 마이그레이션 (🤖 확인 후 제가 실행)
```bash
node tests/staging/link-check.mjs                 # 현재 링크 확인
npx supabase link --project-ref <STAGING_REF>     # 스테이징으로 전환
node tests/staging/link-check.mjs --expect-staging # 프로덕션이면 중단
npx supabase db push --yes                        # 0001~0049 전체 적용
# 검증: RLS 28/28, submit_survey_response, notifications dedup index, 성능 인덱스 3개
npx supabase link --project-ref cuuzbddxnzhhlrqmmebz  # 작업 후 프로덕션 복귀
```

## Step 3 — Edge Functions 배포 (🤖) — 외부 유료 격리
```bash
npx supabase functions deploy   # 전체
# 외부 과금 차단: OPENAI_API_KEY 미설정, LEAGUE_PROVIDER=mock, RESEND 미설정,
#   뉴스 외부 호출 없음(Provider mock). 스테이징 secret 은 프로덕션과 완전 분리.
```

## Step 4 — Vercel Preview 연결 (👤 대시보드 + 🤖 배포)
- Vercel → Settings → Environment Variables → **Preview** 스코프에만:
  - `VITE_SUPABASE_URL` = 스테이징 URL
  - `VITE_SUPABASE_ANON_KEY` = 스테이징 anon
  - `VITE_LEAGUE_PROVIDER` = (비우거나 mock)
- **Production 환경변수는 변경 금지.** 이후 `vercel`(Preview 배포) → Network 에서
  요청 대상이 **스테이징 URL** 인지 검증.

## Step 5 — 테스트 계정 (🤖, 스테이징 service_role 필요)
- `tests/seed/accounts.mjs`(작성 예정) 가 fan-a/b/c·admin·staff·superadmin·club-seoul/ulsan·
  club-admin-seoul·disabled-user 를 **`test+TEST_...@fancluv.test`** 로 생성.
- 비밀번호는 `.env.staging.local`(git-ignored) 의 `TEST_PW` 로만. Git 저장 금지.
- 정리: `tests/seed/cleanup.mjs` — `test+` 이메일·`TEST_` prefix 만 삭제.

## Step 6 — Smoke (🤖, 100 VU 부하는 아직 금지)
- 회원가입/로그인 · fan-a 의견 · fan-b 댓글/공감 · fan-a 알림 · 설문 생성/제출 ·
  중복 제출 차단 · 관리자 접근 · Club Seoul 자기팀 접근 / Ulsan 차단 · RLS 직접호출 차단.

## 안전 가드(이미 구현·검증됨)
- 모든 seed/concurrency/load 스크립트는 `tests/staging/guard.mjs` 를 통해
  **프로덕션 URL/ref · STAGING_CONFIRM 없음 · TEST_ prefix 아님 · service_role 없음** 이면
  **즉시 종료**. (실증: 프로덕션 URL 로 seed 시도 → `⛔ 가드 차단: 프로덕션 URL/ref`)

## Step 7 이후 — 성능 Phase (Smoke 통과 후, 순차)
```bash
# 공통 env: STAGING_URL=... STAGING_CONFIRM=yes TEST_DATA_PREFIX=TEST_ SERVICE_ROLE=<staging>
node tests/seed/seed.mjs small                      # 1) Small seed
node tests/concurrency/likes-race.mjs               # 2) 동시 공감 20
node tests/concurrency/survey-submit-race.mjs       # 3) 동시 설문 20
node tests/seed/seed.mjs medium                     # 4) Medium seed
#  5) RPC EXPLAIN ANALYZE (스테이징 SQL editor 또는 감사 함수)
k6 run -e BASE_URL=<staging> -e ANON=<staging-anon> -e VUS=10  tests/load/mixed-traffic.js  # 6) 10 VU
k6 run ... -e VUS=100 -e DURATION=5m tests/load/mixed-traffic.js   # 7) 100 VU
#  8) 안정 시에만 1,000 VU (스테이징 한도 확인 후)
```
각 단계는 **이전 단계 성공 시에만** 진행. 중단 기준: 5xx>1% · p95>2s · 429 폭증 · 무결성 오류.
