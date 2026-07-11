# FANCLUV — 공식 구단 뉴스 수집 아키텍처 & 운영 가이드

> **현재 상태(정직 고지)**: 실제 14개 구단 사이트의 HTML 스크래핑은 **아직 활성화하지 않았습니다.**
> 각 사이트의 **robots.txt / 이용약관(ToS) 허용 여부를 실제로 검토**하고, 사이트별 DOM 을
> 확인해 어댑터를 작성·검증해야 하며(무단 크롤링 금지 — 사용자 지침), 이는 사이트별 법적/기술
> 검토가 필요한 작업이라 이 프로젝트 코드만으로 "완료"라고 보고하지 않습니다.
> 그때까지 팀 뉴스는 **공식 뉴스 페이지 링크(fallback)** 로 안전하게 동작합니다.
> 이 문서는 실제 연결 시 그대로 사용할 **어댑터 구조·정규화·중복방지·분류·Cron 규격**입니다.

---

## 1. 아키텍처 (요구 구조)

```
supabase/functions/news-fetcher/
├─ index.ts            # 오케스트레이터: 소스별 순차/제한 동시성, timeout/retry/backoff, 로그
├─ types.ts            # NewsItem / SourceStatus 인터페이스
├─ normalize.ts        # 날짜·URL·제목·이미지·excerpt 정규화 (순수 함수, 테스트 가능)
├─ categorize.ts       # 규칙 기반 category 매핑 (AI 불필요)
└─ adapters/
   ├─ index.ts         # registry: canHandle(source) 로 어댑터 선택
   ├─ fcSeoul.ts  ulsan.ts  jeonbuk.ts  pohang.ts  daejeon.ts  gwangju.ts
   ├─ gangwon.ts  gimcheon.ts  jeju.ts  anyang.ts  incheon.ts  bucheon.ts
```

**어댑터 인터페이스** (사이트마다 HTML 이 달라 하나의 거대한 parser 금지):
```ts
interface NewsAdapter {
  canHandle(source: Source): boolean
  fetchList(source: Source): Promise<string | object>   // RSS/JSON 우선, 없으면 HTML
  parseList(raw: string | object, source: Source): RawItem[]
  normalize(raw: RawItem, source: Source): NewsItem
  validate(item: NewsItem): boolean
}
```

**공통 NewsItem** (원문 전체 저장 금지 — 목록의 메타만):
`external_id · team_id · source_id · source_name · category · title · excerpt ·
 image_url · article_url · published_at · collected_at · content_hash · status`

---

## 2. robots.txt / ToS 확인 절차 (활성화 전 필수)

각 소스를 켜기 전에 **반드시** 아래를 확인하고 결과를 기록하세요.

1. `https://<도메인>/robots.txt` 에서 해당 게시판 경로의 `Disallow` 여부.
2. 사이트 이용약관의 자동 수집/재배포 조항.
3. **RSS/오픈 API 제공 여부** — 있으면 HTML 파싱보다 **우선 사용**(권장).
4. 과도 요청 방지(요청 간 지연, User-Agent 명시 `FANCLUV-NewsBot/1.0`).

### 실측 조사 결과 (2026-07-11, 서버측 robots.txt + 페이지 1회 확인)

방법: 각 도메인 `robots.txt`(User-Agent `FANCLUV-NewsBot/1.0`) + 뉴스 목록 페이지 1회 GET
로 RSS/Atom 링크·content-type·서버렌더 여부만 확인(무단 반복 수집·인증 우회 없음).

| 팀 | 도메인 | robots.txt | RSS/API | 렌더 방식 | 판정 |
|---|---|---|---|---|---|
| 서울 | fcseoul.com | 없음(404) | ❌ 없음 | 세션기반(jsessionid), 기사 마크업 불명 | **permission_required** |
| 울산 | uhdfc.com | 없음(404) | ❌ 없음 | 서버렌더(마크업 불명) | **permission_required** |
| 전북 | hyundai-motorsfc.com | 없음(HTML) | ❌ 없음 | **JS앱**(id="app", 2.5KB 빈 셸) | **unsupported** |
| 포항 | steelers.co.kr | 없음(404) | ❌ 없음 | 서버렌더(CodeIgniter) | **permission_required** |
| 대전 | dhcfc.kr | 없음(404) | ❌ 없음 | 서버렌더(마크업 불명) | **permission_required** |
| 광주 | gwangjufc.com | ✅ 있음(Disallow `/b_office/` 만) | ❌ 없음 | **서버렌더**(기사 단서 다수) | **technically_available**(ToS 확인 필요) |
| 강원 | gangwon-fc.com | ✅ 있음(**Disallow `/`**) | ❌ 없음 | — | **blocked**(robots 전면 차단) |
| 김천 | gimcheonfc.com | 없음(404) | ❌ 없음 | 서버렌더(기사 단서) | **permission_required** |
| 제주 | jejuskfc.com | 없음(404) | ❌ 없음 | 서버렌더(기사 단서) | **permission_required** |
| 안양 | fc-anyang.com | 없음(302) | ❌ 없음 | 서버렌더(.asp) | **permission_required** |
| 인천 | incheonutd.com | 없음(404) | ❌ 없음(‘feeds’지만 HTML) | **JS앱**(빈 셸) | **unsupported** |
| 부천 | bfc1995.com | 없음(HTML) | ❌ 없음 | **JS앱**(id="app", 1.8KB) | **unsupported** |

**결론(근거 기반)**:
- **공식 RSS/Atom/API 를 제공하는 구단은 0개** → 자동 syndication 근거로 `approved` 판정할 소스 없음.
- **강원 = blocked**(robots `Disallow: /`), **전북·인천·부천 = unsupported**(JS 렌더 빈 셸, 단순 HTTP 파싱 불가 — 헤드리스 브라우저는 사용하지 않음).
- 광주는 robots 상 뉴스 경로 허용 + 서버렌더로 **기술적으론 가능**하나, **뉴스 재게시는 저작권/ToS 사안**이라 명시적 허가 없이 `approved` 로 올리지 않음(`technically_available`).
- 나머지(서울·울산·포항·대전·김천·제주·안양)는 robots 차단은 없으나 **RSS/API 부재 + ToS 미확인** → `permission_required`.

> ⚠️ **따라서 이번 작업에서 활성화(어댑터 구현)한 뉴스 소스는 0개입니다.** 전 소스 **공식 링크
> fallback 유지**. 실연동하려면 아래 중 하나가 선행되어야 합니다(외부/법무):
> 1) 구단이 **공식 RSS/API** 를 제공하거나, 2) 구단으로부터 **콘텐츠 사용(제목·요약·썸네일·링크)
> 명시적 허가**를 받거나, 3) **정식 라이선스 뉴스 아그리게이터** 계약.

---

## 3. 정규화 규칙 (normalize.ts)

- **날짜**: Asia/Seoul 기준 ISO 저장. 연도 없는 날짜는 게시 맥락으로 보정하되 **추측 위험 시 null**.
  미래/비정상 날짜는 검증 후 제외.
- **URL**: 상대→절대(new URL(href, base)), http→https, 중복 query 제거, 동일 기사 URL 중복 방지.
- **제목**: HTML entity decode, 앞뒤 공백/줄바꿈 제거, **빈 제목 저장 금지**.
- **이미지**: 상대경로 보정, 무효 URL 제외, hotlink 차단 시 팀 로고 placeholder(이미지 무단 복제 금지, 원본 URL 참조).
- **excerpt**: 목록의 짧은 설명만. 없으면 비워두고 후속 AI 요약 사용. **임의 생성 금지**.

## 4. 규칙 기반 분류 (categorize.ts) — AI 불필요

`notice · match · player · interview · transfer · event · general`

- 영입/계약/이적 → `transfer` · 프리뷰/리뷰/경기/매치 → `match` · 인터뷰 → `interview`
- 선수단/부상/명단/승선 → `player` · 이벤트/팬사인/행사 → `event` · 공지 → `notice`
- 매칭 실패 → `general`. (소스 게시판 구분 + URL + 제목 키워드 순으로 판정)

## 5. 중복 방지 & news_cache

중복 키 우선순위: **① article_url → ② source_id+external_id → ③ content_hash(team_id+title+published_at)**.
- upsert(동일 기사 갱신, 제목 수정 반영), 삭제 원문은 즉시 삭제 대신 `status='archived'`.
- 인덱스: `(team_id, published_at desc)`, `source_id`, `published_at`, `article_url unique`.
- 수집 실패 시 마지막 정상 캐시 유지(빈 결과로 덮어쓰지 않음).

## 6. 정기 동기화 (Cron) — 사용자 적용 항목

Supabase **Dashboard → Database → Cron(pg_cron)** 또는 SQL:
```sql
-- 45분마다 news-fetcher 호출(한 번에 폭주 금지: 함수가 소스별 순차/제한 동시성 처리)
select cron.schedule('news-fetch', '*/45 * * * *', $$
  select net.http_post(
    url := 'https://cuuzbddxnzhhlrqmmebz.supabase.co/functions/v1/news-fetcher',
    headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>')
  );
$$);
```
소스별 timeout(≈8s), retry 1~2회 + exponential backoff, rate limit, User-Agent 명시, 실행 로그 저장.

## 7. 관리자 동기화 UI (news-sources 화면)

전체/팀별/소스별 수동 동기화, 활성·비활성, 마지막 성공/실패 시각, 오류 메시지, 수집·신규·갱신
건수, 캐시 총수, 소요 시간. 상태: `healthy · partial · failed · blocked · unsupported · disabled`.
**CORS 실패와 실제 사이트 장애를 구분**(브라우저 직접 fetch 금지 → 서버 수집이므로 CORS 무관,
차단은 403/robots 기준으로 `blocked` 표기).

## 8. 팬 화면 & AI 요약 연결

- TeamNewsPage 는 news_cache 실데이터를 팀 기준 최신순 조회(실연결 시 DemoBadge 제거, Mock 혼합 금지).
- 각 뉴스에 기존 `summarize-news` 연결: cacheKey = news_cache id/content_hash. 제목·excerpt 변경 시
  요약 무효화/재생성. **원문 전체를 AI 에 보내지 않고 제목·excerpt 중심** 요약.

## 9. OpenAI / fallback 표시

- OPENAI_API_KEY 유효 → 생성형 요약(model=openai). 무효/미설정 → extractive fallback(뉴스 기능은
  실패하지 않음). **사용자 화면엔 기술적 키 오류를 노출하지 않음**("AI 요약"/"자동 요약").
- 관리자에는 mode(openai/extractive)·model·last_error·generated_at·cached 노출.

## 10. 저작권

각 카드에 구단명·공식 출처·게시일·원문 보기(외부 링크 아이콘). 필요 시
"기사의 저작권은 해당 구단 및 원문 제공처에 있습니다." 표기. **원문 본문 재게시 금지.**
