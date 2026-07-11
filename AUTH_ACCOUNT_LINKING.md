# FANCLUV — 본인인증 · DI 기반 1인 1계정 · 계정 연결 설계

> 상태: **설계 문서(향후 확장 대비)**. 베타에는 PASS/NICE/KCB 를 붙이지 않는다.
> 이번 릴리스에서는 DB/코드 **구조만** 준비했다(마이그레이션 `0044_account_linking_scaffold.sql`).
> 실제 병합/연결 로직은 본인인증 도입 시점에 구현한다.

---

## 1. 본인인증 3사 비교 (PASS / NICE / KCB)

| 항목 | PASS (통신 3사) | NICE평가정보 | KCB (올크레딧) |
|---|---|---|---|
| 방식 | 통신사 앱 PASS 인증 | 휴대폰/카드/공동인증 등 | 휴대폰/카드 등 |
| 진입점 | 대개 NICE·KCB 창구를 통해 PASS 수단 제공 | 표준창(팝업/리다이렉트) | 표준창(팝업/리다이렉트) |
| 식별값 | **CI/DI 발급** | **CI/DI 발급** | **CI/DI 발급** |
| 특징 | 사용자 친숙도 높음 | 국내 점유율 높음, 문서 풍부 | 신용정보 연계 |
| 연동 형태 | 대행사(NICE/KCB) API 위임 | REST/표준창 | REST/표준창 |
| 비용 | 건당 과금(계약) | 건당 과금(계약) | 건당 과금(계약) |

> 실무상 PASS 는 단독 API 라기보다 **NICE 또는 KCB 창구를 통해 제공**되는 인증수단인
> 경우가 많다. 따라서 FANCLUV 는 **Provider 추상화**(vendor = `nice | kcb | pass`)로
> 두고, 실제 계약사에 맞춰 Edge Function 한 곳(`identity-verify`)만 교체한다.

## 2. CI vs DI — 무엇을 저장하나

| 값 | 뜻 | 특징 | FANCLUV 용도 |
|---|---|---|---|
| **CI** (연계정보) | 개인 식별 연계값(88 byte) | 사이트가 달라도 **동일인=동일 CI** | 동일인 식별(현행 `identity_ci`) |
| **DI** (중복가입확인정보) | 사이트별 중복가입 확인값 | **같은 서비스 내** 동일인 판별 | **1인 1계정 기준값**(`identity_di_hash`) |

- **주민등록번호·이름·휴대폰번호 등 원문 개인정보는 절대 저장하지 않는다.**
- 저장 대상은 오직 **CI / DI(해시)** 뿐. DI 는 평문 대신 **sha256 해시**로 보관한다.
- CI/DI 원문은 클라이언트로 내려보내지 않는다(서버 = Edge Function 에서만 처리).

## 3. DB 설계

### 현행(구현 완료)
```
profiles
  identity_verified      boolean         -- 본인인증 완료 여부
  identity_verified_at   timestamptz
  identity_provider      text            -- 'pass' | 'nice' | 'kcb' | 'mock'
  identity_ci            text  UNIQUE(부분) -- 연계정보(CI)  [0026]
  identity_di            text            -- (레거시) 평문 DI
```

### 이번에 추가(구조만 — 0044)
```
profiles
  identity_di_hash   text  UNIQUE(부분)   -- sha256(DI). "1 DI = 1 계정" 강제
  linked_providers   jsonb DEFAULT '[]'  -- [{provider, provider_user_id, linked_at}]
```

- `profiles_identity_di_hash_unique` 부분 유니크 인덱스 = **DB 차원의 1인 1계정 보증**.
- `linked_providers` = 한 계정에 연결된 인증수단(구글/카카오/네이버/이메일) 목록 캐시.

### 향후(권장) — 정규화 테이블(선택)
`linked_providers`(jsonb) 로도 충분하지만, 규모가 커지면 정규화 테이블을 권장한다.
```sql
create table public.account_providers (
  profile_id       uuid references public.profiles(id) on delete cascade,
  provider         text not null,          -- google|kakao|naver|email
  provider_user_id text not null,
  linked_at        timestamptz not null default now(),
  primary key (provider, provider_user_id) -- 하나의 소셜 신원 = 하나의 계정
);
```
- `primary key(provider, provider_user_id)` 로 **한 소셜 신원이 두 계정에 붙는 것**을 차단.
- 이 경우 `profiles.linked_providers` 는 조회 캐시로 유지하거나 뷰로 대체.

## 4. 계정 연결 방식 (향후 구현)

```
사용자가 소셜/이메일 로그인
        │
        ▼
본인인증(PASS/NICE/KCB) 성공 → 업체가 CI/DI 발급
        │  (identity-verify Edge Function, service_role)
        ▼
di_hash = sha256(DI)
        │
        ├─ 동일 di_hash 계정 없음 → 현재 계정에 di_hash 저장(신규 본인)
        │
        └─ 동일 di_hash 계정 있음(기존 본인)
                 │
                 ├─ 같은 계정 → no-op
                 └─ 다른 계정 → 현재 provider 를 기존 계정의 linked_providers 에 append
                                (또는 merge_accounts 로 활동/포인트 이관 후 중복 계정 정리)
```

- 핵심 함수(예정):
  - `link_provider_to_di(p_di_hash, p_provider, p_provider_user_id)` — 연결.
  - `merge_accounts(loser_id, winner_id)` — 활동/포인트/랭킹 이관 후 중복 계정 비활성/삭제.
- 전부 **SECURITY DEFINER + service_role Edge Function** 경유(클라이언트가 DI 원문·타인 CI 접근 불가).

## 5. 1인 1계정 정책

- 판별 기준: **DI(해시)**. 서비스 내 동일인은 하나의 FANCLUV 계정만 가진다.
- 강제 수단: `identity_di_hash` 부분 UNIQUE 인덱스(0044).
- 본인인증 전(베타): 이메일 인증 기준으로 운영(현행 `0043`). DI 미보유 → 유니크 대상 아님.
- 본인인증 후: 여러 provider 로 로그인해도 **DI 가 같으면 한 계정**으로 수렴.

## 6. 기존 계정 병합 정책

- **원칙**: 데이터 손실 없이 winner(유지 계정)로 이관.
- 이관 대상: 의견/댓글/공감/설문응답/포인트·랭킹/알림 설정/작성 뉴스 등 `author_id|user_id` 참조.
- 순서: (1) winner 선정(가입 빠른 계정 또는 활동 많은 계정) → (2) FK 재지정 →
  (3) loser 비활성(`deactivated_at`) → (4) 감사 로그 기록.
- 실행: `merge_accounts()` 단일 트랜잭션(SECURITY DEFINER). 사용자 대면 UX 는 별도.

## 7. 주민등록번호 저장 금지 원칙

- **주민등록번호/이름/생년월일/휴대폰번호 등 개인 식별 원문은 DB 에 저장하지 않는다.**
- 저장 허용: `identity_verified`(bool), `identity_verified_at`, `identity_provider`,
  `identity_ci`, `identity_di_hash`(해시) 뿐.
- CI/DI 는 서버(Edge Function)에서만 취급, 클라이언트 응답/번들/로그에 노출 금지.
- 보관 최소화·암호화·접근통제(RLS + service_role) 준수.

## 8. 향후 마이그레이션 전략

1. **0044(완료)** — `identity_di_hash`(+부분 UNIQUE), `linked_providers` 구조 추가 · 백필 · 트리거 초기화.
2. **다음** — `identity-verify` Edge Function 확장: 업체 응답 DI → `sha256` → `identity_di_hash` 저장,
   동일 DI 시 `link_provider_to_di`/`merge_accounts` 호출.
3. **정규화(선택)** — `account_providers` 테이블 도입 + `linked_providers` 를 뷰/캐시로 전환.
4. **게이트 복원(선택)** — 서비스 정책상 필요 시 의견/댓글/설문 INSERT 에 `is_identity_verified()`
   게이트 재적용(현재 `0043` 으로 완화됨).
5. **레거시 정리** — 평문 `identity_di` 사용 중단 후 컬럼 제거(또는 해시로 이전 완료 후 drop).

---

### 관련 파일
- 마이그레이션: `supabase/migrations/0026_identity_verification.sql`, `supabase/migrations/0044_account_linking_scaffold.sql`
- Edge Function(예정 확장): `supabase/functions/identity-verify/`
- 소셜 로그인/콜백: `src/lib/auth.js`(`socialLogin`), `supabase/functions/{kakao,naver}-callback/`
- OAuth 설정: `OAUTH_SETUP.md`, `SOCIAL_LOGIN_SETUP.md`
