# FANCLUV — 디자인 시스템 점진 이관 현황

> 상태: **진행 중(단계적)**. 회귀 위험 최소화를 위해 공통 시스템을 먼저 도입하고
> 고사용 화면부터 점진 이관한다. 이 문서는 이관 진행 상태를 추적한다.

## 공통 시스템(도입 완료)
- **Button**: `src/components/Button.jsx` + `Button.css`
  - variant: primary · secondary · danger · success · outline · ghost
  - size: sm(32px) · md(42px) · lg(52px) · icon
  - 상태: disabled · loading(중복클릭 차단 + aria-busy) · fullWidth · active · leftIcon/rightIcon
  - type 기본 `button`(폼 내 의도치 않은 submit 방지), focus-visible, 최소 터치 영역, 라이트/다크
- **Button/Motion/Spacing 토큰**: `src/theme.css`
  - `--btn-*`(radius/height-sm|md|lg/padding/font-weight/transition/shadow/disabled-opacity)
  - `--motion-fast|normal|slow`, `--ease-standard|enter|exit`
  - `--space-1..10`, `--section-gap`, `--card-padding`, `--card-gap`
  - 높이는 기존 FANCLUV 관례(primary ~52 / small ~32)에 맞춰 시각 회귀 최소화.
- **Icon 확장**: `src/components/Icon.jsx` — info, mail, save, loading, chevronLeft/Right,
  warningTriangle, successCircle, errorCircle, externalLink(별칭) 추가. 전부 currentColor +
  strokeWidth/linecap/linejoin 통일 + aria-hidden.

## 유니코드 아이콘(✓⚠✉✕) 치환
- **치환 완료(렌더 글리프 0)**: 인증(로그인/회원가입/아이디·비번찾기/비번재설정/이메일·본인인증/온보딩),
  폼 검증(의견작성/프로필수정/설문참여/닉네임상태), 관리자 오류문구(회원/공지/뉴스/설문빌더/리포트),
  팀뉴스 키워드 삭제(✕). Toast/모달은 이전 턴에 Icon 사용.
- **의도적 잔여(비-UI, 유지)**:
  - `NicknameStatus.jsx` 주석 내 ⚠(코드 주석, 렌더 아님)
  - `AdminLeagueApi.jsx` 값 셀의 `'✕'`(데이터 "미존재" 표시 문자, UI 아이콘 아님)

## Button 이관 상태
| 화면 | 상태 | 비고 |
|---|---|---|
| 관리자 System Status(전체 테스트/연결 테스트) | ✅ 이관 | primary=lg(52px, 기존 53px와 동일), 행=secondary sm(32px). loading 스피너 추가 |
| 인증(로그인/회원가입 등) | ⏳ 미이관 | 골드 `su-btn` 고유 스타일 — 팀색 미설정이라 공통 primary(팀색)로 바꾸면 인상 변화 → 보류 |
| 설정/프로필/의견/설문/뉴스/내활동(팬) | ⏳ 미이관 | 기존 페이지별 클래스 유지 |
| 관리자 목록 주요 액션(회원/의견/설문 등) | ⏳ 미이관 | `.adm-btn-primary`는 공통 primary와 근접 → 다음 단계 우선 대상 |
| Club Executive(헤더/리포트 다운로드/필터) | ⏳ 미이관 | 다음 단계 |

> 원칙: **이관한 화면에서만 레거시 버튼 클래스 제거**, 미이관 화면의 레거시 클래스는 유지.

## 다음 단계(P2)
1. 관리자 목록 주요 액션(`.adm-btn-primary`/`.adm-btn-sm`) → Button 이관(스타일 근접, 회귀 낮음).
2. 팬 설정/의견/프로필 primary 버튼 → Button(size=lg로 52px 매칭).
3. 인증 페이지: 골드 액센트를 auth 스코프 토큰(`--team-deep` 오버라이드)으로 정의 후 Button 이관.
4. LCP: LanguageContext 청크 분할(현재 ko+en 동시 로드 370KB). 동기 `t()` API + ko fallback 때문에
   동적 로딩은 미번역 플래시 위험 → i18n 리팩터 동반 필요(별도 P2, 아래 분석 참고).

## LCP 분석 요약
- `LanguageContext.jsx`가 `import ko`, `import en` 정적 로드 → 단일 청크 370KB(gzip 100KB), 초기 임계경로.
- `t()`는 **동기** API이며 미스 시 `DICTS.ko` fallback → ko는 항상 동기 필요.
- 안전한 분할을 하려면 `t()`/Provider를 로딩 상태 대응으로 리팩터해야 하며, 잘못하면 첫 페인트에
  키가 그대로 노출(플래시)될 수 있음 → **이번 턴은 분석만, 최적화는 P2**.
- 웹폰트 blocking 없음(시스템/Pretendard fallback), 로그인 화면 hero 이미지 없음.
