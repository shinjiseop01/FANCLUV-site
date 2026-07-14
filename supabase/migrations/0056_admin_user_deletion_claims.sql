-- ============================================================================
-- FANCLUV — 0056_admin_user_deletion_claims.sql
--   관리자 회원 삭제 원자적 선점 + 감사로그 exactly-once (Phase 7B 동시삭제 중복 수정)
--
-- 문제(Phase 7B 프로덕션 실측): 동일 대상 20 동시삭제 요청에서 여러 Edge 요청이
--   "target 조회 → deleteUser → audit insert" 경쟁 구간을 통과, GoTrue 가 다수 요청에
--   무오류 응답 → 각자 성공으로 판단해 member.delete 감사로그 6건 중복(ok=6).
--   Edge 의 여러 supabase 요청은 같은 PG transaction 을 공유하지 않고 Auth 삭제는
--   PG transaction 밖이라, advisory_xact_lock 단독으로는 삭제 완료 시점까지 보장 불가.
--
-- 해결: 대상당 durable 삭제 작업 행(admin_user_deletion_operations, target UNIQUE)을 두고,
--   INSERT ... ON CONFLICT DO NOTHING 으로 정확히 1개 요청만 선점(claimed)한다.
--   완료는 complete RPC 에서 processing→completed 조건부 전이가 성공한 요청만 audit 1건을
--   원자적으로 기록 → Edge 재시도/응답유실에도 감사 exactly-once.
-- ============================================================================

-- ── 삭제 작업 상태 테이블 ──
create table if not exists public.admin_user_deletion_operations (
  id             uuid primary key default gen_random_uuid(),
  target_user_id uuid not null unique,                 -- 대상당 1행 → 동시성 가드
  actor_id       uuid,
  actor_role     text,
  mode           text not null default 'hard_delete' check (mode in ('hard_delete', 'anonymize')),
  reason         text,
  request_id     uuid,
  status         text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  failed_at      timestamptz,
  last_error_code text,
  retry_count    integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists aud_ops_status_idx  on public.admin_user_deletion_operations (status, started_at);
create index if not exists aud_ops_target_idx  on public.admin_user_deletion_operations (target_user_id);

-- ── RLS: 정책 없음 → anon/authenticated 직접 접근 0. service_role 은 RLS 우회. ──
alter table public.admin_user_deletion_operations enable row level security;
-- 방어심층: 기본 부여된 테이블 권한도 회수(RLS 위에 추가 차단). service_role 은 우회.
revoke all on public.admin_user_deletion_operations from anon, authenticated;

-- ── 원자적 선점 RPC (service_role/정의자 전용) ──
-- 반환 result: claimed | already_processing | already_completed | previous_attempt_failed
create or replace function public.claim_admin_user_deletion(
  p_target uuid, p_actor uuid, p_actor_role text, p_mode text, p_reason text, p_request_id uuid,
  p_max_retry integer default 5
) returns table(result text, operation_id uuid)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_status text; v_retry int;
begin
  -- 신규 대상: processing 행 선점. 충돌(이미 행 존재)이면 아무 것도 안 함.
  insert into public.admin_user_deletion_operations(target_user_id, actor_id, actor_role, mode, reason, request_id, status)
  values (p_target, p_actor, p_actor_role, coalesce(nullif(p_mode, ''), 'hard_delete'), left(coalesce(p_reason, ''), 500), p_request_id, 'processing')
  on conflict (target_user_id) do nothing
  returning id into v_id;
  if v_id is not null then result := 'claimed'; operation_id := v_id; return next; return; end if;

  -- 기존 행 상태별 처리.
  select id, status, retry_count into v_id, v_status, v_retry
    from public.admin_user_deletion_operations where target_user_id = p_target;
  if v_status = 'completed' then
    result := 'already_completed'; operation_id := v_id; return next; return;
  elsif v_status = 'processing' then
    result := 'already_processing'; operation_id := v_id; return next; return;
  else -- failed → compare-and-set 로 재선점(동시엔 1개만 성공).
    update public.admin_user_deletion_operations
       set status = 'processing', started_at = now(), retry_count = retry_count + 1,
           actor_id = p_actor, actor_role = p_actor_role, request_id = p_request_id, updated_at = now()
     where id = v_id and status = 'failed' and retry_count < p_max_retry
     returning id into v_id;
    if v_id is not null then result := 'claimed'; operation_id := v_id; return next; return; end if;
    result := 'previous_attempt_failed';
    operation_id := (select id from public.admin_user_deletion_operations where target_user_id = p_target);
    return next; return;
  end if;
end $$;

-- ── 완료 RPC: processing→completed 전이 성공한 요청만 audit 1건(exactly-once) ──
create or replace function public.complete_admin_user_deletion(p_operation_id uuid, p_detail jsonb default '{}'::jsonb)
returns boolean  -- completed_now
language plpgsql security definer set search_path = public as $$
declare v_row public.admin_user_deletion_operations;
begin
  update public.admin_user_deletion_operations
     set status = 'completed', completed_at = now(), updated_at = now()
   where id = p_operation_id and status = 'processing'
   returning * into v_row;
  if not found then return false; end if;  -- 이미 completed/failed → no-op(중복 방지)
  insert into public.audit_logs(actor_id, actor_role, action, target_type, target_id, detail)
  values (v_row.actor_id, v_row.actor_role,
          case when v_row.mode = 'anonymize' then 'member.anonymize' else 'member.delete' end,
          'member', v_row.target_user_id::text,
          coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('operation_id', v_row.id, 'request_id', v_row.request_id, 'mode', v_row.mode));
  return true;
end $$;

-- ── 실패 RPC: processing→failed(error code 만 저장, 민감 body 금지) ──
create or replace function public.fail_admin_user_deletion(p_operation_id uuid, p_error_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.admin_user_deletion_operations
     set status = 'failed', failed_at = now(), last_error_code = left(coalesce(p_error_code, 'unknown'), 100), updated_at = now()
   where id = p_operation_id and status = 'processing';
end $$;

-- ── 운영 관측: 관리자만 failed/stuck 작업 조회(PII 없음) ──
create or replace function public.admin_deletion_operations(p_limit integer default 50)
returns table(target_user_id uuid, status text, started_at timestamptz, completed_at timestamptz,
              failed_at timestamptz, retry_count integer, last_error_code text, request_id uuid)
language sql stable security definer set search_path = public as $$
  select target_user_id, status, started_at, completed_at, failed_at, retry_count, last_error_code, request_id
  from public.admin_user_deletion_operations
  where public.is_admin()
  order by started_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- ── 실행 권한 최소화: public 회수 후 service_role(+관측 RPC 는 authenticated 관리자) ──
revoke all on function public.claim_admin_user_deletion(uuid, uuid, text, text, text, uuid, integer) from public;
revoke all on function public.complete_admin_user_deletion(uuid, jsonb) from public;
revoke all on function public.fail_admin_user_deletion(uuid, text) from public;
grant execute on function public.claim_admin_user_deletion(uuid, uuid, text, text, text, uuid, integer) to service_role;
grant execute on function public.complete_admin_user_deletion(uuid, jsonb) to service_role;
grant execute on function public.fail_admin_user_deletion(uuid, text) to service_role;
-- 관측 RPC 는 관리자(authenticated)만 의미있게 반환(is_admin 게이트) → authenticated 실행 허용.
grant execute on function public.admin_deletion_operations(integer) to authenticated, service_role;
