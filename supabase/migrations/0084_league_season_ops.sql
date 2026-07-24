-- FANCLUV — 0084: 시즌 전체 데이터 운영(경계 조회 + 관리자 수동 동기화 + 시즌 요약).
--
-- 0083 이후 시즌 전체(backfill)를 보유하므로, 경기 조회 RPC 가 시즌 전체를 반환하지 않도록
-- 서버에서 경계(최근 finished + 예정 scheduled)를 두고, 관리자 수동 동기화(지금/전체)를 추가한다.
-- additive. destructive 없음.
begin;

-- ── 경기 조회(경계): 구단별 최근 종료 N + 예정 N 만(시즌 전체 전송 방지, §19/§28) ──
create or replace function public.league_matches_view(p_league int default 1, p_club text default null, p_year int default null)
returns jsonb language sql stable set search_path=public as $$
  with y as (select coalesce(p_year, public.league_current_season(p_league)) yr),
  base as (
    select m.* from public.league_matches m
    where m.league_id = p_league and m.season_year = (select yr from y)
      and (p_club is null or m.home_club_id = p_club or m.away_club_id = p_club)
  ),
  recent as (  -- 최근 종료 25(내림차순)
    select * from base where status = 'finished' order by kickoff_at desc nulls last limit 25
  ),
  upcoming as (  -- 예정/진행 25(오름차순)
    select * from base where status in ('scheduled','live','postponed') order by kickoff_at asc nulls last limit 25
  ),
  picked as (select * from recent union all select * from upcoming)
  select coalesce(jsonb_agg(jsonb_build_object(
      'externalId', external_id, 'round', round, 'kickoffAt', kickoff_at,
      'gameDate', game_date, 'gameTime', game_time,
      'homeClubId', home_club_id, 'awayClubId', away_club_id,
      'homeTeamName', home_team_name, 'awayTeamName', away_team_name,
      'homeScore', home_score, 'awayScore', away_score,
      'status', status, 'stadium', stadium
    ) order by kickoff_at), '[]'::jsonb)
  from picked
$$;
grant execute on function public.league_matches_view(int, text, int) to anon, authenticated;

-- ── 관리자 수동 동기화: is_admin 게이트 + rate limit + pg_net 으로 edge 호출(secret=Vault) ──
--   p_mode: 'incremental'(기본) | 'backfill'(시즌 전체). Fan/Club 호출 불가.
create or replace function public.admin_league_sync(p_mode text default 'incremental')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_req bigint; v_mode text := case when p_mode = 'backfill' then 'backfill' else 'incremental' end; v_role text;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'NOT_ALLOWED'); end if;
  -- rate limit(double-submit/과호출 방지): 최근 30초 수동 트리거 있으면 차단.
  if exists (select 1 from public.league_sync_state where resource = 'manual_trigger' and updated_at > now() - interval '30 seconds') then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  end if;
  insert into public.league_sync_state(resource, updated_at) values ('manual_trigger', now())
    on conflict (resource) do update set updated_at = now();
  -- edge 호출(서버측만 — 시크릿은 Vault, 브라우저 미노출).
  select net.http_post(
    url := 'https://cuuzbddxnzhhlrqmmebz.supabase.co/functions/v1/kleague-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-league-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'league_sync_secret')),
    body := jsonb_build_object('mode', v_mode),
    timeout_milliseconds := 150000
  ) into v_req;
  select role::text into v_role from public.profiles where id = auth.uid();
  insert into public.audit_logs(actor_id, actor_role, action, target_type, target_id, detail)
    values (auth.uid(), v_role, 'league.manual_sync', 'league', v_mode, jsonb_build_object('mode', v_mode, 'requestId', v_req));
  return jsonb_build_object('ok', true, 'mode', v_mode, 'requestId', v_req);
end $$;
grant execute on function public.admin_league_sync(text) to authenticated;

-- ── 시즌 요약(관리자): 수집된 시즌 목록 + 시즌별 순위/경기 건수(§15) ──
create or replace function public.league_seasons_summary()
returns jsonb language sql stable security definer set search_path=public as $$
  select case when not public.is_admin() then jsonb_build_object('ok', false, 'code', 'NOT_ALLOWED')
  else jsonb_build_object('ok', true, 'seasons', coalesce((
    select jsonb_agg(jsonb_build_object(
      'season', se.season_year, 'isCurrent', se.is_current,
      'standings', (select count(*) from public.league_standings s where s.season_id = se.id),
      'matches', (select count(*) from public.league_matches m where m.league_id = se.league_id and m.season_year = se.season_year),
      'finished', (select count(*) from public.league_matches m where m.league_id = se.league_id and m.season_year = se.season_year and m.status='finished')
    ) order by se.season_year desc)
    from public.league_seasons se where se.league_id = 1
  ), '[]'::jsonb)) end
$$;
grant execute on function public.league_seasons_summary() to authenticated;

commit;
