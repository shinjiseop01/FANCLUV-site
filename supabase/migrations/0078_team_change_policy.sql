-- FANCLUV — 0078: 응원팀 시즌 변경 정책 + Admin 응원팀 관리
--
-- 정책:
--   · 최초 선택(selected_team NULL → 팀): 변경권 미소비(initial).
--   · Fan(role='user') 시즌 1회 변경: 활성 window 안에서만, 시즌당 1회(DB UNIQUE 강제).
--   · window 는 프런트 하드코딩 금지 → team_change_windows(운영 설정)로 서버 관리.
--   · Admin/Super/Staff override: window 무관, Fan 변경권 미소비, audit_logs 기록.
--   · selected_team 직접 UPDATE(PostgREST/DevTools) 우회 차단(트리거) — nickname/avatar 등은 정상.
-- 기존 재사용: audit_logs(관리자 감사), is_admin()(admin/superadmin/staff), profiles.selected_team.
begin;

-- 1) 시즌 변경 window(운영 설정). 시즌당 1행(unique).
create table if not exists public.team_change_windows (
  id         uuid primary key default gen_random_uuid(),
  season_year integer not null unique,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists team_change_windows_active_idx
  on public.team_change_windows (is_active, starts_at, ends_at);
alter table public.team_change_windows enable row level security;
do $$ begin
  create policy tcw_admin_all on public.team_change_windows for all
    using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy tcw_read on public.team_change_windows for select using (auth.uid() is not null);
exception when duplicate_object then null; end $$;

-- 2) 변경 기록(감사 + 시즌 1회 강제). 개인정보 최소(user_id/team/actor 만).
create table if not exists public.team_changes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  season_year integer,                       -- fan_season_change 필수, initial/admin 은 NULL
  from_team   text,
  to_team     text not null,
  change_type text not null check (change_type in ('initial','fan_season_change','admin_override')),
  actor_id    uuid,                          -- fan=본인, admin_override=관리자
  created_at  timestamptz not null default now()
);
-- 시즌당 Fan 변경 1회(race-safe): 동시 2건 중 1건 23505.
create unique index if not exists team_changes_fan_once
  on public.team_changes (user_id, season_year) where change_type = 'fan_season_change';
create index if not exists team_changes_user_idx on public.team_changes (user_id, created_at desc);
alter table public.team_changes enable row level security;
do $$ begin
  create policy tc_admin_read on public.team_changes for select using (public.is_admin());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy tc_self_read on public.team_changes for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- 3) 유효 K리그 팀(코드 teams.jsx 와 동기). 함수 상수.
create or replace function public.is_valid_team(p_team text)
returns boolean language sql immutable as $$
  select p_team in ('seoul','ulsan','jeonbuk','pohang','daejeon','gwangju',
                    'gangwon','gimcheon','jeju','anyang','incheon','bucheon')
$$;

-- 4) selected_team 직접 변경 차단 트리거.
--    허용: 최초 선택(OLD NULL) / RPC 경유(세션 GUC app.team_change_ok='on').
--    차단: 그 외 직접 UPDATE. 다른 컬럼(nickname/avatar 등)은 무영향.
create or replace function public.guard_selected_team()
returns trigger language plpgsql as $$
begin
  if new.selected_team is distinct from old.selected_team then
    if old.selected_team is null then return new; end if;                    -- 최초 선택
    if coalesce(current_setting('app.team_change_ok', true), 'off') = 'on'
      then return new; end if;                                               -- RPC(정책 검증 후)
    raise exception 'team_change_forbidden' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_selected_team on public.profiles;
create trigger trg_guard_selected_team before update on public.profiles
  for each row execute function public.guard_selected_team();

-- 5) 현재 활성 window.
create or replace function public.current_team_change_window()
returns public.team_change_windows language sql stable as $$
  select * from public.team_change_windows
  where is_active = true and now() >= starts_at and now() <= ends_at
  order by starts_at desc limit 1
$$;

-- 6) Fan 변경 상태(설정 페이지용).
create or replace function public.team_change_status()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); v_team text; v_role text;
        v_win public.team_change_windows; v_next public.team_change_windows; v_used boolean := false;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code','unauthorized'); end if;
  select selected_team, role::text into v_team, v_role from public.profiles where id = v_uid;
  v_win := public.current_team_change_window();
  select * into v_next from public.team_change_windows
    where is_active = true and starts_at > now() order by starts_at asc limit 1;
  if v_win.id is not null then
    select exists(select 1 from public.team_changes
      where user_id = v_uid and season_year = v_win.season_year and change_type = 'fan_season_change') into v_used;
  end if;
  return jsonb_build_object(
    'ok', true, 'current_team', v_team, 'role', v_role,
    'window_open', (v_win.id is not null), 'already_used', v_used,
    'can_change', (v_win.id is not null and not v_used and v_team is not null and v_role = 'user'),
    'season_year', v_win.season_year, 'window_start', v_win.starts_at, 'window_end', v_win.ends_at,
    'next_start', v_next.starts_at, 'next_end', v_next.ends_at
  );
end $$;
grant execute on function public.team_change_status() to authenticated;

-- 7) Fan 팀 변경(정책 강제 + atomic + row-lock + UNIQUE race 방어).
create or replace function public.fan_change_team(p_to_team text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); v_team text; v_role text; v_win public.team_change_windows;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code','NOT_ALLOWED'); end if;
  if p_to_team is null or not public.is_valid_team(p_to_team) then
    return jsonb_build_object('ok', false, 'code','INVALID_TEAM'); end if;
  select selected_team, role::text into v_team, v_role from public.profiles where id = v_uid for update; -- row lock
  if not found or v_role <> 'user' then return jsonb_build_object('ok', false, 'code','NOT_ALLOWED'); end if;
  if v_team is null then return jsonb_build_object('ok', false, 'code','NO_TEAM'); end if;
  if v_team = p_to_team then return jsonb_build_object('ok', false, 'code','SAME_TEAM'); end if;
  v_win := public.current_team_change_window();
  if v_win.id is null then return jsonb_build_object('ok', false, 'code','TEAM_CHANGE_WINDOW_CLOSED'); end if;
  begin
    insert into public.team_changes(user_id, season_year, from_team, to_team, change_type, actor_id)
      values (v_uid, v_win.season_year, v_team, p_to_team, 'fan_season_change', v_uid);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code','TEAM_CHANGE_ALREADY_USED');
  end;
  perform set_config('app.team_change_ok', 'on', true);
  update public.profiles set selected_team = p_to_team, updated_at = now() where id = v_uid;
  return jsonb_build_object('ok', true, 'code','OK', 'to_team', p_to_team, 'season_year', v_win.season_year);
end $$;
grant execute on function public.fan_change_team(text) to authenticated;

-- 8) Admin override(window 무관, Fan 변경권 미소비, audit 기록).
create or replace function public.admin_change_team(p_user_id uuid, p_to_team text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid := auth.uid(); v_from text; v_actor_role text;
begin
  if v_actor is null or not public.is_admin() then
    return jsonb_build_object('ok', false, 'code','NOT_ALLOWED'); end if;
  if p_to_team is null or not public.is_valid_team(p_to_team) then
    return jsonb_build_object('ok', false, 'code','INVALID_TEAM'); end if;
  select selected_team into v_from from public.profiles where id = p_user_id for update;
  if not found then return jsonb_build_object('ok', false, 'code','USER_NOT_FOUND'); end if;
  if v_from is not distinct from p_to_team then return jsonb_build_object('ok', false, 'code','SAME_TEAM'); end if;
  insert into public.team_changes(user_id, season_year, from_team, to_team, change_type, actor_id)
    values (p_user_id, null, v_from, p_to_team, 'admin_override', v_actor);
  perform set_config('app.team_change_ok', 'on', true);
  update public.profiles set selected_team = p_to_team, updated_at = now() where id = p_user_id;
  select role::text into v_actor_role from public.profiles where id = v_actor;
  insert into public.audit_logs(actor_id, actor_role, action, target_type, target_id, detail)
    values (v_actor, v_actor_role, 'member.team_change', 'profile', p_user_id::text,
            jsonb_build_object('from_team', v_from, 'to_team', p_to_team, 'change_type', 'admin_override'));
  return jsonb_build_object('ok', true, 'code','OK', 'from_team', v_from, 'to_team', p_to_team);
end $$;
grant execute on function public.admin_change_team(uuid, text) to authenticated;

commit;
