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

---

# Phase 20-C 재평가 (2026-07-22, staging `frerrxntbtcapapvbqwb` 실측)

> Claude가 직접 접근 가능한 범위(Management API·Edge 호출·DB)로 실측. 브라우저 실 OTP/OAuth E2E와
> 모바일 실측은 사용자 수행(아래 체크리스트). 민감값(키/토큰/OTP)은 문서에 남기지 않음.

## 재평가 게이트 표
| 항목 | 상태 | 원인 / 근거 | READY로 만들 남은 작업 |
|---|---|---|---|
| Email Provider | ✅ READY | RESEND_API_KEY 설정 + EMAIL_FROM 설정(`FANCLUV <noreply@fancluv.com>`) + RESEND 도메인 검증 완료(SPF/DKIM) + 실 브라우저 OTP 수신 확인(Gmail 2026-07-22) | — |
| Edge Functions | ✅ READY | send-email-code·complete-signup·kakao-callback·naver-callback 배포(16개) + 프로덕션 재배포(send-email-code, 2026-07-22) | — |
| Database | ✅ READY | email/nickname 정규화 UNIQUE 2종 + complete_signup RPC + 프로덕션 0072/0073/0074 적용 | — |
| Migration | ✅ READY | 스테이징 0072-0074 + 프로덕션 0072-0074(2026-07-22) | — |
| Environment Variables | ✅ READY | 프로덕션이 올바른 Supabase 프로젝트(cuuzbddxnzhhlrqmmebz) 지시, 비밀키 번들 미포함 | — |
| Realtime | ✅ READY(설계) | 팀 집계 1채널 + polling fallback(0069) | 실브라우저 부하 재확인(선택) |
| **EMAIL_FROM** | ✅ READY | fancluv.com 도메인 소유·DNS 인증(SPF/DKIM) 완료 + 운영용 발신자 `FANCLUV <noreply@fancluv.com>` 설정(프로덕션, 2026-07-22 11:36 UTC) | — |
| **모바일 회원가입 QA** | ✅ READY | 375/390/430/768 viewport 모두 overflow·가림 없음, OTP 입력·중복 클릭 차단 정상(2026-07-22 실측) | — |
| **Health Check 엔드포인트** | ✅ READY | GET /api/health/email-provider 구현 완료(캐시 45초, rate limit 60/min, secret 비노출, READY/NOT_READY/DEGRADED 상태) | — |
| **OAuth (Google)** | 🔄 DEFERRED | 베타 기간 중 이메일 회원가입만 제공. UI는 feature flag로 비활성화, 백엔드 코드 유지. 정식 출시 시 별도 E2E 진행 | 정식 출시 전 별도 OAuth 실 E2E 계획 |
| **OAuth (Kakao/Naver)** | 🔄 DEFERRED | 베타 기간 중 이메일 회원가입만 제공. 커스텀 Edge(kakao/naver-callback) 코드 유지, UI는 비활성화 | 정식 출시 전 별도 OAuth 실 E2E 계획 |
| **Storage** | ⚠️ WARNING | `avatars`·`news-images` 둘 다 public, **file_size_limit·allowed_mime_types 미설정**(무제한 업로드 위험) | 버킷별 크기 제한 + MIME allowlist 설정, 미사용 버킷 정리 |
| AI Provider | ⚠️ WARNING | `OPENAI_API_KEY` 미설정 → AI 인사이트/뉴스요약 extractive 폴백 | 베타 필수 아님. AI 실사용 시 키 설정 |
| Observability | ⚠️ WARNING | Edge 로그로 사유 확인 가능. Sentry는 stash 대기 | Sentry DSN 확정 후 sink 연결(별도) |

### 프로덕션 승격 최소 게이트(P0) 현재 상태 (2026-07-22 최종 확정)
1. Email Provider — ✅ READY (RESEND_API_KEY + EMAIL_FROM + 도메인 인증 + 실 OTP 수신 확인)
2. OAuth — 🔄 DEFERRED (베타에는 이메일 가입만 제공, 코드 유지, UI 비활성화)
3. 필수 Edge 배포 — ✅ (프로덕션 배포 완료)
4. DB migration + UNIQUE/RPC — ✅ (프로덕션 0072-0074 적용)
5. 프론트 env가 대상 프로젝트를 정확히 지시 — ✅(프로덕션: cuuzbddxnzhhlrqmmebz)
6. 비밀키 번들 미포함 — ✅
7. 모바일 회원가입 QA — ✅ (375/390/430/768 viewport 모두 통과)
8. Health Check 엔드포인트 — ✅ (GET /api/health/email-provider 구현)

---

## 1) EMAIL_FROM 운영 적용 절차 (도메인 준비 후)
1. RESEND에서 발신 도메인 추가 → DNS(SPF/DKIM/DMARC) 레코드 등록 → 인증 완료.
2. 운영용 no-reply 주소 결정: 예 `FANCLUV <no-reply@메일도메인>`.
3. 시크릿 설정(스테이징):
   ```bash
   npx supabase secrets set EMAIL_FROM="FANCLUV <no-reply@your-domain.com>" \
     --project-ref frerrxntbtcapapvbqwb
   ```
4. Health Check로 확인: `send-email-code {action:'health'}`(관리자) → `checks.email_from: true`.
5. 미설정 시 Health Check는 `email_from:false`(WARNING)로 유지 — 기본 발신자로도 발송은 되나 도착률·브랜딩 저하.

## 2) Storage READY 절차 (Dashboard 또는 API)
- `avatars`(프로필 이미지), `news-images`(뉴스 이미지) — 둘 다 public read는 유지 가능하나 업로드 제한 필요:
  - `file_size_limit`(예: avatars 2MB, news-images 5MB)
  - `allowed_mime_types`(예: `image/png,image/jpeg,image/webp`)
  - 업로드 RLS: 인증 사용자·본인 경로만 write(현재 정책 재확인 권장).
- 미사용 버킷 없음(2개 모두 사용 중). Storage 정책은 Dashboard 설정이라 코드 변경 없음.

## 3) OAuth READY 절차 (Google, Dashboard)
1. Authentication → Providers → Google 활성화 + Client ID/Secret 입력.
2. Authentication → URL Configuration:
   - `Site URL`을 배포 도메인으로(현재 `http://localhost:3000` → 예 `https://fancluv-site.vercel.app` 또는 staging preview URL).
   - `Redirect URLs`(allowlist)에 `<배포도메인>/auth/callback` 추가(현재 비어 있음).
3. Google Cloud Console OAuth 클라이언트의 Authorized redirect URI에 Supabase 콜백 URL 등록.
4. 코드는 이미 `prompt=select_account` 적용됨(항상 계정 선택창).

---

## 4) 브라우저 회원가입 E2E 체크리스트 (사용자 5분)
> staging 연결 프론트에서 수행. OTP는 브라우저 입력창에만 입력(채팅 금지). 민감값 회신 금지.

| 단계 | 정상 결과 | 실패 조건 | Network 확인 | Console 확인 |
|---|---|---|---|---|
| 이메일 입력 → 인증번호 받기 | "인증번호 발송" 안내 | 500/`provider_unconfigured` | `send-email-code` 1회, 200 | 오류 0 |
| 메일 OTP 입력 → 인증 | 인증 완료 표시 | mismatch/expired | `send-email-code`(verify) 1회 | 오류 0 |
| 닉네임/팀/비번 → 최종 제출 | 가입 성공·이동 | raw SQL/500 | `complete-signup` **1회** | 오류 0 |
| 자동 로그인·메인 진입 | 로그인 상태로 진입 | 무한 redirect | auth session 정상 | redirect loop 0 |
| 프로필 생성 | 프로필 존재 | 프로필 없음 | — | — |
| 로그아웃 → 재로그인 | 동일 계정 로그인 | 새 계정 생성 | — | — |
| 새로고침 | 세션 유지 | signup으로 튕김 | — | auth loop 0 |
| **중복 닉네임**(다른 이메일) | "이미 사용 중"·닉네임 focus·OTP 유지 | 이메일 단계로 복귀 | `complete-signup` 409/코드 | raw error 0 |
| **동일 이메일 재가입** | "이미 가입된 이메일 + 로그인 CTA" | 새 프로필/무한 OTP | 500 0 | — |
| **중복 submit**(버튼 5회/Enter 5회) | — | — | `complete-signup` **정확히 1회** | — |

## 5) 모바일 QA 체크리스트 (375 / 390 / 430 / 768)
> Chrome DevTools Device Mode(⌘⇧M) 또는 실기기. 각 폭에서 아래 확인.

- [ ] 가로 overflow 없음(문서가 좌우로 안 밀림)
- [ ] 입력창(이메일/OTP/닉네임/비번) 탭·입력 정상, 확대 없이 입력(폰트 ≥16px)
- [ ] 키보드 올라올 때 **현재 입력창·제출 버튼 접근 가능**(가림 없음) — `100dvh`+safe-area 적용됨
- [ ] Safe Area(노치/홈바) padding 적정(과도 여백 없음)
- [ ] 스크롤로 폼 전체 접근 가능(중첩 스크롤 없음)
- [ ] 버튼 터치 영역 충분, 로딩 중 disabled
- [ ] 오류 메시지 줄바꿈·잘림 없음
- [ ] OTP 입력(numeric 키패드, 붙여넣기)
- [ ] 한글 닉네임 조합 중 마지막 글자 누락 없음·Enter 오제출 없음

**실기기 테스트법**: 같은 네트워크에서 `npm run dev -- --host` → 폰 브라우저로 `http://<PC-IP>:5173/signup` 접속(또는 staging preview URL). iOS Safari·Android Chrome 각 1회 권장.
