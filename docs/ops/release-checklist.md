# FANCLUV Closed Beta Release Checklist

> 표기: ✅ 검증 완료 · ⚠️ 조건부/부분 · ⛔ 미완료 · 🔶 외부설정 필요 · ❔ 미검증
> 근거는 Phase 3~8 실측 기준. Closed Beta 오픈 전 이 목록을 최종 확인합니다.

## 필수 / 품질 게이트
- ✅ Build 성공 (`npm run build`)
- ✅ Lint error 0 (`npm run lint`, 경고 90 baseline)
- ✅ Test 전체 통과 (`npm test`, 48/48; Sentry 테스트는 stash 제외 정상)
- ✅ Git `origin/main` 동기화(HEAD=origin/main), working tree clean

## 보안
- ✅ 권한 상승 차단(팬이 자기 role→admin 불가) — 0054
- ✅ DI/계정연결 무결성 컬럼 self-update 차단(identity_di_hash/provider/verified_at/linked_providers/provider_user_id/email 등 14컬럼) — 0055
- ✅ 정상 SECURITY DEFINER RPC(claim_profile_email) 회귀 없음 — 0055
- ✅ 회원 삭제 서버 권위 검증(클라이언트 role/email/team 불신, DB 재조회)
- ✅ service_role 프론트 번들 미포함(검증), 오류·감사 로그 시크릿 미노출
- ✅ 감사 로그 이메일 마스킹, 민감정보(비번/JWT/DI/CI) 미기록

## 권한 (역할 매트릭스)
- ✅ anon/fan/club/staff 무단 삭제 차단, admin→fan 삭제, superadmin→admin/staff/club 삭제
- ✅ 자기 자신·superadmin 대상·최후 superadmin 삭제 차단
- ✅ 프로덕션 역할 분포: user 4 / admin 1 / superadmin 1 / club 1 (staff·club_admin 실계정 없음 — enum·정책은 준비됨)
- ✅ RLS: 타인 profile 수정 차단, 팬 audit/security/operations 조회 차단

## DB
- ✅ 프로덕션 마이그레이션 0001~0056 적용
- ✅ admin_user_deletion_operations(UNIQUE target_user_id) + RLS + service_role 전용 RPC
- ✅ 삭제 시 CASCADE + NO ACTION FK NULL 정리 → orphan row 0
- ❔ Supabase 자동 백업 주기·PITR 활성 여부(대시보드 실확인 필요 — [backup-policy](./backup-policy.md))

## Edge Functions
- ✅ 프로덕션 11개 함수 ACTIVE(admin-delete-user v2/claim, alert-dispatch, health-check 등)
- ✅ admin-delete-user 동시 20 → claimed 1 / audit 1 / 5xx 0 / orphan 0(exactly-once)
- ⚠️ identity-verify 프로덕션 목록에 없음 → 본인인증 경로 배포 여부 확인 필요

## Vercel
- ✅ 프로덕션 배포(HTTP 200), 최신 커밋 반영, 회원삭제 UI 포함, Sentry 번들 제외
- ✅ 관리자 UI E2E(모달·사유·확인문구·disabled 게이팅·실삭제·refetch·total 감소) 콘솔 오류 0

## OAuth / 본인인증
- ⚠️ Google/Kakao/Naver: 콜백 함수 배포됨(kakao/naver-callback ACTIVE). 실제 로그인은 사용자 동의 필요 → **배포 후 수동 QA 필요(❔ 미검증)**
- ⚠️ 본인인증(DI/CI): 무결성 보호는 완료(0055). identity-verify 함수 배포/동작 **❔ 미검증**

## 로그 / 감사
- ✅ Audit Log(회원 정지/역할변경/삭제·의견/설문/뉴스 삭제) 관리자 조회, exactly-once
- ✅ Security Event(자기삭제/최후superadmin/비인가 시도) 기록
- ✅ 삭제 작업 관측 RPC(admin_deletion_operations, PII 없음)

## 운영 / 모니터링
- ✅ Health Check(db/auth/edge/storage/realtime/openai/email) 프로덕션 전 서비스 ok
- ✅ 운영 대시보드(활성 사용자/최근 오류/Slow API/Cache Hit/장애)
- ✅ Alert Dispatcher(관리자 in-app 알림 + dedup, 복구 알림). 외부 채널은 🔶 미설정
- ✅ Cache Metrics(hit/miss/TTL/invalidate), Recovery(withRetry/복구 알림) 검증

## 성능
- ✅ fan_ranking 병목 수정(스테이징 1859ms→37ms) — 0051
- ✅ 주요 조회 쿼리 Index Scan(의견목록/알림/내활동)
- ⚠️ 부하: 스테이징 tier(1vCPU/60conn)에서 **100 VU 안정(496 TPS/실패 0%)**, **1000 VU 포화**(연결풀 한계). 프로덕션 tier 부하 ❔ 미검증

## 백업
- ✅ 코드·마이그레이션·함수 Git 복구 가능
- ❔ 실데이터(DB/Storage/Auth) 시점 복구·복원 리허설 미검증 → 오픈 전 확인 권장

## 외부 설정 필요(🔶)
- 🔶 Sentry `VITE_SENTRY_DSN`(원격 에러 수집 — 현재 코드 stash, no-op)
- 🔶 Slack `SLACK_WEBHOOK_URL` / Discord `DISCORD_WEBHOOK_URL` / 알림 이메일 `ALERT_EMAIL_TO`(장애 외부 통지)
- ❔ League API 키(프로덕션 설정 여부 미검증)
