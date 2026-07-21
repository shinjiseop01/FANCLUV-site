-- FANCLUV — Phase 18: AI 의견 작성 지원 기반(0068)
--
-- 목적: 팬이 직접 입력한 원문을 AI 로 "정리"하는 작성 보조. AI 가 대신 생성/게시하지 않는다.
-- 이 마이그레이션은 사용량 메타(비식별)와 kill switch 설정, 원자적 rate/중복 제어 RPC 를 만든다.
--
-- 개인정보 보호 원칙(§7, §11):
--   • 원문/AI 전체 출력은 저장하지 않는다(길이·단위·상태·안전등급 메타만).
--   • DI/이메일/IP/JWT/프로필 PII 미기록. 관리자도 원문을 열람할 수 없다(집계 RPC 만).
--   • ai_writing_requests 직접 INSERT/UPDATE 는 RLS 로 차단, definer RPC 로만 기록.
--
-- 강제 지점(§8): 분/일 한도·중복 억제·kill switch 는 서버(RPC)에서 강제한다. 프론트는 UX 용.

-- ─────────────────────────────────────────────────────────────────────
-- 1) 설정(kill switch + 한도) — 단일 행(id=1). definer RPC 로만 접근.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.ai_settings (
  id             smallint primary key default 1 check (id = 1),
  provider       text    not null default 'mock',
  enabled        boolean not null default true,   -- kill switch (false=AI 전면 비활성)
  rate_per_min   int     not null default 5,
  rate_per_day   int     not null default 30,
  admin_per_min  int     not null default 20,
  admin_per_day  int     not null default 200,
  dedupe_window_secs int not null default 10,
  updated_by     uuid,
  updated_at     timestamptz not null default now()
);
insert into public.ai_settings (id) values (1) on conflict (id) do nothing;
alter table public.ai_settings enable row level security;
-- 정책 없음 → 직접 접근 불가(SECURITY DEFINER RPC 로만).

-- ─────────────────────────────────────────────────────────────────────
-- 2) 사용량 로그(비식별 메타만). 원문/출력 텍스트 컬럼 없음.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.ai_writing_requests (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  operation              text not null check (operation in ('improve','constructive','summarize','titles','structure')),
  source_length          int,
  output_length          int,
  provider               text,
  model                  text,
  status                 text not null default 'pending'
                           check (status in ('pending','success','failed','safety_blocked',
                                             'timeout','unavailable','rate_limited','daily_limit','duplicate','disabled')),
  safety_result          text,   -- 안전등급만: none|info|warn|block (원문 아님)
  estimated_input_units  int,
  estimated_output_units int,
  error_code             text,
  dedupe_hash            text,   -- 원문+operation 의 해시(원문 자체 아님) — 중복 억제용
  created_at             timestamptz not null default now(),
  completed_at           timestamptz
);
alter table public.ai_writing_requests enable row level security;
-- 본인 행만 조회 가능(집계 외 개별 열람은 본인). 관리자 전체 열람은 집계 RPC 로만.
drop policy if exists ai_req_select_own on public.ai_writing_requests;
create policy ai_req_select_own on public.ai_writing_requests
  for select using (user_id = auth.uid());
-- INSERT/UPDATE/DELETE 정책 없음 → 직접 쓰기 차단(definer RPC 로만 기록).

create index if not exists ix_ai_req_user_created on public.ai_writing_requests(user_id, created_at desc);
create index if not exists ix_ai_req_created on public.ai_writing_requests(created_at);
create index if not exists ix_ai_req_user_dedupe on public.ai_writing_requests(user_id, dedupe_hash, created_at desc);

-- ─────────────────────────────────────────────────────────────────────
-- 3) opinions 확장 — 최종 확정 텍스트는 기존 컬럼, AI 메타만 추가.
--    (AI 초안을 본문 컬럼에 자동 저장하지 않는다 — 사용자가 적용한 최종본만 body 에.)
-- ─────────────────────────────────────────────────────────────────────
alter table public.opinions add column if not exists ai_assisted boolean not null default false;
alter table public.opinions add column if not exists ai_operation text;
alter table public.opinions add column if not exists ai_request_id uuid references public.ai_writing_requests(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────
-- 4) 감사 헬퍼(관리자 액션만 — kill switch/설정 변경).
-- ─────────────────────────────────────────────────────────────────────
create or replace function public._ai_audit(p_actor uuid, p_action text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if p_actor is null then return; end if;
  select role into r from public.profiles where id = p_actor;
  insert into public.audit_logs(actor_id, actor_role, action, target_type, target_id, detail)
  values (p_actor, r, p_action, 'ai_settings', '1', coalesce(p_detail, '{}'::jsonb));
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 5) kill switch 조회(로그인 팬 — 버튼 노출 판단용, boolean 만).
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.ai_writing_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from public.ai_settings where id = 1), true);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 6) 요청 시작 — 원자적: kill switch → 직렬화(연타/동시) → 중복 억제 → rate/일 한도 → pending 기록.
--    반환 {ok, code, request_id?}. code: ok|unauthorized|unsupported_operation|disabled|
--          duplicate|rate_limited|daily_limit
--    로그 폭주 방지를 위해 거부(rate/daily/duplicate/disabled)도 관측용 행을 남기되,
--    분당 총행이 하드캡을 넘으면 행을 남기지 않고 즉시 거부한다.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.ai_writing_begin(p_operation text, p_dedupe_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean;
  v_enabled boolean; v_win int; v_pm int; v_pd int;
  v_all int; v_bill_min int; v_bill_day int;
  v_existing uuid; v_new uuid;
  c_billable constant text[] := array['pending','success','failed','safety_blocked','timeout','unavailable'];
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'unauthorized'); end if;
  if p_operation is null or p_operation not in ('improve','constructive','summarize','titles','structure') then
    return jsonb_build_object('ok', false, 'code', 'unsupported_operation');
  end if;

  v_admin := public.is_admin();
  select enabled, dedupe_window_secs,
         case when v_admin then admin_per_min else rate_per_min end,
         case when v_admin then admin_per_day else rate_per_day end
    into v_enabled, v_win, v_pm, v_pd
    from public.ai_settings where id = 1;

  -- 동일 사용자+동일 요청 직렬화(버튼 연타/동시요청 20개 → 1회만 통과)
  perform pg_advisory_xact_lock(hashtext(v_uid::text || ':' || coalesce(p_dedupe_hash, '')));

  -- 로그 폭주 하드캡(행 미기록) — 분당 총 행이 한도의 3배 이상이면 즉시 거부
  select count(*) into v_all from public.ai_writing_requests
    where user_id = v_uid and created_at > now() - interval '1 minute';
  if v_all >= v_pm * 3 then return jsonb_build_object('ok', false, 'code', 'rate_limited'); end if;

  if not coalesce(v_enabled, true) then
    insert into public.ai_writing_requests(user_id, operation, dedupe_hash, status, error_code)
      values (v_uid, p_operation, p_dedupe_hash, 'disabled', 'disabled');
    return jsonb_build_object('ok', false, 'code', 'disabled');
  end if;

  -- 중복 억제(단시간 동일 원문·operation) — 기존 결과 재사용 유도
  if p_dedupe_hash is not null and length(p_dedupe_hash) > 0 then
    select id into v_existing from public.ai_writing_requests
      where user_id = v_uid and dedupe_hash = p_dedupe_hash
        and status in ('pending','success')
        and created_at > now() - make_interval(secs => v_win)
      order by created_at desc limit 1;
    if v_existing is not null then
      insert into public.ai_writing_requests(user_id, operation, dedupe_hash, status)
        values (v_uid, p_operation, p_dedupe_hash, 'duplicate');
      return jsonb_build_object('ok', false, 'code', 'duplicate', 'request_id', v_existing);
    end if;
  end if;

  -- rate limit(분) — 실제 provider 시도만 집계
  select count(*) into v_bill_min from public.ai_writing_requests
    where user_id = v_uid and status = any(c_billable) and created_at > now() - interval '1 minute';
  if v_bill_min >= v_pm then
    insert into public.ai_writing_requests(user_id, operation, dedupe_hash, status, error_code)
      values (v_uid, p_operation, p_dedupe_hash, 'rate_limited', 'rate_limited');
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  -- 일일 한도(UTC 달력일)
  select count(*) into v_bill_day from public.ai_writing_requests
    where user_id = v_uid and status = any(c_billable) and created_at >= date_trunc('day', now());
  if v_bill_day >= v_pd then
    insert into public.ai_writing_requests(user_id, operation, dedupe_hash, status, error_code)
      values (v_uid, p_operation, p_dedupe_hash, 'daily_limit', 'daily_limit');
    return jsonb_build_object('ok', false, 'code', 'daily_limit');
  end if;

  insert into public.ai_writing_requests(user_id, operation, dedupe_hash, status)
    values (v_uid, p_operation, p_dedupe_hash, 'pending')
    returning id into v_new;
  return jsonb_build_object('ok', true, 'code', 'ok', 'request_id', v_new);
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 7) 요청 완료 — 본인 pending 행만 갱신(메타만).
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.ai_writing_complete(
  p_request_id uuid, p_status text, p_provider text, p_model text,
  p_source_length int, p_output_length int, p_input_units int, p_output_units int,
  p_safety text, p_error_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'unauthorized'); end if;
  if p_status not in ('success','failed','safety_blocked','timeout','unavailable') then
    return jsonb_build_object('ok', false, 'code', 'bad_status');
  end if;
  update public.ai_writing_requests
     set status = p_status, provider = p_provider, model = p_model,
         source_length = p_source_length, output_length = p_output_length,
         estimated_input_units = p_input_units, estimated_output_units = p_output_units,
         safety_result = p_safety, error_code = p_error_code, completed_at = now()
   where id = p_request_id and user_id = v_uid and status = 'pending';
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 8) 관리자 집계(비식별) — 오늘/지정일. is_admin 만.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.ai_writing_admin_stats(p_day date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_day date := coalesce(p_day, (now() at time zone 'UTC')::date); v_out jsonb;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select jsonb_build_object(
    'ok', true,
    'day', v_day,
    'total', count(*),
    'success', count(*) filter (where status = 'success'),
    'failed', count(*) filter (where status in ('failed','timeout','unavailable','safety_blocked')),
    'rate_limited', count(*) filter (where status in ('rate_limited','daily_limit')),
    'duplicate', count(*) filter (where status = 'duplicate'),
    'by_operation', coalesce((select jsonb_object_agg(operation, c) from (
        select operation, count(*) c from public.ai_writing_requests
         where created_at::date = v_day group by operation) o), '{}'::jsonb),
    'avg_ms', coalesce(round(avg(extract(epoch from (completed_at - created_at)) * 1000)
                 filter (where completed_at is not null))::int, 0),
    'estimated_units', coalesce(sum(coalesce(estimated_input_units,0) + coalesce(estimated_output_units,0)), 0),
    'recent_error_codes', coalesce((select jsonb_agg(ec) from (
        select distinct error_code ec from public.ai_writing_requests
         where created_at::date = v_day and error_code is not null
         order by error_code limit 8) e), '[]'::jsonb)
  ) into v_out
  from public.ai_writing_requests where created_at::date = v_day;
  return v_out;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 9) 관리자 설정 조회 + kill switch/Provider 변경(감사 기록).
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.ai_writing_get_settings()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select jsonb_build_object('ok', true, 'provider', provider, 'enabled', enabled,
           'rate_per_min', rate_per_min, 'rate_per_day', rate_per_day,
           'admin_per_min', admin_per_min, 'admin_per_day', admin_per_day,
           'dedupe_window_secs', dedupe_window_secs, 'updated_at', updated_at)
    into v from public.ai_settings where id = 1;
  return v;
end $$;

create or replace function public.ai_writing_set_enabled(p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_from boolean;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select enabled into v_from from public.ai_settings where id = 1;
  update public.ai_settings set enabled = p_enabled, updated_by = v_uid, updated_at = now() where id = 1;
  perform public._ai_audit(v_uid, 'ai_writing.killswitch',
    jsonb_build_object('from', v_from, 'to', p_enabled));
  return jsonb_build_object('ok', true, 'enabled', p_enabled);
end $$;

create or replace function public.ai_writing_set_provider(p_provider text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_from text;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  if p_provider not in ('mock','openai') then return jsonb_build_object('ok', false, 'code', 'bad_provider'); end if;
  select provider into v_from from public.ai_settings where id = 1;
  update public.ai_settings set provider = p_provider, updated_by = v_uid, updated_at = now() where id = 1;
  perform public._ai_audit(v_uid, 'ai_writing.provider', jsonb_build_object('from', v_from, 'to', p_provider));
  return jsonb_build_object('ok', true, 'provider', p_provider);
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 10) 권한 — public 회수 후 authenticated/service_role 에만 실행 허용.
--     내부 헬퍼(_ai_audit)는 노출하지 않는다.
-- ─────────────────────────────────────────────────────────────────────
revoke all on function public._ai_audit(uuid, text, jsonb) from public;
revoke all on function public.ai_writing_enabled() from public;
revoke all on function public.ai_writing_begin(text, text) from public;
revoke all on function public.ai_writing_complete(uuid, text, text, text, int, int, int, int, text, text) from public;
revoke all on function public.ai_writing_admin_stats(date) from public;
revoke all on function public.ai_writing_get_settings() from public;
revoke all on function public.ai_writing_set_enabled(boolean) from public;
revoke all on function public.ai_writing_set_provider(text) from public;

grant execute on function public.ai_writing_enabled() to authenticated, service_role;
grant execute on function public.ai_writing_begin(text, text) to authenticated, service_role;
grant execute on function public.ai_writing_complete(uuid, text, text, text, int, int, int, int, text, text) to authenticated, service_role;
grant execute on function public.ai_writing_admin_stats(date) to authenticated, service_role;
grant execute on function public.ai_writing_get_settings() to authenticated, service_role;
grant execute on function public.ai_writing_set_enabled(boolean) to authenticated, service_role;
grant execute on function public.ai_writing_set_provider(text) to authenticated, service_role;
