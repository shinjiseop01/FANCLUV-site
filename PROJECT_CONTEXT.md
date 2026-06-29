# FANCLUV — 프로젝트 컨텍스트 (핸드오프 문서)

> 새 채팅에서 이 파일을 읽으면 바로 이어서 작업할 수 있도록 정리한 문서입니다.
> 최종 정리: 2026-06-30 / `main` 브랜치 기준 (작업 트리 clean)

## 1. 프로젝트 개요

**FANCLUV** — K리그1(2026 시즌) 축구 팬 커뮤니티 웹 앱 (MVP / 목업 단계).
팬이 응원 구단을 고르고, 의견을 나누고, 경기·뉴스·랭킹·AI 인사이트를 보는 SPA.

- **스택**: React 19 + Vite 8 + React Router 7 (`react-router-dom`)
- **언어/스타일**: JavaScript (TS 아님), 페이지별 `*.jsx` + `*.css` 1:1 구성
- **상태/데이터**: 백엔드 없음. 전부 **localStorage 기반 목 데이터**
- **배포**: Vercel (SPA fallback — `vercel.json`의 rewrites로 모든 경로 → `index.html`)
- **디자인 시스템**: `DESIGN.md` — Coinbase 스타일 분석 기반 (흰 캔버스, 절제된 포인트 컬러, 카드 레이어링)
- **lint**: oxlint (`npm run lint`)

### 실행 방법
```bash
npm run dev      # 개발 서버 (Vite)
npm run build    # 프로덕션 빌드 → dist/
npm run lint     # oxlint
./start-dev.sh   # nvm node v20.20.2 경로 고정 후 vite 실행
```

## 2. 라우팅 구조 (`src/main.jsx`)

`RequireAuth`로 보호되는 라우트는 비로그인 시 `/`(로그인)로 리다이렉트.

| 경로 | 페이지 | 보호 |
|------|--------|------|
| `/` | LoginPage | ✗ |
| `/signup` | SignupPage | ✗ |
| `/team-select` | TeamSelectPage | ✓ |
| `/club/:teamId` | ClubHomePage (구단 홈) | ✓ |
| `/club/:teamId/opinions` | OpinionsPage (팬 의견 목록) | ✓ |
| `/club/:teamId/opinions/:opinionId` | OpinionDetailPage (의견 상세 + 댓글) | ✓ |
| `/club/:teamId/survey` | SurveyPage (설문) | ✓ |
| `/club/:teamId/write` | CreateOpinionPage (의견 작성) | ✓ |
| `/club/:teamId/activity` | MyActivityPage (내 활동 대시보드) | ✓ |
| `/club/:teamId/matches` | MatchCenterPage (경기센터) | ✓ |
| `/club/:teamId/news` `…/news/:newsId` | TeamNewsPage (팀 뉴스) | ✓ |
| `/club/:teamId/insights` | AIInsightsPage (AI 인사이트) | ✓ |
| `/club/:teamId/ranking` | FanRankingPage (팬 랭킹) | ✓ |
| `/club/:teamId/settings` | SettingsPage (설정) | ✓ |

전역 Provider: `ThemeProvider` → `LanguageProvider` → `BrowserRouter`.

## 3. 핵심 모듈

### 테마(다크모드) — `src/contexts/ThemeContext.jsx` + `src/theme.css`
- `useTheme()` → `{ theme, resolved, setTheme }`. `theme`은 사용자 선호('light'|'dark'|'system'), `resolved`는 실제 적용된 'light'|'dark'.
- localStorage 키: `fancluv_theme` (기본 `system`). 선택값을 `<html data-theme="light|dark">`로 반영.
- `system` 선택 시 `matchMedia('(prefers-color-scheme: dark)')`로 OS 설정을 따르고 변경을 실시간 구독.
- `index.html`에 **첫 페인트 전 부트 스크립트**가 있어 새로고침 시 깜빡임(FOUC) 방지.
- 다크 토큰은 `theme.css`의 `html[data-theme="dark"]` / `html[data-theme="dark"] .ch-root`에서 중앙 오버라이드. 팀 컬러(`--team`/`--team-deep`)는 다크에서도 유지.
- 팀 컬러 틴트는 `color-mix(... var(--mix-base))` 패턴 사용 — `--mix-base`가 라이트=흰색 / 다크=어두운 표면으로 전환되어 틴트가 자연스럽게 어두워짐.
- 설정 페이지에서 ☀️라이트 / 🌙다크 / 💻시스템 선택.

### 설문 목록 — `src/SurveyPage.jsx`
- `selectedId` 내부 상태로 **목록 → 상세 → 완료** 3단계 전환(라우팅 미사용). 목록은 5개 Mock 설문 카드(2~3열 반응형). 상세 폼(별점·객관식·주관식)은 기존 유지.

### 인증 — `src/lib/auth.js`
- localStorage 기반 **목 인증**. 모든 인증 로직을 이 파일에 격리 → 추후 **Supabase Auth로 교체** 예정 (내부 구현만 바꾸면 화면 코드 유지).
- localStorage 키: `fancluv_users`(가입자 배열), `fancluv_session`(현재 로그인 email).
- 데모 시드 계정: **`fan@fancluv.kr` / `1234`** (닉네임 `민준`).
- export 함수: `signup`, `login`, `logout`, `getCurrentUser`, `isAuthenticated`, `setSelectedTeam`.
- ⚠️ 비밀번호 평문 저장 (MVP 한정). 실서비스 전 반드시 교체.

### 다국어 — `src/contexts/LanguageContext.jsx` + `src/locales/{ko,en}.js`
- `useLang()` → `{ lang, setLang, t }`. `t(key, vars?)`는 `{token}` 보간 지원, 누락 시 ko 폴백 → raw key 폴백.
- localStorage 키: `fancluv_lang` (기본 `ko`).
- **ko/en 각각 233개 키** (현재 동기화됨).
- `NAV_KEYS`: 한글 내비 라벨 → 번역 키 매핑. **메뉴 배열은 한글을 canonical 키로 유지**(라우팅/active 판정용), 표시 라벨만 번역.

### 구단 데이터 — `src/teams.jsx`
- `TEAMS`: K리그1 12개 구단 (id, name, short, color, colorDeep).
- `MENU_ITEMS`: 상단 내비 8개 메뉴(한글 canonical). `menuPath(item, teamId)`로 경로 변환. `getTeam(id)`.
- `TeamEmblem`: SVG 축구공 엠블럼 컴포넌트 (구단 컬러 적용).

### 작성된 의견 저장 — `src/opinionStore.js`
- 팬이 작성한 의견을 구단 id별로 localStorage(`fancluv_created_opinions`)에 저장 → 네비게이션 후에도 목록 상단 유지.
- `getCreatedOpinions(teamId)`, `addOpinion(teamId, opinion)`.

## 4. 완료된 작업 (git 히스토리, 최신 → 과거)

1. **Settings 페이지** 구현 (`966cb11`)
2. **한/영 다국어** 구현 (`2a2ec78`)
3. 페이지 헤더에 **로그인 유저 닉네임 표시** (`a28662b`)
4. **목 인증 영속화** (localStorage 세션 유지) (`c9537cd`)
5. Survey / AI Insights / Fan Ranking **라우팅 버그 수정** (`050c495`)
6. Fan Ranking: 리그/클럽 랭킹 탭, 기준 필터, 순위 변동 추가 (`1aa515d`, `d28b21d`)
7. AI Insights 페이지 (`43c209a`)
8. Team News 페이지 (`6728831`)
9. Match Center 페이지 + 로고 크기 조정 (`8659b83`, `53fc663`)
10. My Activity 대시보드 (`54d64fd`)
11. 의견 작성 플로우 / 상세 / 댓글 / 목록 UI (`92251e6`, `89ef1cf`, `508215b`, `1fcac2e`)
12. Survey 버튼 연결 (`3befb12`)
13. Vercel 404 수정: 클라이언트 라우팅 + SPA fallback (`d150b0e`)
14. 초기 커밋 (`b22a591`)

→ **8개 주요 페이지가 모두 구현된 상태.** 현재 기능 골격은 완성 단계.

## 5. 알려진 특이사항 / TODO 후보

- `src/App.jsx`는 **여전히 Vite 기본 템플릿** (실제 앱은 `main.jsx`가 진입점). 라우트에 미연결 — 정리/삭제 가능.
- `README.md`도 Vite 기본 템플릿 그대로.
- 백엔드/DB 없음 → **Supabase 연동**이 다음 큰 마일스톤 (auth.js부터 교체 지점 마련됨).
- 비밀번호 평문 저장 (목업 한정).
- 루트에 `log-in page.docx`, `tmp/`, `.DS_Store` 존재.

## 6. 작업 시 참고

- 페이지 추가 시: `src/XxxPage.jsx` + `src/XxxPage.css` 쌍 생성 → `main.jsx`에 `RequireAuth` 라우트 등록 → 내비 메뉴면 `teams.jsx`의 `MENU_ITEMS`/`menuPath` + `NAV_KEYS` 갱신.
- **새 UI 텍스트는 반드시 ko/en 양쪽 locale에 키 추가** (233/233 동기화 유지).
- 디자인 토큰/컬러/타이포는 `DESIGN.md` 기준을 따를 것.
