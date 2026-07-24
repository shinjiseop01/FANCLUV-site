-- FANCLUV — 0085: K리그 경기 상세(득점/이벤트/교체/카드/팀기록) 저장 + 읽기/관리 RPC.
--
-- 소스(공식, 확인됨): www.kleague.com/api/ddf/match/{matchInfo,matchRecord}.do (form POST)
--   → kleague-match-detail Edge(서버 수집·정규화) → 이 컬럼 → 브라우저는 read RPC 로 DB 만 읽는다(외부 호출 0).
-- 원칙: additive. 경기당 1행(league_matches.external_id 유니크)에 JSONB 로 저장 → 이벤트 중복 불가(전체 교체 upsert,
--   SELECT→INSERT 레이스 없음). 부분 실패 허용(둘 중 하나만 저장). 빈 응답으로 기존 상세 삭제하지 않음(Edge 가 보장).
-- 라인업: 공식 JSON 미제공(HTML 전용) → 저장/표시 안 함(추측 금지). possession 세그먼트/공격방향: 미지원(전부 0/빈값).
begin;

-- ── 상세 컬럼(additive) ──
alter table public.league_matches add column if not exists detail_events    jsonb;  -- {goals,cards,subs,timeline}
alter table public.league_matches add column if not exists detail_stats     jsonb;  -- {home:{...},away:{...}}
alter table public.league_matches add column if not exists detail_status    text;   -- 'ok'|'partial'|'error'
alter table public.league_matches add column if not exists detail_synced_at timestamptz;
alter table public.league_matches add column if not exists detail_error     text;

-- 상세 미수집 finished 경기 조회용(백필/최근 수집 대상 선정) — 부분 인덱스.
create index if not exists league_matches_detail_pending_idx
  on public.league_matches (season_year, kickoff_at desc)
  where status = 'finished' and detail_synced_at is null;

-- ── 읽기 RPC(경기 단건 상세): 코어 + 상세. 브라우저가 이것만 호출(외부 0). 단일행 bounded. ──
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
    'detail', case when m.detail_events is null and m.detail_stats is null then null
      else jsonb_build_object(
        'events', coalesce(m.detail_events, '{}'::jsonb),
        'stats', m.detail_stats,
        'status', m.detail_status,
        'syncedAt', m.detail_synced_at
      ) end
  ) end
  from public.league_matches m
  where m.external_id = p_external_id
  limit 1
$$;
grant execute on function public.league_match_detail(text) to anon, authenticated;

-- ── 관리자 수동 상세 동기화: is_admin 게이트 + rate limit + pg_net → Edge(secret=Vault). ──
--   p_mode: 'recent'(최근 종료·상세 없음, 기본) | 'backfill'(시즌 종료 전체·상세 없음, 배치). Fan/Club 불가.
create or replace function public.admin_league_match_detail_sync(p_mode text default 'recent')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_req bigint; v_mode text := case when p_mode = 'backfill' then 'backfill' else 'recent' end; v_role text;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'NOT_ALLOWED'); end if;
  -- rate limit(중복/과호출 방지): 최근 30초 상세 수동 트리거 있으면 차단.
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

-- ── Source health 확장: 상세 수집 현황(관리자용). 기존 league_sync_health 대체(additive 필드만 추가). ──
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
        'lastSyncedAt', max(detail_synced_at)
      ) from public.league_matches where league_id=1 and season_year=public.league_current_season(1)),
    'sync', (select coalesce(jsonb_agg(jsonb_build_object('resource',resource,'lastSuccessAt',last_success_at,'lastErrorAt',last_error_at,'lastError',last_error,'lastRows',last_rows,'runCount',run_count,'failCount',fail_count) order by resource), '[]'::jsonb) from public.league_sync_state)
  ) end
$$;
grant execute on function public.league_sync_health() to authenticated;

commit;
