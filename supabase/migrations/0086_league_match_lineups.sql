-- FANCLUV — 0086: K리그 공식 경기 라인업(선발 XI + 교체명단) 저장 + 읽기 RPC 확장.
--
-- 소스(공식): www.kleague.com/match.do HTML(공식 JSON 미제공 — 선발/교체 구분은 HTML 만 신뢰 가능, §5/§6).
--   kleague-match-detail Edge 가 파싱→정규화(선발11/교체/주장, 홈·원정 팀코드 대조)→이 컬럼.
--   실측 12경기 검증: 선발 11/11, 교차오염 0, 중복 0. Raw HTML 은 저장하지 않는다(정규화 결과만, §9).
-- 원칙: additive. 라인업 실패는 기존 상세(events/stats)와 독립(§14). 빈/불량 응답으로 정상 라인업 덮어쓰지 않음(§15).
--   종료 경기 라인업은 immutable — detail_lineup_synced_at 있으면 재수집 안 함(§11/§18).
begin;

alter table public.league_matches add column if not exists detail_lineups      jsonb;  -- {home:{starters,substitutes},away:{...}}
alter table public.league_matches add column if not exists detail_lineup_status text;   -- 'ok'|'error'
alter table public.league_matches add column if not exists detail_lineup_synced_at timestamptz;
alter table public.league_matches add column if not exists detail_lineup_error  text;

-- 라인업 미수집 finished 조회용(백필/최근 대상 선정).
create index if not exists league_matches_lineup_pending_idx
  on public.league_matches (season_year, kickoff_at desc)
  where status = 'finished' and detail_lineup_synced_at is null;

-- ── 읽기 RPC 확장: detail 에 lineups 포함(브라우저는 이것만 호출, 외부 0). ──
create or replace function public.league_match_detail(p_external_id text)
returns jsonb language sql stable set search_path=public as $$
  select case when m.external_id is null then null else jsonb_build_object(
    'externalId', m.external_id, 'leagueId', m.league_id, 'seasonYear', m.season_year,
    'round', m.round, 'kickoffAt', m.kickoff_at, 'gameDate', m.game_date, 'gameTime', m.game_time,
    'homeClubId', m.home_club_id, 'awayClubId', m.away_club_id,
    'homeCode', m.home_code, 'awayCode', m.away_code,
    'homeTeamName', m.home_team_name, 'awayTeamName', m.away_team_name,
    'homeScore', m.home_score, 'awayScore', m.away_score,
    'status', m.status, 'stadium', m.stadium,
    'detail', case when m.detail_events is null and m.detail_stats is null and m.detail_lineups is null then null
      else jsonb_build_object(
        'events', coalesce(m.detail_events, '{}'::jsonb),
        'stats', m.detail_stats,
        'lineups', m.detail_lineups,
        'status', m.detail_status,
        'syncedAt', m.detail_synced_at
      ) end
  ) end
  from public.league_matches m
  where m.external_id = p_external_id
  limit 1
$$;
grant execute on function public.league_match_detail(text) to anon, authenticated;

-- ── 관리자 라인업 수동 동기화: 기존 상세 동기화(admin_league_match_detail_sync)에 lineup 모드 통합. ──
--   p_mode: 'recent'|'backfill'(상세=events/stats) | 'lineup_recent'|'lineup_backfill'(라인업). Fan/Club 불가.
create or replace function public.admin_league_match_detail_sync(p_mode text default 'recent')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_req bigint; v_mode text; v_role text; v_ep text;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'NOT_ALLOWED'); end if;
  v_mode := case
    when p_mode = 'backfill' then 'backfill'
    when p_mode = 'lineup_recent' then 'lineup_recent'
    when p_mode = 'lineup_backfill' then 'lineup_backfill'
    else 'recent' end;
  if exists (select 1 from public.league_sync_state where resource = 'detail_manual_trigger' and updated_at > now() - interval '30 seconds') then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  end if;
  insert into public.league_sync_state(resource, updated_at) values ('detail_manual_trigger', now())
    on conflict (resource) do update set updated_at = now();
  select net.http_post(
    url := 'https://cuuzbddxnzhhlrqmmebz.supabase.co/functions/v1/kleague-match-detail',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-league-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'league_sync_secret')),
    body := jsonb_build_object('mode', v_mode),
    timeout_milliseconds := 150000
  ) into v_req;
  select role::text into v_role from public.profiles where id = auth.uid();
  insert into public.audit_logs(actor_id, actor_role, action, target_type, target_id, detail)
    values (auth.uid(), v_role, 'league.match_detail_sync', 'league', v_mode, jsonb_build_object('mode', v_mode, 'requestId', v_req));
  return jsonb_build_object('ok', true, 'mode', v_mode, 'requestId', v_req);
end $$;
grant execute on function public.admin_league_match_detail_sync(text) to authenticated;

-- ── Source health: 라인업 수집 현황 추가. ──
create or replace function public.league_sync_health()
returns jsonb language sql stable security definer set search_path=public as $$
  select case when not public.is_admin() then jsonb_build_object('ok', false, 'code','NOT_ALLOWED')
  else jsonb_build_object('ok', true,
    'season', (select public.league_current_season(1)),
    'standingsTeams', (select count(*) from public.league_standings s join public.league_seasons se on se.id=s.season_id where se.league_id=1 and se.season_year=public.league_current_season(1)),
    'matches', (select count(*) from public.league_matches where league_id=1 and season_year=public.league_current_season(1)),
    'detail', (select jsonb_build_object(
        'finished', count(*) filter (where status='finished'),
        'collected', count(*) filter (where status='finished' and detail_synced_at is not null),
        'pending', count(*) filter (where status='finished' and detail_synced_at is null),
        'failed', count(*) filter (where detail_status='error'),
        'lineupCollected', count(*) filter (where status='finished' and detail_lineups is not null),
        'lineupPending', count(*) filter (where status='finished' and detail_lineup_synced_at is null),
        'lineupFailed', count(*) filter (where detail_lineup_status='error'),
        'lastSyncedAt', max(detail_synced_at),
        'lineupLastSyncedAt', max(detail_lineup_synced_at)
      ) from public.league_matches where league_id=1 and season_year=public.league_current_season(1)),
    'sync', (select coalesce(jsonb_agg(jsonb_build_object('resource',resource,'lastSuccessAt',last_success_at,'lastErrorAt',last_error_at,'lastError',last_error,'lastRows',last_rows,'runCount',run_count,'failCount',fail_count) order by resource), '[]'::jsonb) from public.league_sync_state)
  ) end
$$;
grant execute on function public.league_sync_health() to authenticated;

commit;
