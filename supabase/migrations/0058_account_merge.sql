-- ============================================================================
-- FANCLUV — 0058_account_merge.sql   (Phase 11 — 계정 병합 / 1인 1계정 완성)
--
-- 배경: 0044/0057 로 "동일 DI → linked_providers append(linked)" 까지 구현됨.
--   이번엔 이를 실제 계정 병합(Account Merge)으로 확장한다.
--
-- 핵심 원칙
--   • 자동 병합 금지 — 항상 Merge Pending(승인) 단계를 거친다.
--   • 상태 전이는 전부 compare-and-set(동시 요청 중 정확히 1개만 성공).
--   • 삭제가 아니라 데이터 이관(activity/opinion/comment/like/survey/notification…).
--   • 원자성: complete 는 단일 트랜잭션 — 전부 이관+완료, 실패 시 전량 롤백(중간상태 없음).
--   • 보안: request 는 본인만. approve/reject 는 관리자. complete 는 service_role/superadmin.
--   • 감사: merge.request/approve/reject/cancel/complete/failed. 민감정보(DI/CI/주민번호) 미저장.
--
-- 병합 방향: source(loser) → target(winner=canonical). source 는 삭제하지 않고
--   deactivated_at + merged_into 로 소프트 병합(하드 삭제는 별도 admin-delete 경로).
-- ============================================================================

-- ── (0) 프로필 확장: 병합 대상 표식 + superadmin 플래그 ──────────────────────
alter table public.profiles
  add column if not exists merged_into  uuid references auth.users (id) on delete set null;
comment on column public.profiles.merged_into is
  '이 계정이 병합되어 흡수된 대표(canonical) 계정 id. 값이 있으면 이 계정은 비활성 병합됨.';

alter table public.profiles
  add column if not exists is_superadmin boolean not null default false;
comment on column public.profiles.is_superadmin is
  '슈퍼관리자 여부. 계정 병합 완료(complete_account_merge) 등 고위험 작업 실행 권한. 기본 false.';

-- 슈퍼관리자 판정(관리자 + is_superadmin). 미설정 시 아무도 아님 → 기본은 service_role 만 실행.
create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_superadmin and role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

-- ── (1) 권한 컬럼 가드 확장 — merged_into / is_superadmin 자기수정 차단 ────────
--   (0055 가드 재정의: 신뢰 컨텍스트[current_user<>'authenticated' 또는 admin]만 통과)
create or replace function public.guard_profile_privileged_cols()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user <> 'authenticated' or public.is_admin() then
    return NEW;
  end if;
  if NEW.role                is distinct from OLD.role
  or NEW.deactivated_at      is distinct from OLD.deactivated_at
  or NEW.verification_status is distinct from OLD.verification_status
  or NEW.identity_verified   is distinct from OLD.identity_verified
  or NEW.identity_verified_at is distinct from OLD.identity_verified_at
  or NEW.identity_provider   is distinct from OLD.identity_provider
  or NEW.identity_ci         is distinct from OLD.identity_ci
  or NEW.identity_di         is distinct from OLD.identity_di
  or NEW.identity_di_hash    is distinct from OLD.identity_di_hash
  or NEW.linked_providers    is distinct from OLD.linked_providers
  or NEW.is_email_verified   is distinct from OLD.is_email_verified
  or NEW.merged_into         is distinct from OLD.merged_into
  or NEW.is_superadmin       is distinct from OLD.is_superadmin then
    raise exception 'forbidden: cannot modify privileged profile columns' using errcode = '42501';
  end if;
  return NEW;
end $$;

drop trigger if exists guard_profiles_privileged on public.profiles;
create trigger guard_profiles_privileged
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_cols();

-- ── (2) merge_operations 테이블 ──────────────────────────────────────────────
create table if not exists public.merge_operations (
  operation_id    uuid primary key default gen_random_uuid(),
  source_user_id  uuid not null references auth.users (id) on delete cascade,   -- loser(흡수됨)
  target_user_id  uuid not null references auth.users (id) on delete cascade,   -- winner(canonical)
  status          text not null default 'pending'
                  check (status in ('pending', 'approved', 'completed', 'cancelled', 'failed', 'rejected')),
  reason          text,
  requested_by    uuid,
  approved_by     uuid,
  completed_at    timestamptz,
  failed_at       timestamptz,
  last_error_code text,
  retry_count     integer not null default 0,
  request_id      uuid,                             -- 멱등키(재요청 dedupe)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint merge_ops_distinct check (source_user_id <> target_user_id)
);

-- 멱등: 동일 request_id 재요청은 1행만.
create unique index if not exists merge_ops_request_id_uk
  on public.merge_operations (request_id) where request_id is not null;
-- source 당 진행중(pending/approved) 병합은 1건만(중복 요청 차단).
create unique index if not exists merge_ops_active_source_uk
  on public.merge_operations (source_user_id) where status in ('pending', 'approved');
create index if not exists merge_ops_status_idx  on public.merge_operations (status, created_at desc);
create index if not exists merge_ops_target_idx  on public.merge_operations (target_user_id);
create index if not exists merge_ops_source_idx  on public.merge_operations (source_user_id);

comment on table public.merge_operations is
  '계정 병합 작업(1인1계정). source→target 데이터 이관. 상태전이 compare-and-set, 자동병합 없음.';

-- ── (3) RLS: 본인이 관여한 행만 조회. 쓰기는 RPC/서비스만. ────────────────────
alter table public.merge_operations enable row level security;
revoke all on public.merge_operations from anon, authenticated;
grant select on public.merge_operations to authenticated;

drop policy if exists merge_ops_self_read on public.merge_operations;
create policy merge_ops_self_read on public.merge_operations for select
  using (auth.uid() = source_user_id or auth.uid() = target_user_id or public.is_admin());

-- ============================================================================
--  RPC 들 — 상태 전이는 전부 compare-and-set(where status = <기대값>).
-- ============================================================================

-- 감사 헬퍼(내부): service_role 컨텍스트에선 log_audit 가 auth.uid() null 로 no-op 이므로
--   actor 를 명시해 직접 insert 한다. 민감정보(DI/CI/email)는 detail 에 넣지 않는다.
create or replace function public._merge_audit(
  p_actor uuid, p_action text, p_op public.merge_operations, p_extra jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare r text;
begin
  select role into r from public.profiles where id = p_actor;
  insert into public.audit_logs(actor_id, actor_role, action, target_type, target_id, detail)
  values (p_actor, r, p_action, 'merge', p_op.operation_id::text,
          jsonb_build_object('operation_id', p_op.operation_id, 'request_id', p_op.request_id,
                             'source_user_id', p_op.source_user_id, 'target_user_id', p_op.target_user_id,
                             'status', p_op.status) || coalesce(p_extra, '{}'::jsonb));
end $$;

-- ── (3.1) requestMerge — 본인(source=auth.uid())이 동일 DI 대표계정과 병합 요청 ──
-- 반환: { ok, code: pending|exists|invalid|not_same_person|self, operation_id }
create or replace function public.request_account_merge(
  p_target uuid, p_reason text default null, p_request_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_op public.merge_operations; v_src_di text; v_tgt_di text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'unauthorized'); end if;
  if p_target is null or p_target = v_uid then return jsonb_build_object('ok', false, 'code', 'self'); end if;

  -- 멱등: 동일 request_id 재호출 → 기존 행 반환.
  if p_request_id is not null then
    select * into v_op from public.merge_operations where request_id = p_request_id;
    if found then return jsonb_build_object('ok', true, 'code', v_op.status, 'operation_id', v_op.operation_id); end if;
  end if;

  -- 동일인 확인: source(본인) 와 target 의 identity_di_hash 가 동일해야 병합 요청 가능.
  select identity_di_hash into v_src_di from public.profiles where id = v_uid;
  select identity_di_hash into v_tgt_di from public.profiles where id = p_target;
  if v_src_di is null or v_tgt_di is null or v_src_di <> v_tgt_di then
    return jsonb_build_object('ok', false, 'code', 'not_same_person');
  end if;

  -- source 당 진행중 병합 1건만(partial unique). 충돌이면 기존 반환.
  insert into public.merge_operations(source_user_id, target_user_id, status, reason, requested_by, request_id)
  values (v_uid, p_target, 'pending', left(coalesce(p_reason, ''), 500), v_uid, p_request_id)
  on conflict (source_user_id) where (status in ('pending','approved')) do nothing
  returning * into v_op;

  if v_op.operation_id is null then
    select * into v_op from public.merge_operations
      where source_user_id = v_uid and status in ('pending','approved')
      order by created_at desc limit 1;
    return jsonb_build_object('ok', true, 'code', 'exists', 'operation_id', v_op.operation_id);
  end if;

  perform public._merge_audit(v_uid, 'merge.request', v_op);
  return jsonb_build_object('ok', true, 'code', 'pending', 'operation_id', v_op.operation_id);
end $$;

-- ── (3.2) approveMerge — 관리자: pending → approved ──────────────────────────
create or replace function public.approve_account_merge(p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_op public.merge_operations;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  update public.merge_operations
     set status = 'approved', approved_by = v_uid, updated_at = now()
   where operation_id = p_operation_id and status = 'pending'
   returning * into v_op;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_pending'); end if;
  perform public._merge_audit(v_uid, 'merge.approve', v_op);
  return jsonb_build_object('ok', true, 'code', 'approved', 'operation_id', v_op.operation_id);
end $$;

-- ── (3.3) rejectMerge — 관리자: pending → rejected ───────────────────────────
create or replace function public.reject_account_merge(p_operation_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_op public.merge_operations;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  update public.merge_operations
     set status = 'rejected', approved_by = v_uid, reason = coalesce(left(p_reason,500), reason), updated_at = now()
   where operation_id = p_operation_id and status = 'pending'
   returning * into v_op;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_pending'); end if;
  perform public._merge_audit(v_uid, 'merge.reject', v_op);
  return jsonb_build_object('ok', true, 'code', 'rejected', 'operation_id', v_op.operation_id);
end $$;

-- ── (3.4) cancelMerge — 요청자 본인 또는 관리자: pending/approved → cancelled ──
create or replace function public.cancel_account_merge(p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_op public.merge_operations;
begin
  update public.merge_operations
     set status = 'cancelled', updated_at = now()
   where operation_id = p_operation_id
     and status in ('pending', 'approved')
     and (source_user_id = v_uid or requested_by = v_uid or public.is_admin())
   returning * into v_op;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_cancellable'); end if;
  perform public._merge_audit(v_uid, 'merge.cancel', v_op);
  return jsonb_build_object('ok', true, 'code', 'cancelled', 'operation_id', v_op.operation_id);
end $$;

-- ── (3.5) completeMerge — service_role/superadmin: approved → completed ──────
--   단일 트랜잭션 원자 이관. 동시성: 두 user 에 advisory_xact_lock(정렬 순서로 deadlock 방지).
--   실패 시 EXCEPTION 핸들러가 이관 작업(savepoint)을 롤백하고 status=failed 만 기록.
-- 반환: { ok, code: completed|already|not_approved|forbidden|source_gone|failed, moved{...} }
create or replace function public.complete_account_merge(p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_op public.merge_operations;
  v_src uuid; v_tgt uuid;
  v_lock1 bigint; v_lock2 bigint;
  v_moved jsonb := '{}'::jsonb;
  n_op int; n_cm int; n_lk int; n_sr int; n_nt int; n_ae int; n_rp int;
begin
  -- 권한: service_role(신뢰 컨텍스트 = auth.uid() null) 또는 superadmin 만.
  if not (v_uid is null or public.is_superadmin()) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  -- 대상 op 조회(아직 approved 여야).
  select * into v_op from public.merge_operations where operation_id = p_operation_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_op.status = 'completed' then return jsonb_build_object('ok', true, 'code', 'already', 'operation_id', v_op.operation_id); end if;
  if v_op.status <> 'approved' then return jsonb_build_object('ok', false, 'code', 'not_approved'); end if;

  v_src := v_op.source_user_id; v_tgt := v_op.target_user_id;

  -- 동시성 락(Merge/Delete/Suspend/Role/Identity 경합 직렬화). 두 키를 정렬해 deadlock 회피.
  v_lock1 := least(hashtextextended(v_src::text, 0), hashtextextended(v_tgt::text, 0));
  v_lock2 := greatest(hashtextextended(v_src::text, 0), hashtextextended(v_tgt::text, 0));
  perform pg_advisory_xact_lock(v_lock1);
  if v_lock2 <> v_lock1 then perform pg_advisory_xact_lock(v_lock2); end if;

  -- compare-and-set 재확인(락 획득 후 상태 재검증 — 동시 complete 중 1개만).
  select * into v_op from public.merge_operations where operation_id = p_operation_id and status = 'approved' for update;
  if not found then
    select status into v_op.status from public.merge_operations where operation_id = p_operation_id;
    if v_op.status = 'completed' then return jsonb_build_object('ok', true, 'code', 'already', 'operation_id', p_operation_id); end if;
    return jsonb_build_object('ok', false, 'code', 'not_approved');
  end if;

  begin  -- ── 원자 이관 블록(savepoint). 예외 시 이 블록 전체 롤백 ──
    -- source 프로필 존재 확인(동시 삭제되었으면 병합 중단).
    if not exists (select 1 from public.profiles where id = v_src) then
      raise exception 'source_gone';
    end if;

    -- (a) UNIQUE 제약 있는 테이블: 대상이 이미 가진 항목은 제거 후 이관(중복 회피).
    --   likes(opinion_id,user_id) — target 이 이미 누른 opinion 의 source like 삭제.
    delete from public.likes l where l.user_id = v_src
      and exists (select 1 from public.likes t where t.user_id = v_tgt and t.opinion_id = l.opinion_id);
    update public.likes set user_id = v_tgt where user_id = v_src;
    get diagnostics n_lk = row_count;

    --   survey_responses(survey_id,user_id) — target 이 이미 응답한 survey 는 source 응답 삭제
    --   (survey_answers 는 response FK ON DELETE CASCADE 로 함께 정리).
    delete from public.survey_responses r where r.user_id = v_src
      and exists (select 1 from public.survey_responses t where t.user_id = v_tgt and t.survey_id = r.survey_id);
    update public.survey_responses set user_id = v_tgt where user_id = v_src;
    get diagnostics n_sr = row_count;

    -- (b) 단순 재지정(UNIQUE 없음).
    update public.opinions       set author_id  = v_tgt where author_id  = v_src; get diagnostics n_op = row_count;
    update public.comments       set author_id  = v_tgt where author_id  = v_src; get diagnostics n_cm = row_count;
    update public.notifications  set user_id    = v_tgt where user_id    = v_src; get diagnostics n_nt = row_count;
    update public.activity_events set user_id   = v_tgt where user_id    = v_src; get diagnostics n_ae = row_count;
    -- reports.reporter_id (on delete set null) — 신고 이력도 이관.
    update public.reports        set reporter_id = v_tgt where reporter_id = v_src; get diagnostics n_rp = row_count;
    -- fan_ranking 은 activity_events 로부터 파생 → 위 이관으로 자동 반영(별도 테이블 없음).

    -- (c) identity/provider 병합 — source 의 linked_providers 를 target 에 dedupe 병합.
    update public.profiles t
       set linked_providers = (
             select coalesce(jsonb_agg(distinct e), '[]'::jsonb)
             from ( select jsonb_array_elements(t.linked_providers)
                    union
                    select jsonb_array_elements(s.linked_providers)
                    from public.profiles s where s.id = v_src ) x(e)
           ),
           -- target 이 아직 DI/인증정보가 없으면 source 것 승계(보통 target 이 canonical).
           identity_di_hash    = coalesce(t.identity_di_hash, (select identity_di_hash from public.profiles where id = v_src)),
           identity_verified   = t.identity_verified or coalesce((select identity_verified from public.profiles where id = v_src), false),
           updated_at = now()
     where t.id = v_tgt;

    -- (d) source 소프트 병합(삭제 아님): 비활성 + merged_into + 1DI-1계정 유니크 해제.
    update public.profiles
       set deactivated_at = now(), merged_into = v_tgt,
           linked_providers = '[]'::jsonb, identity_di_hash = null, updated_at = now()
     where id = v_src;

    -- (e) 상태 완료 전이.
    update public.merge_operations
       set status = 'completed', completed_at = now(), updated_at = now()
     where operation_id = p_operation_id;

    v_moved := jsonb_build_object('opinions', n_op, 'comments', n_cm, 'likes', n_lk,
                                  'survey_responses', n_sr, 'notifications', n_nt,
                                  'activity_events', n_ae, 'reports', n_rp);
    select * into v_op from public.merge_operations where operation_id = p_operation_id;
    perform public._merge_audit(coalesce(v_op.approved_by, v_op.requested_by), 'merge.complete', v_op, jsonb_build_object('moved', v_moved));
    return jsonb_build_object('ok', true, 'code', 'completed', 'operation_id', p_operation_id, 'moved', v_moved);

  exception when others then
    -- 이관 롤백됨(중간상태 없음). failed 만 기록 + 재시도 카운트.
    update public.merge_operations
       set status = 'failed', failed_at = now(), retry_count = retry_count + 1,
           last_error_code = left(coalesce(sqlerrm, sqlstate), 100), updated_at = now()
     where operation_id = p_operation_id;
    select * into v_op from public.merge_operations where operation_id = p_operation_id;
    perform public._merge_audit(coalesce(v_op.approved_by, v_op.requested_by), 'merge.failed', v_op, jsonb_build_object('error_code', v_op.last_error_code));
    return jsonb_build_object('ok', false, 'code',
             case when v_op.last_error_code = 'source_gone' then 'source_gone' else 'failed' end,
             'operation_id', p_operation_id);
  end;
end $$;

-- ── (3.6) getMergeStatus — 본인 관여 건 또는 관리자 ───────────────────────────
create or replace function public.get_merge_status(p_operation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_op public.merge_operations;
begin
  select * into v_op from public.merge_operations where operation_id = p_operation_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not (v_uid = v_op.source_user_id or v_uid = v_op.target_user_id or public.is_admin()) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  return jsonb_build_object('ok', true, 'operation_id', v_op.operation_id, 'status', v_op.status,
    'source_user_id', v_op.source_user_id, 'target_user_id', v_op.target_user_id,
    'requested_by', v_op.requested_by, 'approved_by', v_op.approved_by,
    'retry_count', v_op.retry_count, 'completed_at', v_op.completed_at, 'created_at', v_op.created_at);
end $$;

-- ── (3.7) 관리자 관측: pending/승인대기 목록(PII 없음) ────────────────────────
create or replace function public.admin_list_merge_operations(p_status text default null, p_limit integer default 50)
returns table(operation_id uuid, source_user_id uuid, target_user_id uuid, status text,
              requested_by uuid, approved_by uuid, retry_count integer, last_error_code text,
              created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select operation_id, source_user_id, target_user_id, status, requested_by, approved_by,
         retry_count, last_error_code, created_at, updated_at
  from public.merge_operations
  where public.is_admin() and (p_status is null or status = p_status)
  order by created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- ── (4) 실행 권한 최소화 ─────────────────────────────────────────────────────
revoke all on function public.request_account_merge(uuid, text, uuid) from public;
revoke all on function public.approve_account_merge(uuid) from public;
revoke all on function public.reject_account_merge(uuid, text) from public;
revoke all on function public.cancel_account_merge(uuid) from public;
revoke all on function public.complete_account_merge(uuid) from public;
revoke all on function public.get_merge_status(uuid) from public;
revoke all on function public.admin_list_merge_operations(text, integer) from public;
revoke all on function public.is_superadmin() from public;
revoke all on function public._merge_audit(uuid, text, public.merge_operations, jsonb) from public;

-- request/cancel/getStatus/approve/reject/list: 인증 사용자(내부에서 본인/관리자 게이트).
grant execute on function public.request_account_merge(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.cancel_account_merge(uuid) to authenticated, service_role;
grant execute on function public.get_merge_status(uuid) to authenticated, service_role;
grant execute on function public.approve_account_merge(uuid) to authenticated, service_role;
grant execute on function public.reject_account_merge(uuid, text) to authenticated, service_role;
grant execute on function public.admin_list_merge_operations(text, integer) to authenticated, service_role;
grant execute on function public.is_superadmin() to authenticated, service_role;
-- complete: 고위험 데이터 이관 → service_role 및 (게이트 통과하는)superadmin 만.
grant execute on function public.complete_account_merge(uuid) to authenticated, service_role;
