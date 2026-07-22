-- FANCLUV — Phase 19: 팬 여론 실시간 통계(0069)
--
-- 목적: 의견/좋아요/댓글/설문/Fan Pulse/Quick Poll 참여를 사전 집계(증분)해 팬·관리자·
-- (향후)구단 대시보드가 원본 전체 scan 없이 빠르게 조회하도록 한다.
--
-- 설계 원칙:
--   • Hot path(insert/delete)에서 무거운 전체집계 금지 → 최소 증분 counter + timeseries upsert.
--   • 정확성: counter drift 대비 rebuild/verify RPC 제공(증분값 vs 원본 비교·복구).
--   • 시간대(§7): 저장은 timestamptz(UTC), bucket 계산은 팀 기준 시간대(_rt_tz, 기본 Asia/Seoul).
--   • 감성/토픽은 기존 ai_insights(주기 AI 산출)를 재사용 — 중복 테이블을 새로 만들지 않는다.
--   • soft-delete: opinions/comments 는 status='visible' 만 집계(관리자 hidden 집계는 별도 확장).
--   • 원본 테이블·실사용 데이터는 파괴적 변경 없음(집계 테이블·트리거만 추가).

-- ─────────────────────────────────────────────────────────────────────
-- 0) 기준 시간대(하드코딩 회피 — 한 곳에서 변경). DST 리그 확장 시 이 함수만 조정.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public._rt_tz()
returns text language sql immutable set search_path = public as $$ select 'Asia/Seoul' $$;

-- bucket 시작(팀 시간대 기준 truncate 후 timestamptz 로 환원). bucket_type: hour|day|week.
create or replace function public._rt_bucket(p_at timestamptz, p_bucket text)
returns timestamptz language sql immutable set search_path = public as $$
  select case
    when p_bucket = 'hour' then (date_trunc('hour', p_at at time zone public._rt_tz()) at time zone public._rt_tz())
    when p_bucket = 'week' then (date_trunc('week', p_at at time zone public._rt_tz()) at time zone public._rt_tz())
    else (date_trunc('day', p_at at time zone public._rt_tz()) at time zone public._rt_tz())
  end
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 1) 팀 사전집계(단일 행/팀). 누적 counter + 평점 합/개수(정확 평균).
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.team_realtime_stats (
  team_id                 text primary key,
  opinions_total          bigint not null default 0,
  likes_total             bigint not null default 0,
  comments_total          bigint not null default 0,
  survey_responses_total  bigint not null default 0,
  pulse_votes_total       bigint not null default 0,
  quick_poll_votes_total  bigint not null default 0,
  rating_sum              bigint not null default 0,
  rating_count            bigint not null default 0,
  updated_at              timestamptz not null default now()
);
alter table public.team_realtime_stats enable row level security;
-- 공개 집계(비식별) → 로그인 사용자 읽기 허용. 쓰기는 트리거/definer RPC(소유자)만.
drop policy if exists rt_stats_read on public.team_realtime_stats;
create policy rt_stats_read on public.team_realtime_stats for select using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────────────
-- 2) 시간대별 timeseries(hour/day). 팀·bucket·metric 유니크 → 증분 upsert.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.team_stats_timeseries (
  id           bigint generated always as identity primary key,
  team_id      text not null,
  bucket_type  text not null check (bucket_type in ('hour','day','week')),
  bucket_start timestamptz not null,
  metric       text not null,
  value        bigint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (team_id, bucket_type, bucket_start, metric)
);
create index if not exists ix_rt_ts_team_metric on public.team_stats_timeseries(team_id, metric, bucket_type, bucket_start desc);
alter table public.team_stats_timeseries enable row level security;
drop policy if exists rt_ts_read on public.team_stats_timeseries;
create policy rt_ts_read on public.team_stats_timeseries for select using (auth.role() = 'authenticated');

-- active_users(24h)·activity feed 를 위한 원본 인덱스(있으면 무시).
create index if not exists ix_activity_team_created on public.activity_events(team_id, created_at desc);
create index if not exists ix_activity_user_team_created on public.activity_events(user_id, team_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────
-- 3) 설정(§22) — 단일 행. allowlist·안전범위는 setter 에서 강제.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.realtime_stats_settings (
  id                    smallint primary key default 1 check (id = 1),
  enabled               boolean not null default true,
  refresh_interval_secs int not null default 30,
  polling_interval_secs int not null default 30,
  cache_ttl_secs        int not null default 30,
  min_aggregation       int not null default 5,   -- 세부 segment 최소 집계 인원
  last_rebuild_at       timestamptz,
  last_success_at       timestamptz,
  last_rebuild_ms       int,
  last_drift_count      int,
  updated_by            uuid,
  updated_at            timestamptz not null default now()
);
insert into public.realtime_stats_settings (id) values (1) on conflict (id) do nothing;
alter table public.realtime_stats_settings enable row level security; -- 정책 없음 → definer RPC 만.

-- ─────────────────────────────────────────────────────────────────────
-- 4) 증분 코어 — counter 열 갱신 + timeseries hour/day upsert. 음수 방지(greatest 0).
--    metric 은 내부 상수만 전달(사용자 입력 아님).
-- ─────────────────────────────────────────────────────────────────────
create or replace function public._rt_bump(p_team text, p_metric text, p_delta int, p_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_team is null or p_delta = 0 then return; end if;
  insert into public.team_realtime_stats(team_id) values (p_team) on conflict (team_id) do nothing;
  update public.team_realtime_stats set
    opinions_total          = greatest(0, opinions_total          + case when p_metric='opinions'         then p_delta else 0 end),
    likes_total             = greatest(0, likes_total             + case when p_metric='likes'            then p_delta else 0 end),
    comments_total          = greatest(0, comments_total          + case when p_metric='comments'         then p_delta else 0 end),
    survey_responses_total  = greatest(0, survey_responses_total  + case when p_metric='survey_responses' then p_delta else 0 end),
    pulse_votes_total       = greatest(0, pulse_votes_total       + case when p_metric='pulse_votes'      then p_delta else 0 end),
    quick_poll_votes_total  = greatest(0, quick_poll_votes_total  + case when p_metric='quick_poll_votes' then p_delta else 0 end),
    updated_at = now()
  where team_id = p_team;

  insert into public.team_stats_timeseries(team_id, bucket_type, bucket_start, metric, value)
    values (p_team, 'hour', public._rt_bucket(p_at,'hour'), p_metric, greatest(0, p_delta))
    on conflict (team_id, bucket_type, bucket_start, metric)
    do update set value = greatest(0, public.team_stats_timeseries.value + p_delta), updated_at = now();
  insert into public.team_stats_timeseries(team_id, bucket_type, bucket_start, metric, value)
    values (p_team, 'day', public._rt_bucket(p_at,'day'), p_metric, greatest(0, p_delta))
    on conflict (team_id, bucket_type, bucket_start, metric)
    do update set value = greatest(0, public.team_stats_timeseries.value + p_delta), updated_at = now();
end $$;

-- 평점 합/개수 증분(opinions 전용).
create or replace function public._rt_bump_rating(p_team text, p_rating_delta int, p_count_delta int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_team is null or (p_rating_delta = 0 and p_count_delta = 0) then return; end if;
  insert into public.team_realtime_stats(team_id) values (p_team) on conflict (team_id) do nothing;
  update public.team_realtime_stats
     set rating_sum = greatest(0, rating_sum + p_rating_delta),
         rating_count = greatest(0, rating_count + p_count_delta), updated_at = now()
   where team_id = p_team;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 5) 트리거 함수 — 각 원본 테이블의 insert/update/delete 를 증분에 반영.
-- ─────────────────────────────────────────────────────────────────────
-- opinions: status='visible' 만 집계. 상태전이(visible↔hidden)·평점 변경 반영.
create or replace function public._rt_trg_opinions()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_old boolean; v_new boolean;
begin
  v_old := (TG_OP <> 'INSERT') and coalesce(OLD.status,'') = 'visible';
  v_new := (TG_OP <> 'DELETE') and coalesce(NEW.status,'') = 'visible';
  if v_new and not v_old then
    perform public._rt_bump(NEW.team_id, 'opinions', 1, coalesce(NEW.created_at, now()));
    if NEW.rating is not null then perform public._rt_bump_rating(NEW.team_id, NEW.rating, 1); end if;
  elsif v_old and not v_new then
    perform public._rt_bump(OLD.team_id, 'opinions', -1, coalesce(OLD.created_at, now()));
    if OLD.rating is not null then perform public._rt_bump_rating(OLD.team_id, -OLD.rating, -1); end if;
  elsif v_old and v_new and TG_OP='UPDATE' and coalesce(OLD.rating,-1) <> coalesce(NEW.rating,-1) then
    -- 평점만 변경: 차이만 반영
    perform public._rt_bump_rating(NEW.team_id,
      coalesce(NEW.rating,0) - coalesce(OLD.rating,0),
      (case when NEW.rating is not null then 1 else 0 end) - (case when OLD.rating is not null then 1 else 0 end));
  end if;
  return null;
end $$;

-- comments: status='visible' 만. 소속 팀은 opinions 를 통해 조회.
create or replace function public._rt_trg_comments()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_team text; v_old boolean; v_new boolean;
begin
  select o.team_id into v_team from public.opinions o
    where o.id = coalesce(NEW.opinion_id, OLD.opinion_id);
  v_old := (TG_OP <> 'INSERT') and coalesce(OLD.status,'') = 'visible';
  v_new := (TG_OP <> 'DELETE') and coalesce(NEW.status,'') = 'visible';
  if v_new and not v_old then perform public._rt_bump(v_team, 'comments', 1, coalesce(NEW.created_at, now()));
  elsif v_old and not v_new then perform public._rt_bump(v_team, 'comments', -1, coalesce(OLD.created_at, now()));
  end if;
  return null;
end $$;

-- likes: insert/delete(좋아요/취소). 팀은 opinion 을 통해.
create or replace function public._rt_trg_likes()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_team text;
begin
  select o.team_id into v_team from public.opinions o where o.id = coalesce(NEW.opinion_id, OLD.opinion_id);
  if TG_OP='INSERT' then perform public._rt_bump(v_team, 'likes', 1, coalesce(NEW.created_at, now()));
  elsif TG_OP='DELETE' then perform public._rt_bump(v_team, 'likes', -1, coalesce(OLD.created_at, now()));
  end if;
  return null;
end $$;

-- survey_responses: team_id 직접.
create or replace function public._rt_trg_survey()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP='INSERT' then perform public._rt_bump(NEW.team_id, 'survey_responses', 1, coalesce(NEW.created_at, now()));
  elsif TG_OP='DELETE' then perform public._rt_bump(OLD.team_id, 'survey_responses', -1, coalesce(OLD.created_at, now()));
  end if;
  return null;
end $$;

-- pulse_votes: topic → pulse_topics.team_id.
create or replace function public._rt_trg_pulse()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_team text;
begin
  select t.team_id into v_team from public.pulse_topics t where t.id = coalesce(NEW.topic_id, OLD.topic_id);
  if TG_OP='INSERT' then perform public._rt_bump(v_team, 'pulse_votes', 1, coalesce(NEW.created_at, now()));
  elsif TG_OP='DELETE' then perform public._rt_bump(v_team, 'pulse_votes', -1, coalesce(OLD.created_at, now()));
  end if;
  return null;
end $$;

-- quick_poll_votes: poll → quick_polls.team_id.
create or replace function public._rt_trg_qp()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_team text;
begin
  select p.team_id into v_team from public.quick_polls p where p.id = coalesce(NEW.poll_id, OLD.poll_id);
  if TG_OP='INSERT' then perform public._rt_bump(v_team, 'quick_poll_votes', 1, coalesce(NEW.created_at, now()));
  elsif TG_OP='DELETE' then perform public._rt_bump(v_team, 'quick_poll_votes', -1, coalesce(OLD.created_at, now()));
  end if;
  return null;
end $$;

drop trigger if exists trg_rt_opinions on public.opinions;
create trigger trg_rt_opinions after insert or update or delete on public.opinions
  for each row execute function public._rt_trg_opinions();
drop trigger if exists trg_rt_comments on public.comments;
create trigger trg_rt_comments after insert or update or delete on public.comments
  for each row execute function public._rt_trg_comments();
drop trigger if exists trg_rt_likes on public.likes;
create trigger trg_rt_likes after insert or delete on public.likes
  for each row execute function public._rt_trg_likes();
drop trigger if exists trg_rt_survey on public.survey_responses;
create trigger trg_rt_survey after insert or delete on public.survey_responses
  for each row execute function public._rt_trg_survey();
drop trigger if exists trg_rt_pulse on public.pulse_votes;
create trigger trg_rt_pulse after insert or delete on public.pulse_votes
  for each row execute function public._rt_trg_pulse();
drop trigger if exists trg_rt_qp on public.quick_poll_votes;
create trigger trg_rt_qp after insert or delete on public.quick_poll_votes
  for each row execute function public._rt_trg_qp();

comment on table public.team_realtime_stats is 'Phase19 팀 사전집계 counter(증분). rebuild/verify 로 원본과 정합.';
comment on table public.team_stats_timeseries is 'Phase19 팀 시간대별 통계(hour/day, Asia/Seoul bucket).';
comment on table public.realtime_stats_settings is 'Phase19 실시간 통계 설정(enabled/interval/TTL/min_aggregation) + 관측 타임스탬프.';

-- ─────────────────────────────────────────────────────────────────────
-- 6) 권한 헬퍼 — 관리자 전체 / 구단(club)은 소속 팀만(§11, 향후 호환).
-- ─────────────────────────────────────────────────────────────────────
create or replace function public._rt_can_admin_team(p_team text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.profiles
     where id = auth.uid() and selected_team = p_team
       and role::text in ('club','club_admin'));
$$;

create or replace function public.realtime_stats_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from public.realtime_stats_settings where id = 1), true);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 7) 팬 공개 실시간 통계(§9) — 비식별 집계만. today/24h/avg/감성(min_aggregation).
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.get_team_realtime_stats(p_team_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb; r public.team_realtime_stats%rowtype;
  v_min int; v_active int; v_ins ai_insights%rowtype; v_senti_total int;
  v_today jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'code', 'unauthorized'); end if;
  select min_aggregation into v_min from public.realtime_stats_settings where id = 1;
  select * into r from public.team_realtime_stats where team_id = p_team_id;

  -- 오늘(팀 시간대 day bucket) 집계 — timeseries 1행 조회(원본 scan 없음).
  select coalesce(jsonb_object_agg(metric, value), '{}'::jsonb) into v_today
    from public.team_stats_timeseries
   where team_id = p_team_id and bucket_type = 'day' and bucket_start = public._rt_bucket(now(),'day');

  -- 활성 사용자(24h) — 고유 user_id count 만 공개(식별자 비노출).
  select count(distinct user_id) into v_active from public.activity_events
   where team_id = p_team_id and created_at > now() - interval '24 hours';

  -- 감성 — 기존 ai_insights 최신 산출 재사용. 표본 < min_aggregation 이면 숨김.
  select * into v_ins from public.ai_insights where club_id = p_team_id order by created_at desc limit 1;
  v_senti_total := coalesce(v_ins.sentiment_positive,0) + coalesce(v_ins.sentiment_neutral,0) + coalesce(v_ins.sentiment_negative,0);

  v := jsonb_build_object(
    'ok', true,
    'team_id', p_team_id,
    'opinions_total', coalesce(r.opinions_total, 0),
    'likes_total', coalesce(r.likes_total, 0),
    'comments_total', coalesce(r.comments_total, 0),
    'survey_responses_total', coalesce(r.survey_responses_total, 0),
    'pulse_votes_total', coalesce(r.pulse_votes_total, 0),
    'quick_poll_votes_total', coalesce(r.quick_poll_votes_total, 0),
    'average_rating', case when coalesce(r.rating_count,0) > 0
                           then round(r.rating_sum::numeric / r.rating_count, 2) else null end,
    'rating_count', coalesce(r.rating_count, 0),
    'active_users_24h', coalesce(v_active, 0),
    'opinions_today', coalesce((v_today->>'opinions')::bigint, 0),
    'likes_today', coalesce((v_today->>'likes')::bigint, 0),
    'comments_today', coalesce((v_today->>'comments')::bigint, 0),
    'sentiment', case when v_senti_total >= coalesce(v_min,5)
      then jsonb_build_object('positive', v_ins.sentiment_positive, 'neutral', v_ins.sentiment_neutral,
                              'negative', v_ins.sentiment_negative, 'total', v_senti_total, 'period', v_ins.period)
      else jsonb_build_object('suppressed', true, 'min', coalesce(v_min,5)) end,
    'updated_at', r.updated_at,
    'has_data', (r.team_id is not null)
  );
  return v;
end $$;

-- 구단(club)·관리자용 확장 통계 — 부정 비중 등 민감 지표 포함(권한 검증).
create or replace function public.get_club_team_stats(p_team_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_ins ai_insights%rowtype; v_total int; v_neg_ratio numeric;
begin
  if not public._rt_can_admin_team(p_team_id) then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  v := public.get_team_realtime_stats(p_team_id);
  select * into v_ins from public.ai_insights where club_id = p_team_id order by created_at desc limit 1;
  v_total := coalesce(v_ins.sentiment_positive,0)+coalesce(v_ins.sentiment_neutral,0)+coalesce(v_ins.sentiment_negative,0);
  v_neg_ratio := case when v_total > 0 then round(coalesce(v_ins.sentiment_negative,0)::numeric / v_total, 3) else null end;
  return v || jsonb_build_object('negative_ratio', v_neg_ratio, 'scope', 'club');
end $$;

-- timeseries 조회 — metric/bucket allowlist, 기간·최대행 제한, 안전 정렬(§8,18).
create or replace function public.get_team_stats_timeseries(
  p_team_id text, p_metric text, p_bucket text default 'day',
  p_from timestamptz default null, p_to timestamptz default null, p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_lim int; v_from timestamptz;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'code', 'unauthorized'); end if;
  if p_metric not in ('opinions','likes','comments','survey_responses','pulse_votes','quick_poll_votes')
    then return jsonb_build_object('ok', false, 'code', 'bad_metric'); end if;
  if p_bucket not in ('hour','day','week') then return jsonb_build_object('ok', false, 'code', 'bad_bucket'); end if;
  v_lim := least(greatest(coalesce(p_limit,100), 1), 500);
  v_from := coalesce(p_from, now() - interval '30 days');
  select jsonb_build_object('ok', true, 'metric', p_metric, 'bucket', p_bucket,
    'points', coalesce(jsonb_agg(jsonb_build_object('t', bucket_start, 'v', value) order by bucket_start), '[]'::jsonb))
    into v
  from (
    select bucket_start, value from public.team_stats_timeseries
     where team_id = p_team_id and metric = p_metric and bucket_type = p_bucket
       and bucket_start >= v_from and (p_to is null or bucket_start <= p_to)
     order by bucket_start desc limit v_lim
  ) s;
  return v;
end $$;

-- 활동 피드 — 비식별(사용자 식별자 미노출), 커서 pagination(§9,19).
create or replace function public.get_team_activity_feed(
  p_team_id text, p_limit int default 20, p_before timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_lim int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'code', 'unauthorized'); end if;
  v_lim := least(greatest(coalesce(p_limit,20), 1), 50);
  select jsonb_build_object('ok', true,
    'items', coalesce(jsonb_agg(jsonb_build_object('type', type, 'entity_type', entity_type,
       'title', title, 'created_at', created_at) order by created_at desc), '[]'::jsonb))
    into v
  from (
    select type, entity_type, title, created_at from public.activity_events
     where team_id = p_team_id and (p_before is null or created_at < p_before)
     order by created_at desc limit v_lim
  ) s;
  return v;
end $$;

-- 관리자 실시간 대시보드(§10) — is_admin 전용. 단일 RPC(팀별 개별 RPC 반복 금지).
create or replace function public.get_admin_realtime_dashboard(p_days int default 7)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_day timestamptz := public._rt_bucket(now(),'day'); v_days int;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  v_days := least(greatest(coalesce(p_days,7), 1), 90);
  select jsonb_build_object(
    'ok', true,
    'summary', jsonb_build_object(
      'new_opinions_today', coalesce((select sum(value) from public.team_stats_timeseries where bucket_type='day' and bucket_start=v_day and metric='opinions'),0),
      'new_members_today', (select count(*) from public.profiles where created_at >= v_day),
      'likes_today', coalesce((select sum(value) from public.team_stats_timeseries where bucket_type='day' and bucket_start=v_day and metric='likes'),0),
      'comments_today', coalesce((select sum(value) from public.team_stats_timeseries where bucket_type='day' and bucket_start=v_day and metric='comments'),0),
      'survey_responses_today', coalesce((select sum(value) from public.team_stats_timeseries where bucket_type='day' and bucket_start=v_day and metric='survey_responses'),0),
      'pulse_votes_today', coalesce((select sum(value) from public.team_stats_timeseries where bucket_type='day' and bucket_start=v_day and metric='pulse_votes'),0),
      'quick_poll_votes_today', coalesce((select sum(value) from public.team_stats_timeseries where bucket_type='day' and bucket_start=v_day and metric='quick_poll_votes'),0),
      'active_users_24h', (select count(distinct user_id) from public.activity_events where created_at > now()-interval '24 hours')
    ),
    'teams', coalesce((select jsonb_agg(jsonb_build_object(
        'team_id', team_id, 'opinions', opinions_total, 'likes', likes_total, 'comments', comments_total,
        'pulse_votes', pulse_votes_total, 'quick_poll_votes', quick_poll_votes_total,
        'average_rating', case when rating_count>0 then round(rating_sum::numeric/rating_count,2) else null end)
        order by opinions_total desc) from public.team_realtime_stats), '[]'::jsonb),
    'recent_activity', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('type', type, 'entity_type', entity_type, 'team_id', team_id,
          'title', title, 'created_at', created_at) x
        from public.activity_events order by created_at desc limit 20) a), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 8) rebuild / refresh / verify — drift 교정(§5,14). 관리자/구단 + audit.
-- ─────────────────────────────────────────────────────────────────────
-- 한 팀의 counter 를 원본(visible)에서 재계산.
create or replace function public.rebuild_team_realtime_stats(p_team_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_op bigint; v_li bigint; v_co bigint; v_sr bigint; v_pv bigint; v_qp bigint; v_rs bigint; v_rc bigint; v_t0 timestamptz := clock_timestamp();
begin
  if not public._rt_can_admin_team(p_team_id) then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select count(*), coalesce(sum(rating),0), count(rating) into v_op, v_rs, v_rc
    from public.opinions where team_id=p_team_id and status='visible';
  -- likes/comments 는 트리거 정의와 동일하게 팀 귀속(opinion.team_id)만으로 집계한다
  -- (opinion 상태와 무관 — 트리거==rebuild==verify 정합 보장). comment 자체 status='visible' 만.
  select count(*) into v_li from public.likes l join public.opinions o on o.id=l.opinion_id where o.team_id=p_team_id;
  select count(*) into v_co from public.comments c join public.opinions o on o.id=c.opinion_id where o.team_id=p_team_id and c.status='visible';
  select count(*) into v_sr from public.survey_responses where team_id=p_team_id;
  select count(*) into v_pv from public.pulse_votes pv join public.pulse_topics t on t.id=pv.topic_id where t.team_id=p_team_id;
  select count(*) into v_qp from public.quick_poll_votes qv join public.quick_polls p on p.id=qv.poll_id where p.team_id=p_team_id;
  insert into public.team_realtime_stats(team_id, opinions_total, likes_total, comments_total,
      survey_responses_total, pulse_votes_total, quick_poll_votes_total, rating_sum, rating_count, updated_at)
    values (p_team_id, v_op, v_li, v_co, v_sr, v_pv, v_qp, v_rs, v_rc, now())
    on conflict (team_id) do update set opinions_total=excluded.opinions_total, likes_total=excluded.likes_total,
      comments_total=excluded.comments_total, survey_responses_total=excluded.survey_responses_total,
      pulse_votes_total=excluded.pulse_votes_total, quick_poll_votes_total=excluded.quick_poll_votes_total,
      rating_sum=excluded.rating_sum, rating_count=excluded.rating_count, updated_at=now();
  update public.realtime_stats_settings set last_rebuild_at=now(), last_success_at=now(),
     last_rebuild_ms=extract(milliseconds from clock_timestamp()-v_t0)::int where id=1;
  perform public._rt_audit(auth.uid(), 'realtime_stats.rebuild', jsonb_build_object('team', p_team_id));
  return jsonb_build_object('ok', true, 'team_id', p_team_id, 'opinions', v_op, 'likes', v_li, 'comments', v_co);
end $$;

-- refresh = counter 강제 재계산(§22 수동 refresh). rebuild 위임 + 별도 audit.
create or replace function public.refresh_team_realtime_stats(p_team_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public._rt_can_admin_team(p_team_id) then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  v := public.rebuild_team_realtime_stats(p_team_id);
  perform public._rt_audit(auth.uid(), 'realtime_stats.refresh', jsonb_build_object('team', p_team_id));
  return v;
end $$;

-- timeseries 범위 재계산(원본에서). 관리자 전용.
create or replace function public.rebuild_team_stats_range(p_team_id text, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  if p_from is null or p_to is null or p_to <= p_from then return jsonb_build_object('ok', false, 'code', 'bad_range'); end if;
  delete from public.team_stats_timeseries where team_id=p_team_id and bucket_start >= p_from and bucket_start <= p_to;
  -- opinions(visible) day/hour 재적재
  insert into public.team_stats_timeseries(team_id,bucket_type,bucket_start,metric,value)
  select p_team_id, b.bt, public._rt_bucket(o.created_at, b.bt), 'opinions', count(*)
    from public.opinions o cross join (values ('hour'),('day')) b(bt)
   where o.team_id=p_team_id and o.status='visible' and o.created_at>=p_from and o.created_at<=p_to
   group by b.bt, public._rt_bucket(o.created_at, b.bt)
  on conflict (team_id,bucket_type,bucket_start,metric) do update set value=excluded.value, updated_at=now();
  get diagnostics v_n = row_count;
  perform public._rt_audit(auth.uid(), 'realtime_stats.rebuild_range', jsonb_build_object('team', p_team_id, 'rows', v_n));
  return jsonb_build_object('ok', true, 'team_id', p_team_id, 'rows', v_n);
end $$;

-- 정합성 검증 — 저장 counter vs 원본 재계산 비교(변경 없음). drift 반환(§14).
create or replace function public.verify_team_stats_consistency(p_team_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.team_realtime_stats%rowtype; e_op bigint; e_li bigint; e_co bigint; e_sr bigint; e_pv bigint; e_qp bigint; e_rs bigint; e_rc bigint; v_drift jsonb := '[]'::jsonb;
begin
  if not public._rt_can_admin_team(p_team_id) then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select * into r from public.team_realtime_stats where team_id=p_team_id;
  select count(*), coalesce(sum(rating),0), count(rating) into e_op, e_rs, e_rc from public.opinions where team_id=p_team_id and status='visible';
  select count(*) into e_li from public.likes l join public.opinions o on o.id=l.opinion_id where o.team_id=p_team_id;
  select count(*) into e_co from public.comments c join public.opinions o on o.id=c.opinion_id where o.team_id=p_team_id and c.status='visible';
  select count(*) into e_sr from public.survey_responses where team_id=p_team_id;
  select count(*) into e_pv from public.pulse_votes pv join public.pulse_topics t on t.id=pv.topic_id where t.team_id=p_team_id;
  select count(*) into e_qp from public.quick_poll_votes qv join public.quick_polls p on p.id=qv.poll_id where p.team_id=p_team_id;
  if coalesce(r.opinions_total,0) <> e_op then v_drift := v_drift || jsonb_build_object('metric','opinions','stored',coalesce(r.opinions_total,0),'expected',e_op); end if;
  if coalesce(r.likes_total,0) <> e_li then v_drift := v_drift || jsonb_build_object('metric','likes','stored',coalesce(r.likes_total,0),'expected',e_li); end if;
  if coalesce(r.comments_total,0) <> e_co then v_drift := v_drift || jsonb_build_object('metric','comments','stored',coalesce(r.comments_total,0),'expected',e_co); end if;
  if coalesce(r.survey_responses_total,0) <> e_sr then v_drift := v_drift || jsonb_build_object('metric','survey_responses','stored',coalesce(r.survey_responses_total,0),'expected',e_sr); end if;
  if coalesce(r.pulse_votes_total,0) <> e_pv then v_drift := v_drift || jsonb_build_object('metric','pulse_votes','stored',coalesce(r.pulse_votes_total,0),'expected',e_pv); end if;
  if coalesce(r.quick_poll_votes_total,0) <> e_qp then v_drift := v_drift || jsonb_build_object('metric','quick_poll_votes','stored',coalesce(r.quick_poll_votes_total,0),'expected',e_qp); end if;
  if coalesce(r.rating_sum,0) <> e_rs or coalesce(r.rating_count,0) <> e_rc then v_drift := v_drift || jsonb_build_object('metric','rating','stored_sum',coalesce(r.rating_sum,0),'expected_sum',e_rs,'stored_count',coalesce(r.rating_count,0),'expected_count',e_rc); end if;
  return jsonb_build_object('ok', true, 'team_id', p_team_id, 'consistent', (jsonb_array_length(v_drift)=0), 'drift', v_drift);
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 9) 설정 조회/변경(§22) — allowlist·안전범위. audit.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public._rt_audit(p_actor uuid, p_action text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if p_actor is null then return; end if;
  select role into r from public.profiles where id = p_actor;
  insert into public.audit_logs(actor_id, actor_role, action, target_type, target_id, detail)
  values (p_actor, r, p_action, 'realtime_stats', '1', coalesce(p_detail,'{}'::jsonb));
end $$;

create or replace function public.get_realtime_stats_settings()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select jsonb_build_object('ok', true, 'enabled', enabled, 'refresh_interval_secs', refresh_interval_secs,
    'polling_interval_secs', polling_interval_secs, 'cache_ttl_secs', cache_ttl_secs, 'min_aggregation', min_aggregation,
    'last_rebuild_at', last_rebuild_at, 'last_success_at', last_success_at, 'last_rebuild_ms', last_rebuild_ms,
    'last_drift_count', last_drift_count) into v from public.realtime_stats_settings where id=1;
  return v;
end $$;

create or replace function public.set_realtime_stats_settings(
  p_enabled boolean default null, p_refresh int default null, p_polling int default null,
  p_cache_ttl int default null, p_min_agg int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  -- 안전범위: polling/refresh >= 10초(1초 polling 금지), TTL >= 0, min_agg 1..100.
  update public.realtime_stats_settings set
    enabled               = coalesce(p_enabled, enabled),
    refresh_interval_secs = coalesce(least(greatest(p_refresh, 10), 3600), refresh_interval_secs),
    polling_interval_secs = coalesce(least(greatest(p_polling, 10), 3600), polling_interval_secs),
    cache_ttl_secs        = coalesce(least(greatest(p_cache_ttl, 0), 3600), cache_ttl_secs),
    min_aggregation       = coalesce(least(greatest(p_min_agg, 1), 100), min_aggregation),
    updated_by = v_uid, updated_at = now()
  where id = 1;
  perform public._rt_audit(v_uid, 'realtime_stats.settings', jsonb_build_object(
    'enabled', p_enabled, 'refresh', p_refresh, 'polling', p_polling, 'cache_ttl', p_cache_ttl, 'min_agg', p_min_agg));
  return public.get_realtime_stats_settings();
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- 10) 권한 — public revoke 후 필요한 role 만 grant.
-- ─────────────────────────────────────────────────────────────────────
revoke all on function public._rt_tz() from public;
revoke all on function public._rt_bucket(timestamptz,text) from public;
revoke all on function public._rt_bump(text,text,int,timestamptz) from public;
revoke all on function public._rt_bump_rating(text,int,int) from public;
revoke all on function public._rt_audit(uuid,text,jsonb) from public;
revoke all on function public._rt_can_admin_team(text) from public;
revoke all on function public.realtime_stats_enabled() from public;
revoke all on function public.get_team_realtime_stats(text) from public;
revoke all on function public.get_club_team_stats(text) from public;
revoke all on function public.get_team_stats_timeseries(text,text,text,timestamptz,timestamptz,int) from public;
revoke all on function public.get_team_activity_feed(text,int,timestamptz) from public;
revoke all on function public.get_admin_realtime_dashboard(int) from public;
revoke all on function public.rebuild_team_realtime_stats(text) from public;
revoke all on function public.refresh_team_realtime_stats(text) from public;
revoke all on function public.rebuild_team_stats_range(text,timestamptz,timestamptz) from public;
revoke all on function public.verify_team_stats_consistency(text) from public;
revoke all on function public.get_realtime_stats_settings() from public;
revoke all on function public.set_realtime_stats_settings(boolean,int,int,int,int) from public;

grant execute on function public.realtime_stats_enabled() to authenticated, service_role;
grant execute on function public.get_team_realtime_stats(text) to authenticated, service_role;
grant execute on function public.get_club_team_stats(text) to authenticated, service_role;
grant execute on function public.get_team_stats_timeseries(text,text,text,timestamptz,timestamptz,int) to authenticated, service_role;
grant execute on function public.get_team_activity_feed(text,int,timestamptz) to authenticated, service_role;
grant execute on function public.get_admin_realtime_dashboard(int) to authenticated, service_role;
grant execute on function public.rebuild_team_realtime_stats(text) to authenticated, service_role;
grant execute on function public.refresh_team_realtime_stats(text) to authenticated, service_role;
grant execute on function public.rebuild_team_stats_range(text,timestamptz,timestamptz) to authenticated, service_role;
grant execute on function public.verify_team_stats_consistency(text) to authenticated, service_role;
grant execute on function public.get_realtime_stats_settings() to authenticated, service_role;
grant execute on function public.set_realtime_stats_settings(boolean,int,int,int,int) to authenticated, service_role;
