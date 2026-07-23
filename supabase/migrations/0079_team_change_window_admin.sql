-- FANCLUV — 0079: 응원팀 변경 window 운영 관리(Admin) + 서버 검증
--
-- 0078 의 team_change_windows(운영 설정)를 관리자가 화면에서 관리할 수 있도록 검증 RPC 추가.
--   · 검증: season_year 범위, starts_at < ends_at, season 중복(테이블 UNIQUE), is_admin 강제.
--   · 관리 권한은 RLS(tcw_admin_all=is_admin)로 이미 강제 — RPC 는 검증+감사 계층.
-- 기존 team_change_windows/audit_logs/is_admin 재사용. 신규 테이블 없음.
begin;

-- 유효성 CHECK(추가, 기존 데이터 없으므로 안전).
do $$ begin
  alter table public.team_change_windows add constraint tcw_valid_range check (starts_at < ends_at);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.team_change_windows add constraint tcw_valid_season check (season_year between 2000 and 2100);
exception when duplicate_object then null; end $$;

-- 관리자 window 저장(upsert by season). is_admin 강제 + 검증 + audit.
create or replace function public.admin_save_team_change_window(
  p_season integer, p_starts_at timestamptz, p_ends_at timestamptz, p_is_active boolean
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid := auth.uid(); v_role text; v_id uuid; v_created boolean;
begin
  if v_actor is null or not public.is_admin() then
    return jsonb_build_object('ok', false, 'code','NOT_ALLOWED'); end if;
  if p_season is null or p_season < 2000 or p_season > 2100 then
    return jsonb_build_object('ok', false, 'code','INVALID_SEASON'); end if;
  if p_starts_at is null or p_ends_at is null or p_starts_at >= p_ends_at then
    return jsonb_build_object('ok', false, 'code','INVALID_RANGE'); end if;

  select id into v_id from public.team_change_windows where season_year = p_season;
  v_created := v_id is null;
  insert into public.team_change_windows(season_year, starts_at, ends_at, is_active)
    values (p_season, p_starts_at, p_ends_at, coalesce(p_is_active, true))
  on conflict (season_year) do update
    set starts_at = excluded.starts_at, ends_at = excluded.ends_at,
        is_active = excluded.is_active, updated_at = now()
  returning id into v_id;

  select role::text into v_role from public.profiles where id = v_actor;
  insert into public.audit_logs(actor_id, actor_role, action, target_type, target_id, detail)
    values (v_actor, v_role, 'team_window.save', 'team_change_window', v_id::text,
            jsonb_build_object('season_year', p_season, 'is_active', coalesce(p_is_active, true), 'created', v_created));
  return jsonb_build_object('ok', true, 'code','OK', 'id', v_id, 'created', v_created);
end $$;
grant execute on function public.admin_save_team_change_window(integer, timestamptz, timestamptz, boolean) to authenticated;

commit;
