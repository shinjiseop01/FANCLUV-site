# FANCLUV 운영 Runbook (장애 대응 절차)

> Closed Beta 운영용. 각 장애에 대해 **발견 → 원인 확인 → 임시 대응 → 영구 해결 → 복구 확인** 순서로 정리합니다.
> 프로덕션 Supabase ref: `cuuzbddxnzhhlrqmmebz` / 스테이징 ref: `frerrxntbtcapapvbqwb` / 프로덕션 URL: https://fancluv-site.vercel.app

## 공통 진단 도구
- **Health Check**: 관리자 로그인 → `/admin/system` (또는 Edge `POST /functions/v1/health-check`, 관리자 JWT). db/auth/edge/storage/realtime/openai/email 상태 + 응답시간.
- **운영 대시보드**: `/admin/system` 운영 요약(활성 사용자/최근 오류/Slow API/Cache Hit/장애).
- **Audit / Security 로그**: `/admin` 감사 로그, `security_events`(관리자 RLS).
- **Supabase 대시보드**: Logs(Postgres/Auth/Edge), Reports(연결 수·CPU·메모리).
- **Vercel 대시보드**: Deployments, Runtime Logs.

---

## 1. 서비스 장애 (전체 접속 불가)
- **발견**: 프로덕션 URL 5xx/무응답, 사용자 다수 접속 실패, health-check 다수 서비스 error.
- **원인 확인**: Vercel 상태(프론트) vs Supabase 상태(백엔드) 구분. `curl -I https://fancluv-site.vercel.app` → 프론트 서빙 여부. health-check → 백엔드 서비스별.
- **임시 대응**: 원인이 프론트면 Vercel 직전 정상 배포로 alias rollback. 백엔드면 해당 서비스 섹션(2~10) 참조. 필요 시 상태 공지(베타 채널).
- **영구 해결**: 근본 원인(배포 회귀/쿼리/연결 한도) 제거. 스테이징 재현·수정 후 재배포.
- **복구 확인**: health-check 전 서비스 ok, 대표 사용자 플로우(로그인·의견) 스모크.

## 2. DB 장애
- **발견**: health-check `db=error`, REST 500, "too many connections", 쿼리 지연 급증.
- **원인 확인**: Supabase Reports에서 연결 수(프로덕션 max_connections 확인)·CPU·느린 쿼리. 스테이징 실측 기준 소형 tier는 연결 풀 포화가 1차 병목.
- **임시 대응**: 비정상 트래픽·루프 쿼리 차단. 연결 누수 의심 시 PostgREST/pooler 재기동(Supabase 콘솔). Read 트래픽은 캐시(cache.js, TTL 30초)로 흡수.
- **영구 해결**: 인덱스/쿼리 최적화(예: fan_ranking은 0051에서 Nested Loop 제거), tier·pooler pool_size 상향.
- **복구 확인**: `select 1` 응답, health-check db ok, 의견 목록/랭킹 정상.

## 3. Edge Function 장애
- **발견**: 특정 기능(회원 삭제/헬스체크/알림/이메일/OAuth 콜백/뉴스·AI) 실패, Edge Logs 5xx.
- **원인 확인**: `supabase functions list --project-ref <prod>`로 ACTIVE 확인. Edge Logs에서 예외·타임아웃·시크릿 누락.
- **임시 대응**: 회귀 배포면 직전 정상 버전으로 재배포(로컬 이전 커밋 체크아웃 후 `functions deploy`). 시크릿 누락이면 Secrets 설정. 프론트는 `invokeFunction` 재시도(3회 백오프)로 일시 오류 흡수.
- **영구 해결**: 스테이징에서 수정·검증 후 재배포. 프로덕션 즉석 수정 금지.
- **복구 확인**: 해당 함수 정상 호출(예: health-check 200, admin-delete-user 권한/동시성 테스트).

## 4. Vercel 장애
- **발견**: 프론트 5xx/빌드 실패/자산 404, Vercel Deployment 오류.
- **원인 확인**: 최신 배포 상태(READY/ERROR), 빌드 로그, 환경변수 변경 여부.
- **임시 대응**: 직전 정상 Production Deployment로 **alias rollback**(Vercel 대시보드 Promote). 환경변수 오설정이면 원복.
- **영구 해결**: 로컬 `npm run build` 재현·수정 → 재배포.
- **복구 확인**: alias 200, 최신 커밋 반영, Console 오류 0.

## 5. 로그인 장애
- **발견**: 이메일 로그인 실패 급증, "invalid login"/세션 미생성.
- **원인 확인**: health-check `auth=error` 여부, Supabase Auth 상태, SITE_URL/redirect allowlist. 비번 재설정 흐름 확인.
- **임시 대응**: Auth 서비스 장애면 상태 공지. 설정(allowlist) 문제면 Supabase Auth 설정 복구.
- **영구 해결**: allowlist/SMTP(이메일 코드) 설정 정합화. `claim_profile_email`/`send-email-code` 경로 점검.
- **복구 확인**: 신규/기존 계정 로그인, 세션 유지, 이메일 인증(claim) 정상.

## 6. OAuth 장애 (Google/Kakao/Naver)
- **발견**: 소셜 로그인 리다이렉트 실패/콜백 오류(kakao-callback/naver-callback Edge).
- **원인 확인**: provider 콘솔의 redirect URI, SITE_URL allowlist, 콜백 Edge Logs, provider별 client id/secret.
- **임시 대응**: 특정 provider만 문제면 UI에서 해당 provider 안내/일시 비활성. 이메일 로그인은 대체 경로.
- **영구 해결**: redirect/secret 정합화, 콜백 함수 수정(스테이징 검증 후 배포).
- **복구 확인**: 각 provider 실제 로그인 성공, 계정 연결(linked_providers) 정상.
- **참고**: OAuth는 사용자 동의가 필요해 자동 점검 불가 → 배포 후 수동 QA.

## 7. Storage 장애 (avatars)
- **발견**: 아바타 업로드/표시 실패, health-check `storage=error`.
- **원인 확인**: 버킷(`avatars`, public) 상태·권한, Storage 서비스 상태.
- **임시 대응**: 업로드 일시 차단(UI 안내). 기존 이미지 CDN 캐시로 표시 유지.
- **영구 해결**: 버킷 정책/용량 점검, Storage 서비스 복구.
- **복구 확인**: 신규 업로드·표시, health-check storage ok.

## 8. Realtime 장애
- **발견**: 실시간 알림 미수신(NotificationCenter), health-check `realtime=error`.
- **원인 확인**: Realtime 서비스 상태, 채널 구독(notificationsRepo, realtime.js) cleanup 정상 여부.
- **임시 대응**: Realtime은 폴백으로 refetch 기반 조회 가능(치명 아님). 상태 공지.
- **영구 해결**: Realtime 서비스 복구, 구독/해제 로직 점검(메모리 누수 방지 cleanup 유지).
- **복구 확인**: 알림 실시간 수신, health-check realtime ok.

## 9. OpenAI 장애 (AI 인사이트/뉴스 요약)
- **발견**: AI 분석/요약 실패, health-check `openai`가 `error`(invalid_key/quota_exceeded/rate_limited 등).
- **원인 확인**: health-check openai 카테고리(valid/invalid_key/billing_required/quota_exceeded/rate_limited/network_error). Secret 존재≠유효 구분.
- **임시 대응**: AI 기능은 부가 기능 → 비활성/스킵, 핵심 서비스 영향 없음. quota면 사용량 조절.
- **영구 해결**: 키 회전/충전(billing), rate limit 백오프.
- **복구 확인**: health-check openai `ok(valid)`, AI 인사이트 재생성.

## 10. 메일 장애 (Resend — 이메일 코드/알림)
- **발견**: 이메일 인증코드 미수신, health-check `email` 관련 오류.
- **원인 확인**: RESEND_API_KEY 유효성(health-check email), 발송 도메인/rate. 알림 이메일은 `ALERT_EMAIL_TO` 필요.
- **임시 대응**: 이메일 인증 대신 관리자 수동 확인/재발송. 알림은 in-app(관리자 notification)으로 대체(항상 동작).
- **영구 해결**: Resend 키/도메인 검증, `send-email-code` 점검, 알림 이메일용 `ALERT_EMAIL_TO`·`RESEND` 설정.
- **복구 확인**: 인증코드 수신, alert-dispatch email 채널 `sent`(설정 시).

---

## 롤백 원칙 (공통)
- **DB 마이그레이션**: 되돌릴 때는 데이터 손상 여부부터 확인. 되돌림이 더 큰 취약점(예: 0054/0055 가드, 0056 삭제 직렬화)을 재노출하면 롤백 금지 → 스테이징에서 후속 migration으로 대응.
- **Hard Delete(회원 삭제)**: 복구 불가. 오작동 시 즉시 추가 삭제 차단 + Audit/request_id 보존 + P0 사고 처리.
- **프로덕션 즉석 코드 수정 금지**: 항상 스테이징 수정 → 검증 → 커밋/푸시 → 재승인 → 프로덕션 반영.
