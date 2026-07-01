# FANCLUV — Supabase 연동 가이드 (1차: Auth + Profile)

이 문서대로 하면 **실제 회원가입 / 로그인 / 세션 / 프로필**이 동작합니다.
키를 넣기 전에는 앱이 기존 **localStorage Mock**으로 그대로 돌아갑니다(자동 폴백).

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
