-- 0093_club_action_selfservice.sql
-- Feedback Loop Phase 3: Club Account 가 자기 구단 club_actions 를 직접 생성/수정/상태변경/삭제.
--
-- 원칙:
--   · club_actions raw write 를 Club 에게 열지 않는다(RLS 는 여전히 admin-only). gated SECURITY DEFINER RPC 만.
--   · club_id 는 서버가 current_user_team() 으로 결정(클라이언트 입력 무시). ai_insight_id/report_id 연결은 자기 구단 소유 검증.
--   · 생성 status 는 항상 planned, is_published=false, created_by=auth.uid(). 클라이언트가 done/published 로 못 만든다.
--   · done↔공개 는 기존 Phase1(club_publish_action/guard trigger) 재사용 — 이 파일에서 publish 안 함.
--   · Admin 은 기존 AdminClubActions(admin RLS 직접 write) 유지 — 이 RPC 는 Club 셀프서비스용.
-- Additive only. 기존 migration 무수정. destructive 없음.

-- ── 헬퍼: 호출자가 해당 action 을 관리할 수 있는가(admin 또는 자기구단 Club) ──
create or replace function public._can_manage_action(p_club_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.is_club_account() and public.current_user_team() = p_club_id);
$$;

-- ── 1) 생성 ── club_id=current_user_team(), status=planned 강제. insight/report 자기구단 검증.
create or replace function public.club_create_action(
  p_title text, p_description text default null, p_category text default 'etc',
  p_action_date date default null, p_ai_insight_id text default null, p_report_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_club text; v_title text := btrim(coalesce(p_title,'')); v_new_id bigint; ins_club text; rep_team text;
begin
  if not public.is_club_account() then
    return jsonb_build_object('ok', false, 'code', 'NOT_ALLOWED');
  end if;
  v_club := public.current_user_team();
  if v_club is null or btrim(v_club) = '' then
    return jsonb_build_object('ok', false, 'code', 'no_team');
  end if;
  if v_title = '' or length(v_title) > 200 then
    return jsonb_build_object('ok', false, 'code', 'bad_title');
  end if;
  -- AI Insight 연결: 자기 구단 소유만.
  if p_ai_insight_id is not null and btrim(p_ai_insight_id) <> '' then
    begin select club_id into ins_club from public.ai_insights where id = p_ai_insight_id::uuid;
    exception when others then ins_club := null; end;
    if ins_club is distinct from v_club then return jsonb_build_object('ok', false, 'code', 'insight_not_allowed'); end if;
  end if;
  -- Report 연결: 자기 구단 소유만.
  if p_report_id is not null and btrim(p_report_id) <> '' then
    begin select team_id into rep_team from public.club_reports where id = p_report_id::uuid;
    exception when others then rep_team := null; end;
    if rep_team is distinct from v_club then return jsonb_build_object('ok', false, 'code', 'report_not_allowed'); end if;
  end if;

  insert into public.club_actions (club_id, title, description, category, status, action_date, ai_insight_id, report_id, created_by, is_published)
  values (v_club, v_title, nullif(btrim(coalesce(p_description,'')),''), coalesce(nullif(btrim(coalesce(p_category,'')),''),'etc'),
          'planned', p_action_date, nullif(btrim(coalesce(p_ai_insight_id,'')),''), nullif(btrim(coalesce(p_report_id,'')),''), auth.uid(), false)
  returning id into v_new_id;
  return jsonb_build_object('ok', true, 'id', v_new_id);
end $$;

-- ── 2) 내부 필드 수정 ── 공개/상태 필드는 건드리지 않는다(각각 별도 RPC).
create or replace function public.club_update_action(
  p_action_id bigint, p_title text default null, p_description text default null,
  p_category text default null, p_action_date date default null, p_result_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record; v_title text;
begin
  select * into a from public.club_actions where id = p_action_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public._can_manage_action(a.club_id) then return jsonb_build_object('ok', false, 'code', 'NOT_ALLOWED'); end if;
  v_title := btrim(coalesce(p_title, a.title));
  if v_title = '' or length(v_title) > 200 then return jsonb_build_object('ok', false, 'code', 'bad_title'); end if;
  update public.club_actions set
    title = v_title,
    description = case when p_description is null then description else nullif(btrim(p_description),'') end,
    category = coalesce(nullif(btrim(coalesce(p_category,'')),''), category),
    action_date = coalesce(p_action_date, action_date),
    result_note = case when p_result_note is null then result_note else nullif(btrim(p_result_note),'') end,
    updated_at = now()
  where id = p_action_id;
  return jsonb_build_object('ok', true, 'id', p_action_id);
end $$;

-- ── 3) 상태 변경 ── planned/in_progress/done/closed. done 시 completed_at·non-done 시 auto-unpublish 는 guard trigger 가 처리.
create or replace function public.club_set_action_status(p_action_id bigint, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record;
begin
  if p_status not in ('planned','in_progress','done','closed') then
    return jsonb_build_object('ok', false, 'code', 'bad_status');
  end if;
  select * into a from public.club_actions where id = p_action_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public._can_manage_action(a.club_id) then return jsonb_build_object('ok', false, 'code', 'NOT_ALLOWED'); end if;
  update public.club_actions set status = p_status, updated_at = now() where id = p_action_id;
  return jsonb_build_object('ok', true, 'id', p_action_id, 'status', p_status);
end $$;

-- ── 4) 삭제 ── 기록 보존: planned + 미공개 조치만 삭제 허용(§10). in_progress/done/published 는 삭제 불가.
create or replace function public.club_delete_action(p_action_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from public.club_actions where id = p_action_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not public._can_manage_action(a.club_id) then return jsonb_build_object('ok', false, 'code', 'NOT_ALLOWED'); end if;
  if a.status <> 'planned' or a.is_published then
    return jsonb_build_object('ok', false, 'code', 'delete_forbidden');
  end if;
  delete from public.club_actions where id = p_action_id;
  return jsonb_build_object('ok', true, 'id', p_action_id);
end $$;

-- ── 권한 ──
revoke all on function public._can_manage_action(text) from public;
revoke all on function public.club_create_action(text, text, text, date, text, text) from public;
revoke all on function public.club_update_action(bigint, text, text, text, date, text) from public;
revoke all on function public.club_set_action_status(bigint, text) from public;
revoke all on function public.club_delete_action(bigint) from public;
grant execute on function public.club_create_action(text, text, text, date, text, text) to authenticated;
grant execute on function public.club_update_action(bigint, text, text, text, date, text) to authenticated;
grant execute on function public.club_set_action_status(bigint, text) to authenticated;
grant execute on function public.club_delete_action(bigint) to authenticated;
