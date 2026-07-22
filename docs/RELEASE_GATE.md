# FANCLUV — Beta Release Gate Checklist

베타 배포(스테이징 검증 → 프로덕션 승격) 전에 반드시 확인해야 하는 운영 항목.
각 항목은 **staging에서 먼저 확인**하고, 프로덕션 승격 시 동일 항목을 프로덕션에서 재확인한다.
민감한 값(API Key, service_role, token)은 문서·로그·채팅에 절대 남기지 않는다.

> 상태 표기: ✅ READY · ⛔ NOT READY · ❔ 미확인

---

## 1. Email Provider (OTP) — **P0**
회원가입 OTP 발송은 실제 이메일 공급자(RESEND)가 있어야 동작한다. 없으면 `send-email-code`가
`email_provider_unconfigured`를 반환하고 가입이 막힌다.

- [ ] `RESEND_API_KEY` 시크릿 설정됨 (send-email-code)
- [ ] `EMAIL_FROM` 설정됨(선택 — 미설정 시 `onboarding@resend.dev` 기본값, 도착률 위해 인증 도메인 권장)
- [ ] RESEND 발신 도메인 인증 완료(실제 임의 수신자에게 발송 가능)
- [ ] `send-email-code` health action → `status: READY`
- [ ] (선택) `TEST_HARNESS_KEY` — **스테이징에서만** E2E용, 검증 후 반드시 제거. 프로덕션 하드 차단(PROD_REF)

**빠른 확인**: `send-email-code`에 `{action:'health'}`(관리자 JWT) 호출 → `status`/`checks` 확인.

## 2. OAuth
- [ ] Google — `signInWithOAuth` + `prompt=select_account`(항상 계정 선택창). Provider Client ID/Secret 설정, redirect URL 등록
- [ ] Kakao — 커스텀 OAuth(Edge `kakao-callback`) 시크릿/Client 설정, redirect 등록
- [ ] Naver — 커스텀 OAuth(Edge `naver-callback`) 시크릿/Client 설정, redirect 등록
- [ ] Auth `SITE_URL` / redirect allowlist에 배포 도메인 포함
- [ ] 동일 이메일 OAuth ↔ email 가입 충돌 정책 확인

## 3. Edge Functions (배포 + 시크릿)
필수 함수가 대상 프로젝트에 **배포**되어 있고 필요한 시크릿이 있는지 확인.
- [ ] `send-email-code` (RESEND_API_KEY)
- [ ] `complete-signup`
- [ ] `kakao-callback` / `naver-callback` (OAuth)
- [ ] `send-welcome-email` (RESEND, 선택)
- [ ] AI/뉴스 계열(`analyze-insights`, `summarize-news`, `news-fetcher`, `league-fetcher` 등) — 사용 시 `OPENAI_API_KEY` 등
- [ ] 각 함수 `verify_jwt` 설정 적절(로그인 필요 함수는 true)

## 4. Storage
- [ ] 사용하는 버킷 존재 + public/RLS 정책 확인(팀 뉴스 이미지 등)
- [ ] 업로드 크기/타입 제한
- [ ] orphan 파일 정리 정책(문서화)

## 5. AI Provider
- [ ] `OPENAI_API_KEY` 설정(AI 인사이트/뉴스 요약 사용 시). 미설정 시 extractive/폴백 동작 확인
- [ ] AI 작성 지원(ai-writing-assist)은 **제거됨** — 재도입 금지
- [ ] 비용/rate limit 모니터링 계획

## 6. Realtime
- [ ] 실시간 통계는 팀 집계 row 1채널 구독 + polling fallback(과도 구독 금지)
- [ ] Realtime 활성 테이블/publication 확인
- [ ] 장애 시 polling으로 degrade 확인

## 7. Database / Migration
- [ ] 대상 프로젝트 `schema_migrations`가 저장소 최신과 일치
- [ ] 회원가입 무결성: `profiles_email_norm_uk` / `profiles_nickname_norm_uk` UNIQUE 존재(0072)
- [ ] `complete_signup` RPC 존재
- [ ] orphan(auth↔profile) 0, 정규화 이메일/닉네임 중복 0
- [ ] RLS 정책 적용, `security definer` 함수 `search_path` 고정

## 8. Environment Variables (Frontend / Vercel)
- [ ] `VITE_SUPABASE_URL` = 대상 프로젝트 URL(스테이징/프로덕션 정확히 구분)
- [ ] `VITE_SUPABASE_ANON_KEY` = 대상 프로젝트 anon key
- [ ] 빌드 SHA 주입(`__BUILD_SHA__`)로 스테일 배포 진단 가능
- [ ] service_role/RESEND/OPENAI 등 **비밀키가 프론트 번들에 포함되지 않음**

## 9. Observability / Ops
- [ ] Edge 로그에서 실패 사유 확인 가능(민감값 없이): OTP provider_unconfigured 등
- [ ] Sentry(또는 대체) DSN 설정 여부 확인(현재 stash `wip/sentry-awaiting-dsn-validation`)
- [ ] health-check 함수/System Status로 이메일 provider 상태 노출(백엔드 준비됨)

## 10. Menu / Feature Policy (회귀)
- [ ] 팬 메뉴 8종 유지: 홈 / 설문 / 팬 의견 / 팀 뉴스 / 경기센터 / AI 인사이트 / 팬 랭킹 / 내 활동
- [ ] Fan Pulse 재도입 없음, Quick Poll/AI 작성/Premium 미개발
- [ ] 홈 "우리 팀 실시간" 미재도입

---

### 프로덕션 승격 최소 게이트 (P0)
1. **Email Provider READY** (RESEND_API_KEY) — OTP 없이는 가입 불가
2. OAuth 3종 redirect/secret 정상
3. 필수 Edge Function 배포 + 시크릿
4. DB migration 최신 + 회원가입 UNIQUE/RPC 존재
5. 프론트 환경변수가 프로덕션 프로젝트를 정확히 가리킴
6. 비밀키 번들 미포함
