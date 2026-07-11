# FANCLUV — Phase 2 하니스 (스테이징·동시성·부하)

> 이 디렉터리의 스크립트는 **스테이징 전용**입니다. 프로덕션 URL/DB/service_role 을
> 넣지 마세요. 각 스크립트는 `STAGING_URL` 이 프로덕션이면 **실행을 거부**합니다.

## 0. 왜 이번 턴에 실행하지 못했나 (정직)
- 별도 **Supabase 스테이징 프로젝트 생성은 사용자 계정 접근이 필요**해 Claude 가
  프로비저닝할 수 없습니다. 따라서 아래 하니스는 **작성 완료·실행 미수행**입니다.
  스테이징이 생기면 그대로 실행합니다.

## 1. 스테이징 구축 (사용자 실행)
```bash
# (1) Supabase 스테이징 프로젝트 생성 — 대시보드 또는:
#     https://supabase.com/dashboard → New project (예: fancluv-staging)
# (2) 로컬에서 스테이징에 링크(프로덕션과 분리된 별도 ref):
npx supabase link --project-ref <STAGING_REF>
# (3) 마이그레이션 전체 적용(프로덕션과 동일 스키마):
npx supabase db push --yes
# (4) 스테이징 시크릿(프로덕션과 분리 — 외부 유료 API 는 비우거나 Mock):
npx supabase secrets set LEAGUE_PROVIDER=mock            # 부하 중 외부 API 격리
#    OPENAI_API_KEY 는 스테이징에 설정하지 말 것(부하 중 비용 차단)
# (5) Edge Function 배포:
npx supabase functions deploy
# (6) 링크 원복(작업 후 프로덕션으로):
npx supabase link --project-ref cuuzbddxnzhhlrqmmebz
```
- **Vercel Preview**: `vercel` (프로덕션 아님) 로 Preview 배포, 환경변수는 스테이징
  Supabase URL/anon 만. `VITE_SUPABASE_URL`/`ANON_KEY` 는 스테이징 값.
- **절대 금지**: 프로덕션 `service_role`/DB URL 을 테스트 클라이언트/스크립트에 주입.

## 2. 테스트 계정 매트릭스 (스테이징)
| 계정 | 역할 | 목적 | 정리 |
|---|---|---|---|
| anon | 비로그인 | 보호 리소스 접근 거부 확인 | — |
| fan-a/b/c | user | 소유권/공감/설문/알림 격리 | 이메일 `test+fanA@...` 삭제 |
| admin/staff/superadmin | admin/staff/superadmin | 역할별 허용범위 | 삭제 |
| club-seoul/ulsan | club | 팀 격리 | 삭제 |
| club-admin-seoul | club_admin | 구단 관리 | 삭제 |
| disabled-user | user(deactivated) | 세션 거부 | 삭제 |
- 토큰은 **환경변수(JWT_FAN_A 등)로만** 전달. 로그/Git 저장 금지.
- 계정 생성: `tests/seed/accounts.mjs`(admin API, 스테이징 service_role), 정리:
  `tests/seed/cleanup.mjs` — 모두 `test+` prefix 이메일만 대상.

## 3. 실행 명령 (스테이징 준비 후)
```bash
# 동시성(Node):
STAGING_URL=... JWT_FAN_A=... node tests/concurrency/likes-race.mjs
STAGING_URL=... JWT_FAN_A=... node tests/concurrency/survey-submit-race.mjs
# seed:
STAGING_URL=... SERVICE_ROLE=... node tests/seed/seed.mjs small
STAGING_URL=... SERVICE_ROLE=... node tests/seed/cleanup.mjs
# 부하(k6 필요):
k6 run -e BASE_URL=... -e ANON=... tests/load/mixed-traffic.js   # Stage A(10 VU)
```
- **중단 기준**(모든 부하): 5xx>1% · p95>2s 지속 · 429 폭증 · 무결성 오류 · 쿼터/비용 위험.
- **Stage 순서**: A(10 VU/2분) → 안정 시 B(100/5분) → 스테이징 한도 허용 시 C(1,000/10분).
  D(5,000)/E(10,000) 는 전용 인프라·사전 승인 있을 때만. **추정치로 지원 주장 금지.**

## 4. 안전 가드
- 모든 스크립트는 `STAGING_URL` 에 프로덕션 ref(`cuuzbddxnzhhlrqmmebz`)가 있으면 즉시 종료.
- seed 데이터는 전부 `TEST_` prefix / `test+` 이메일 → cleanup 으로 일괄 삭제.
