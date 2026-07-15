# FANCLUV — Release History

프로덕션 배포 이력. 각 릴리스는 적용 migration, 배포 방식, 검증 결과, 롤백 기준을 기록한다.

---

## 2026-07-14 — Team News CMS + Identity/Merge platform (RC rollout)

- **Release commit**: `8ba99b0` (origin/main, 코드 변경은 Phase 9~13에서 완료; Phase 14는 배포/검증 전용)
- **Production ref**: `cuuzbddxnzhhlrqmmebz` (fancluv)
- **Staging ref**: `frerrxntbtcapapvbqwb` (fancluv-staging)

### 적용 Migration (production 0056 → 0061)
| # | 파일 | 내용 | 데이터 영향 |
|---|---|---|---|
| 0057 | identity_verification_platform | 본인인증 플랫폼(테이블/RPC/RLS). 프론트 IDENTITY_ACTIVE=false 이면 비활성 | 신규 테이블만, 기존 무영향 |
| 0058 | account_merge | merge_operations + profiles.merged_into/is_superadmin + 가드 확장 | 컬럼 추가(merged_into=null, is_superadmin=false 백필) |
| 0059 | fix_merge_eligibility | 병합 자격판정을 identity_verifications.di_hash 기준으로 수정 | 함수 정의만 |
| 0060 | team_news_cms | team_news 상태모델/예약/pin/태그/조회수 + news_ai_queue + news-images 버킷 + RLS(published-only) + audit | team_news 0행(무손실), hidden→archived no-op |
| 0061 | fix_news_pin_race | pin 최대 3개 동시성 수정(advisory lock) | 함수 정의만 |

- 적용 방식: `supabase db push --linked` (production), 5개 순차 적용, 에러 0.
- 적용 전 프로덕션 상태: team_news 0행, profiles 7명(admin 1), identity di_hash 0, storage=avatars.
- 적용 후: remote max=0061, 0062+ 없음, 기존 데이터 손실 0.

### 프론트엔드 배포
- Vercel **git 연동 자동 배포**로 `8ba99b0` 반영됨(Phase 13 push 시점). 별도 `vercel --prod` 미실행(중복·프로젝트 로컬 링크 부재).
- Production URL: https://fancluv-site.vercel.app (HTTP 200). 배포 번들에 신규 CMS 청크(newsRepo: news_transition_status/autopublish/set_pinned/dashboard_counts, AdminNews: nw-dash/saveDraft) 확인.
- Sentry stash(`wip/sentry-awaiting-dsn-validation`) 미배포·보존, 번들 미포함.

### 검증 결과 (production, TEST_NEWS_RC_ / TEST_PHASE14_ 데이터만)
- profiles 가드: role/identity_di_hash/linked_providers/merged_into/is_superadmin 직접수정 **차단(42501)**, avatar/selected_team 허용.
- 본인인증·병합 비활성: DI-less merge request 안전 거부(self/not_same_person), 팬 approve/complete 차단.
- 뉴스 상태 전이 6종(정상/차단), autopublish(due→published), pin 최대 3(4th=pin_limit), tags/검색/필터/dashboard/AI queue 정상, audit 정확히 1회.
- RLS: anon은 published만, draft/scheduled/archived 차단(IDOR 0).
- Storage: 업로드/교체/삭제 orphan 0.
- 기존 데이터: team_news 0행 유지, profiles 7명 무변경.

### 성능 (staging 뉴스 읽기 부하 실측, 1200행 시드)
| VU | 실패율 | avg | P50 | P95 | P99 | 비고 |
|---|---|---|---|---|---|---|
| 10 | 0% | 364ms | 377 | 463 | 463 | |
| 100 | 0% | 1200ms | 694 | 2461 | 2469 | |
| 300 | 0% | 1615ms | 1473 | 4024 | 4452 | 소형 tier 포화 시작 |
| 1000 | 7.4%(전부 client timeout, 5xx 0) | 8937ms | 8659 | 15000 | 15000 | DB 건강(active=1, pool 11) |

- 1,000 VU 동시버스트는 소형 dev tier(1vCPU) 포화로 client timeout 7.4% — **5xx/데이터손상 0**. 실제 1,000명(think-time+프론트 10분 캐시)과 다름. 프로덕션 tier·캐시 하에서 1,000 동시사용자 지원 가능하나, "1,000 VU 동시버스트 무결점"은 아님.

### 롤백 기준
- 기존 migration을 되돌리지 않는다. 문제 발생 시 신규 수정 migration을 staging에서 개발 후 재배포.
- 신규 컬럼 제거는 데이터 손실 위험 → DROP 대신 forward-fix 원칙.
- 뉴스 데이터가 0행이었으므로 0060/0061 롤백 리스크는 스키마 한정.

### 남은 조치
- 실 vendor(PASS/NICE/KCB) 계약 후 IDENTITY_ACTIVE 활성 + account-merge Edge 배포(현재 미배포 — 비활성·UI 없음이라 뉴스 배포에 불필요).
- autopublish는 조회 시 호출(pg_cron 미도입) — 5,000명+ 규모에서 pg_cron 전환 권장.
