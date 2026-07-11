# FANCLUV — K리그 경기 데이터 공급자 조사 · 비교 · 권고안

> **현재 상태**: 경기센터는 공급자 **미확정** → 프로덕션에서 Mock 미노출, "경기 데이터 공급원
> 연결 준비 중" + K리그 공식 페이지 CTA(DEV 만 Mock+DemoBadge). 이 문서는 조사·비교·권고이며,
> **어떤 공급자도 아직 코드에 연결하지 않았습니다**(계약/키 필요).
>
> ⚠️ 아래 지원 범위·가격은 각 공급자의 공개 정보에 기반한 **일반적 정리**입니다. 최신 요금·K리그
> 커버리지·재배포 조건은 **계약 전 각 공급자에 직접 확인**해야 하며, 불확실한 값은 "확인 필요"로
> 표기했습니다(추측 금지).

---

## 1. 후보 공급자

| # | 공급자 | 유형 | 접근 |
|---|---|---|---|
| P1 | **API-Football** (api-sports.io / RapidAPI) | 상용 스포츠 API | REST + JSON, 무료 티어 有 |
| P2 | **TheSportsDB** | 커뮤니티/저가 API | REST + JSON, 무료/Patron |
| P3 | **SportMonks Football API** | 상용 스포츠 API | REST + JSON, 유료 |
| P4 | **Sportradar / Stats Perform(Opta)** | 엔터프라이즈 공식급 | 라이선스 계약 |
| P5 | **공식 K리그 / 한국프로축구연맹** (kleague.com, data 포털) | 공식 원천 | 공개 API 여부 **확인 필요** |

---

## 2. 비교표

| 항목 | API-Football | TheSportsDB | SportMonks | Sportradar/Opta | 공식 K리그 |
|---|---|---|---|---|---|
| K리그1/2 지원 | 예(리그 ID 존재) | 부분(정확도 편차) | 예(플랜별 확인 필요) | 예(공식급) | 원천 |
| 순위 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 일정 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 결과/스코어 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 실시간(라이브) | ✅(플랜) | 제한적 | ✅(플랜) | ✅(최상) | 확인 필요 |
| 선수/득점자 | ✅(플랜) | 부분 | ✅(플랜) | ✅ | 확인 필요 |
| 상업적 사용 | 허용(플랜 약관) | 허용(약관 확인) | 허용(약관) | 계약 기반 | **문의 필요** |
| 재배포/출처표시 | 약관 확인 | 출처표시 권장 | 약관 확인 | 계약 명시 | 문의 필요 |
| 가격 | 무료~월 구독(저~중) | 무료~월 소액 | 월 구독(중) | **영업 문의**(고가) | **문의 필요** |
| 무료 티어 | 있음(호출 제한) | 있음 | 제한적 | 없음 | 미상 |
| 호출 제한 | 플랜별 | 낮음(무료) | 플랜별 | 계약 | 미상 |
| 한국어 팀명 | 영문 위주(매핑 필요) | 영문 위주 | 영문 위주 | 영문/현지 | 한국어 |
| 문서 품질 | 좋음 | 보통 | 좋음 | 좋음(계약자) | 미상 |
| SLA | 플랜별 | 없음/약함 | 플랜별 | 강함 | 미상 |
| 실시간 정확도 | 중~상 | 중 | 상 | 최상 | 최상 |
| 과거 데이터 | 시즌 아카이브 | 있음 | 있음 | 계약 | 있음 |

> 표의 "예/✅"는 일반적으로 알려진 지원을 의미하며, **정확한 K리그 커버리지·요금·재배포 허용은
> 계약 전 반드시 재확인**해야 합니다(특히 공식 K리그의 공개 API 존재 여부는 미확정 → 문의 필요).

---

## 3. 최종 권고안 (3단계)

**A. 베타용 최소 비용안 — API-Football (무료/저가 티어)**
- 근거: K리그1/2 리그 ID·순위·일정·결과·라이브를 REST 로 제공, 무료 티어(일 호출 제한)로 착수 가능,
  문서/커뮤니티 양호. 팀명은 영문 → FANCLUV team_id 매핑표(§5)로 해결.
- 대안: **TheSportsDB**(완전 무료 착수 가능하나 정확도·실시간 약함 — 순위/일정 위주 저비용 검증용).

**B. 정식 출시용 안정성안 — SportMonks 또는 API-Football 유료 플랜**
- 근거: 유료 플랜의 실시간·선수 데이터·SLA·호출 여유. 두 곳 중 K리그 커버리지·요금 실측 비교 후 선택.

**C. 장기 확장용 엔터프라이즈안 — Sportradar / Stats Perform(Opta) 또는 공식 K리그 라이선스**
- 근거: 공식급 정확도·실시간·SLA·재배포 라이선스. 가격은 **영업 문의**. 공식 K리그/연맹 데이터
  라이선스가 가능하면 **출처 정당성 최상** → 우선 문의 권장.

> 착수 경로 권장: **베타=API-Football 무료 → 검증 후 유료(B) → 규모 확대 시 엔터프라이즈/공식(C)**.

---

## 4. LeagueProvider Adapter 사양 (연결 시 그대로 구현)

기존 `src/services/league/leagueProvider.js`(facade) + `league-fetcher` Edge Function 구조 유지.
공급자별 어댑터가 아래 인터페이스를 구현하고, facade 가 캐시/폴백/상태를 담당한다.

```ts
interface LeagueProvider {
  fetchStandings(season: number, league: 'K1' | 'K2'): Promise<Standing[]>
  fetchFixtures(season: number, league: 'K1' | 'K2', opts?): Promise<Match[]>
  fetchResults(season: number, league: 'K1' | 'K2', opts?): Promise<Match[]>
  fetchMatchDetail(externalId: string): Promise<MatchDetail>
  fetchTeams(season: number, league: 'K1' | 'K2'): Promise<TeamRef[]>
  healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }>
}
```

**정규화 스키마**
- `Standing`: season · league · rank · team_id · played · won · drawn · lost · goals_for ·
  goals_against · goal_difference · points · updated_at
- `Match`: external_id · season · league · home_team_id · away_team_id · kickoff_at(Asia/Seoul) ·
  venue · home_score · away_score · status(scheduled|live|finished|postponed) · round · updated_at

**시크릿(계약 후 설정)**: `LEAGUE_PROVIDER=edge` + `LEAGUE_API_KEY`(Edge Function 시크릿에만,
프론트 미노출). facade 의 `leagueConfigState()` 가 `unconfigured→live` 로 전환됨.

---

## 5. 외부 팀 ID ↔ FANCLUV team_id 매핑표 (연결 시 external_id 채움)

FANCLUV 내부 `team_id`(src/teams.jsx)는 아래와 같다. 공급자별 팀 ID/영문명은 계약 후 응답으로 확정.

| FANCLUV team_id | 구단(한국어) | 영문명(공급자 매핑 기준) | 외부 ID |
|---|---|---|---|
| seoul | FC 서울 | FC Seoul | (계약 후) |
| ulsan | 울산 HD | Ulsan HD (Hyundai) | (계약 후) |
| jeonbuk | 전북 현대 모터스 | Jeonbuk Hyundai Motors | (계약 후) |
| pohang | 포항 스틸러스 | Pohang Steelers | (계약 후) |
| daejeon | 대전 하나 시티즌 | Daejeon Hana Citizen | (계약 후) |
| gwangju | 광주 FC | Gwangju FC | (계약 후) |
| gangwon | 강원 FC | Gangwon FC | (계약 후) |
| gimcheon | 김천 상무 | Gimcheon Sangmu | (계약 후) |
| jeju | 제주 SK / 제주 유나이티드 | Jeju United | (계약 후) |
| anyang | FC 안양 | FC Anyang | (계약 후) |
| incheon | 인천 유나이티드 | Incheon United | (계약 후) |
| bucheon | 부천 FC 1995 | Bucheon FC 1995 | (계약 후) |

> ⚠️ FANCLUV 팀 목록/리그(K1/K2) 구성은 실제 teams.jsx 기준으로 재확인해 매핑을 확정할 것.

---

## 6. 필요한 계약 · API 키 · 비용 (사용자/외부)

- 공급자 선정 후 **계정 생성 + 플랜 구독 + API 키 발급**(사용자 몫).
- `supabase secrets set LEAGUE_API_KEY=... LEAGUE_PROVIDER=edge` + `league-fetcher` 재배포.
- 엔터프라이즈/공식 경로는 **영업 문의·라이선스 계약·법무 검토** 선행.
- 확정 전까지 경기센터는 "준비 중" 유지(코드 변경 없음).
