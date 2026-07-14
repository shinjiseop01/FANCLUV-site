# FANCLUV Closed Beta 운영 문서

> 프로덕션 URL: https://fancluv-site.vercel.app
> Supabase 프로덕션 ref: `cuuzbddxnzhhlrqmmebz` · 스테이징 ref: `frerrxntbtcapapvbqwb`
> 원칙: 프로덕션 즉석 코드 수정 금지 · 실사용자 데이터 오염 금지 · 모든 수정은 스테이징 검증 후 반영.

## 1. 운영자 연락 / 역할
- **1차 대응(온콜)**: 서비스 상태·장애 1차 확인, Runbook 실행, 상태 공지.
- **DB/백엔드**: Supabase(마이그레이션·Edge·RLS) 담당.
- **프론트/배포**: Vercel 배포·롤백 담당.
- *(연락처·에스컬레이션 경로는 팀 내부 채널에 별도 관리 — 본 문서에는 개인정보 미기재.)*

## 2. 장애 대응
- [운영 Runbook](./runbook.md)의 시나리오별 절차(발견→원인→임시→영구→복구)를 따릅니다.
- 진단 시작점: 관리자 `/admin/system`(Health Check + 운영 요약), Supabase/Vercel 로그.
- 치명 장애 시: 상태 공지 → Runbook 실행 → 필요 시 직전 배포로 롤백 → 복구 확인 → 사후기록(원인·조치·재발방지).

## 3. 업데이트 / 배포 절차
1. **스테이징 개발·검증**: 기능/수정은 항상 스테이징에서 구현 → 통합/권한/무결성 검증.
2. **품질 게이트**: `npm run build` · `npm run lint`(error 0) · `npm test`(전체 통과).
3. **Commit → Push**: Conventional Commit, `origin/main`. (force push 금지)
4. **DB**: 신규 migration만 `supabase db push`(대상 ref 3중 확인).
5. **Edge**: 변경 함수만 `supabase functions deploy <name> --project-ref <ref>`.
6. **프론트**: `vercel --prod`(working tree clean·HEAD=origin/main 확인).
7. **배포 후 검증**: 프로덕션 스모크(관리자/팬/구단), Console/Network 오류 0.
8. **작업 후 링크 원복**: 로컬 Supabase link를 **스테이징으로 원복**(`link-check --expect-staging`).

## 4. 롤백 절차
- **프론트(Vercel)**: 대시보드에서 직전 정상 Production Deployment를 Promote(alias rollback).
- **Edge**: 로컬에서 직전 정상 커밋 체크아웃 → `functions deploy`. (자동 이전버전 롤백이 없을 수 있음)
- **DB migration**: 데이터 손상 여부 확인이 우선. 롤백이 보안 취약점(0054/0055 가드, 0056 삭제 직렬화)을 재노출하면 **롤백 금지** → 스테이징 후속 migration으로 수정.
- **회원 Hard Delete**: 복구 불가 → 오작동 시 추가 삭제 즉시 차단 + Audit/request_id 보존 + P0 처리.

## 5. 회원 문의 대응
- 계정/로그인/이메일 인증: Runbook 5(로그인)·10(메일) 참조. 이메일 인증은 `claim_profile_email`/`send-email-code` 경로.
- 회원 삭제 요청: 관리자 `/admin/members` → 삭제(사유 필수·확인문구·역할 권한). Hard Delete는 복구 불가 안내 후 진행.
- 개인정보(본인인증 DI/CI): 서버 신뢰 컬럼으로 사용자 직접 수정 불가(0055 가드). 문의 시 서버 경로로만 처리.

## 6. 버그 접수 / 트리아지
- 접수 채널(베타 참여자용)로 재현 절차·환경·스크린샷 수집.
- **심각도 분류**: P0(보안·데이터 손상·전체 장애) 즉시 / P1(핵심 기능 불가) 당일 / P2(부가·개선) 백로그.
- 재현 → 스테이징 수정 → 검증 → 배포. P0는 [위험요소](./release-checklist.md) 및 사후기록.

## 7. 로그 확인
- **Audit Log**: 관리자 행위(회원 정지/역할변경/삭제, 의견·설문·뉴스 삭제) — `/admin` 감사 로그(관리자 RLS). 민감정보(비번/JWT/service_role/DI/CI) 미기록, 이메일 마스킹.
- **Security Event**: 로그인 실패/권한 거부/자기삭제·최후 superadmin·비인가 삭제 시도.
- **삭제 작업 상태**: `admin_deletion_operations` RPC(관리자, PII 없음) — failed/stuck 식별.
- **인프라 로그**: Supabase(Postgres/Auth/Edge), Vercel Runtime Logs.

## 8. 긴급 대응 (P0)
1. 영향 범위·데이터 손상 여부 즉시 확인(추측 금지, 실조회).
2. 확산 차단(트래픽·기능 일시 비활성, 추가 파괴적 작업 중단).
3. 상태 공지.
4. Runbook 실행 → 임시 대응 → 스테이징 수정 → 검증 → 반영.
5. 복구 확인(health-check·스모크) → 사후기록(타임라인·원인·조치·재발방지).

## 9. 운영 인프라 현황 (실측 기준)
- **Edge Functions(프로덕션 ACTIVE)**: health-check, alert-dispatch, admin-delete-user, delete-account, send-email-code, kakao/naver-callback, league-fetcher, news-fetcher, summarize-news, analyze-insights, openai-check. *(identity-verify는 프로덕션 목록에 없음 — 본인인증 경로 배포 여부 확인 필요.)*
- **외부 시크릿(프로덕션, 값 미노출)**: OpenAI **설정+유효**, Resend(email) **설정+유효**. Slack/Discord/알림이메일(ALERT_EMAIL_TO) **미설정**. Sentry DSN **미설정**(코드 stash). League **미검증**.
- **모니터링**: health-check + integration_health/logs + 운영 대시보드(활성 사용자/최근 오류/Slow API/Cache Hit) + alert-dispatch(관리자 in-app 알림 + dedup).
