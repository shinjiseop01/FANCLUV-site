-- FANCLUV — AI 의견 작성 지원(Phase 18, 0068) 완전 제거(0070)
--
-- 0068 을 과거 수정으로 되돌리지 않고, 이후 migration 으로 안전하게 제거한다.
-- 스테이징에는 실제 사용자 데이터가 없음(사전 확인: ai_writing_requests=0, ai_assisted opinions=0,
-- ai_settings=기본 1행). 원본 의견/Quick Poll/Fan Pulse/Survey/audit_logs/activity_events 는 영향 없음.
-- 의존 순서: RPC(함수) → policy → table(인덱스 동반 제거) → opinions 컬럼. CASCADE 남용하지 않는다.
begin;

-- 1) RPC/헬퍼 함수 (정확한 시그니처로 명시 제거)
drop function if exists public.ai_writing_begin(p_operation text, p_dedupe_hash text);
drop function if exists public.ai_writing_complete(p_request_id uuid, p_status text, p_provider text, p_model text, p_source_length integer, p_output_length integer, p_input_units integer, p_output_units integer, p_safety text, p_error_code text);
drop function if exists public.ai_writing_admin_stats(p_day date);
drop function if exists public.ai_writing_get_settings();
drop function if exists public.ai_writing_set_enabled(p_enabled boolean);
drop function if exists public.ai_writing_set_provider(p_provider text);
drop function if exists public.ai_writing_enabled();
drop function if exists public._ai_audit(p_actor uuid, p_action text, p_detail jsonb);

-- 2) policy (테이블 삭제 전 명시 제거)
drop policy if exists ai_req_select_own on public.ai_writing_requests;

-- 3) opinions 확장 컬럼(AI 전용) — 데이터 영향 없음(ai_assisted opinions=0).
--    ai_request_id 의 FK(opinions_ai_request_id_fkey → ai_writing_requests)가 테이블에 의존하므로
--    반드시 테이블보다 먼저 제거한다(CASCADE 없이 안전 제거).
alter table public.opinions drop column if exists ai_assisted;
alter table public.opinions drop column if exists ai_operation;
alter table public.opinions drop column if exists ai_request_id;

-- 4) 테이블 (인덱스 ix_ai_req_* 는 테이블과 함께 제거됨 — 이제 의존 객체 없음)
drop table if exists public.ai_writing_requests;
drop table if exists public.ai_settings;

commit;
