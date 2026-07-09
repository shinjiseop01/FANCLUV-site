# FANCLUV

**K리그 팬 인텔리전스 · B2B SaaS 플랫폼**

FANCLUV는 K리그1 팬들이 구단·경기·이벤트·경기장 경험에 대한 의견과 설문을 남기면,
이를 **AI가 분석**해 구단(B2B 고객)에게 **팬 인사이트 · KPI · 감성 분석 · 불만 탐지 ·
주요 토픽 · 리포트 · 액션 추천**을 제공하는 플랫폼입니다.
팬은 **무료로 참여**하고, **구단이 유료 고객**이 되는 B2B 구조입니다.

## 서비스 구성

- **팬 앱** — 로그인/회원가입, 팀 선택, 팬 대시보드, 의견 공유, 설문 참여, 팬 랭킹, AI 인사이트, 경기센터, 팀 뉴스, 설정
- **관리자 콘솔(`/admin`)** — 대시보드·회원·의견·설문·뉴스/소스·공지·신고·리포트·Club Action/Tracker·B2B 고객·League API·시스템 상태·설정
- **구단 Executive 대시보드(`/executive`)** — 구단(B2B 고객) 전용. 원본 팬 데이터 없이 집계 KPI·정제 인사이트·전달 리포트·벤치마크만 제공

## 권한(Role)

`fan`(무료 참여) · `club`/`club_admin`(Club Account, 자기 구단만) · `admin` · `superadmin`(관리자 콘솔).
접근 제어는 `src/main.jsx`의 `RequireAuth`/`RequireAdmin`/`RequireClub` 가드로 강제합니다.

## 기술 스택

- React 19 + Vite + React Router 7 (JavaScript)
- 데이터: **Supabase-우선 + localStorage Mock 폴백** 어댑터 (`src/lib/*Repo.js`)
- 백엔드: Supabase(Postgres + RLS + Auth + Storage) + Edge Functions(Deno)
- 배포: Vercel (SPA fallback — `vercel.json`)
- i18n: 한국어/영어 (`src/locales/{ko,en}.js`), 다크/라이트 테마

## 실행

```bash
npm install
npm run dev      # 개발 서버 (Vite) — Supabase 미설정 시 Mock 데모 모드
npm run build    # 프로덕션 빌드 → dist/
npm run lint     # oxlint
```

> **개발(Mock) 모드**: Supabase 환경변수가 없으면 데모 데이터 + 데모 계정으로 동작합니다.
> **프로덕션**: Supabase 환경변수가 **필수**입니다. 미설정 상태로 프로덕션 배포 시 로그인이
> 차단되고(데모 계정 미시드) "서비스 설정 미완료" 안내만 표시됩니다.

## 실서비스 배포 (베타)

베타 배포 전 프로비저닝(Supabase 프로젝트·마이그레이션 `0001~0026`·Edge Function 9종·관리자/구단 계정·
RLS 검증·health-check)은 아래 문서를 따르세요.

- **[SUPABASE_SETUP.md](SUPABASE_SETUP.md)** — 프로비저닝 전체 가이드 + 마이그레이션/Edge Function 체크리스트
- **[SOCIAL_LOGIN_SETUP.md](SOCIAL_LOGIN_SETUP.md)** — Google/Kakao/NAVER 소셜 로그인
- **[PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)** — 아키텍처·기능·개발 히스토리 핸드오프 문서
- **[DESIGN.md](DESIGN.md)** — 디자인 시스템

## 환경변수

`.env.example`를 복사해 `.env`를 만들고 값을 채웁니다.

```bash
cp .env.example .env
```

클라이언트 공개값(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 등)과 서버 전용 시크릿
(`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `RESEND_API_KEY`, 리그/뉴스/본인인증 벤더 키 등,
`supabase secrets set`으로 설정)을 구분합니다. 자세한 항목은 `.env.example` 참고.
