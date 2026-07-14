# FANCLUV 백업 정책

> 상태 표기: **[확인]** 실제 확인함 · **[미검증]** 이 문서 작성 시점에 대시보드에서 실측하지 않음 · **[개선필요]** 조치 권장.

## 1. 백업 대상
- **Postgres DB**: profiles, opinions, comments, likes, surveys/survey_responses/survey_answers, notifications, activity_events, reports, audit_logs, security_events, integration_health/logs, admin_user_deletion_operations, auth.users(Supabase 관리) 등 **[확인: 스키마 존재]**.
- **Supabase Auth**: 사용자 계정/세션(Supabase 내부 백업 정책에 종속).
- **Storage**: `avatars` 버킷(public) **[확인: 버킷 존재]**.
- **마이그레이션 히스토리**: `supabase/migrations/0001~0056` **[확인: Git 형상관리, origin/main]** — 스키마 재구성 가능한 소스 오브 트루스.
- **Edge Functions 코드**: `supabase/functions/*` **[확인: Git]** — 재배포 가능.
- **환경변수/시크릿**: Supabase Secrets / Vercel Env — **코드 아님, 별도 안전 보관 필요 [개선필요]**.

## 2. 백업 주기 / 복구 가능 여부
- **자동 백업(Supabase)**: Supabase는 유료 플랜에서 자동 일일 백업을 제공하고, 상위 플랜에서 Point-in-Time Recovery(PITR)를 지원합니다. **본 프로젝트의 실제 플랜·백업 주기·보존기간·PITR 활성 여부는 이 문서 작성 시점에 대시보드에서 확인하지 않았습니다. [미검증]** → Supabase Dashboard → Database → Backups에서 확인 필요.
- **코드/마이그레이션**: Git(origin/main) **[확인]** — 상시 복구 가능(스키마·함수·프론트).
- **복구 가능 여부 종합**: 코드·스키마·함수는 Git으로 **복구 가능 [확인]**. 실데이터(DB row·Storage 객체·Auth)의 시점 복구는 **Supabase 백업 설정에 종속 [미검증]**.

## 3. 복구 절차
- **스키마/함수 복구**: `supabase link` → 대상 ref 확인 → `supabase db push`(migration) + `supabase functions deploy`. 프론트는 `vercel --prod`.
- **데이터 복구**: Supabase Dashboard의 백업/PITR로 복원(플랜 종속). **절차·소요시간 미검증 [미검증]** → 사전 리허설 권장.
- **부분 복구(테이블)**: 백업에서 export 후 선택 복원(수동). 실데이터 전체를 채팅/Git에 저장 금지.

## 4. 복구 테스트 여부
- **복구 리허설: 미수행 [미검증]** — 실제 백업으로부터의 복원 테스트는 진행하지 않았습니다.
- 회원 삭제(Hard Delete) **복구 불가**임은 설계상 확인됨 → 오삭제 방지는 권한 매트릭스·자기/최후 superadmin 보호·확인 모달로 대응.

## 5. 미검증 / 개선 필요 항목
- **[미검증]** Supabase 자동 백업 주기·보존기간·PITR 활성 여부(대시보드 확인 필요).
- **[미검증]** 백업으로부터의 실복원 리허설(스테이징에서 1회 수행 권장).
- **[개선필요]** 시크릿(OpenAI/Resend/OAuth 등)의 안전한 오프사이트 보관·회전 정책 문서화.
- **[개선필요]** Storage(avatars) 객체 백업 정책 명시(Supabase Storage 백업 종속성 확인).

## 6. 권고
1. Closed Beta 전 Supabase Backups 화면에서 **주기·보존·PITR를 실제 확인**하고 이 문서에 반영.
2. 스테이징에서 **백업 → 복원 리허설 1회** 수행 후 소요시간·절차 확정.
3. 시크릿을 비밀 관리 도구(1Password/Vault 등)에 이중 보관 + 회전 주기 정의.
