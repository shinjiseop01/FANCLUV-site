# FANCLUV — 베타 배포 체크리스트

베타 공개 전 반드시 확인할 항목입니다. (마지막 점검: 2026-07-11)

---

## 1. 인증 / 이메일 설정 (Supabase Authentication)

### ✅ Confirm email (이메일 확인)
- **현재 라이브 상태: ON** (`mailer_autoconfirm = false`) — 라이브 `/auth/v1/settings` 실측 확인.
  - 즉 신규 이메일 가입자는 **이메일 확인을 완료해야** 로그인됩니다(베타에 적합한 안전 상태).
- 위치: Supabase Dashboard → **Authentication → Sign In / Providers → Email → "Confirm email"**
- ⚠️ 테스트를 위해 잠시 **OFF**(`mailer_autoconfirm = true`, 자동 확인)로 바꿨다면,
  **베타 공개 전 반드시 다시 ON** 으로 되돌려야 합니다.
  - Management API 로도 확인/변경 가능:
    `GET/PATCH https://api.supabase.com/v1/projects/<ref>/config/auth` 의 `mailer_autoconfirm`.

### 📧 메일 발송 (Resend)
- 인증번호/확인 메일은 Edge Function `send-email-code` 가 **Resend** 로 발송합니다.
- ⚠️ **Resend 도메인 인증(SPF/DKIM) 전에는 실제 메일 발송이 제한**됩니다.
  - 도메인 인증 완료 전에는 `send-email-code` 가 `devCode`(테스트용 코드)를 응답으로 반환해
    화면에 노출하는 폴백으로 동작합니다. **운영에서는 반드시 도메인 인증 후 실메일로 전환.**
- ⚠️ `onboarding@resend.dev` 발신 주소는 **테스트 전용** — 운영에는 사용하지 않습니다.
  자체 도메인(예: `no-reply@fancluv.<도메인>`)으로 `EMAIL_FROM` 시크릿을 설정하세요.

---

## 2. 소셜 로그인 (OAuth) — 상세: `OAUTH_SETUP.md`

| Provider | 라이브 활성화 | 남은 작업 |
|---|---|---|
| Google | ✅ Enabled | 없음(동작). Client ID/Secret 는 Supabase Providers 에만 보관 |
| Kakao | ⚠️ 커스텀 콜백 전환 | GoTrue 네이티브는 account_email 강제(KOE205) → **커스텀 `kakao-callback`** 사용. `supabase secrets set KAKAO_CLIENT_ID/SECRET/REDIRECT_URI/SITE_URL` + Vercel `VITE_KAKAO_CLIENT_ID` + Kakao Redirect URI 를 `functions/v1/kakao-callback` 로 + `functions deploy kakao-callback --no-verify-jwt` |
| Naver | ⛔ 시크릿 미설정 | `supabase secrets set NAVER_CLIENT_ID/SECRET/REDIRECT_URI/SITE_URL` + Vercel `VITE_NAVER_CLIENT_ID` + `vercel --prod` |

- 콜백: 앱 복귀 경로 `/auth/callback`(로딩·세션교환·프로필·라우팅·에러 처리).
- 이메일 미제공 소셜 계정: 로그인 정상, `profiles.email = NULL`. 필요 시 **설정 → 이메일 등록**
  카드에서 인증번호로 이메일을 추가할 수 있음(강제하지 않음).

---

## 3. 보안 (Secret 노출 금지)

- ✅ **프론트 번들에는 공개값만**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, (설정 시) `VITE_NAVER_CLIENT_ID`.
- ✅ **Client Secret / service_role / Naver Secret 은 서버에만**:
  - Google/Kakao Secret → Supabase Providers 설정 내부(프론트 노출 X).
  - `NAVER_CLIENT_SECRET`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
    → Supabase Edge Function 시크릿에만.
- ✅ OAuth 콜백 후 URL 의 토큰 해시는 supabase-js 가 정리하고, `/auth/callback` 은
  `navigate(replace)` 로 히스토리를 남기지 않습니다.
- 로그: 실패 시 `provider + code` 만 기록(토큰/인가코드/시크릿 미기록).

---

## 4. DB / 마이그레이션

- `supabase db push` 가 **"Remote database is up to date"** 인지 확인(누락 마이그레이션 없음).
- 핵심 트리거 `handle_new_user`(OAuth 프로필 자동 생성, 이메일/닉네임 fallback, `on conflict do nothing`).
- `claim_profile_email` RPC(이메일 등록 시 중복 확인 + 갱신) + `profiles_email_unique` 부분 유니크 인덱스.

---

## 5. 배포

- `vercel --prod` 후 alias 확인: `fancluv-site.vercel.app`.
- 프로덕션에서 이메일 가입 / Google / Kakao / (설정 시)Naver 로그인 스모크.
- Console/Network 에러 0 확인.

---

## 6. 베타 공개 직전 최종 스위치

- [ ] Confirm email **ON** 유지 확인 (`mailer_autoconfirm=false`)
- [ ] Resend 도메인 인증 완료 + `EMAIL_FROM` 자체 도메인
- [ ] Naver 시크릿/환경변수 설정(사용할 경우)
- [ ] 관리자/구단 테스트 계정 정리 또는 비활성
- [ ] `disable_signup` 정책 확인(공개 가입 허용 여부)
