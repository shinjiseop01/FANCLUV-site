-- ============================================================================
-- FANCLUV — 0062_fan_pulse.sql   (Phase 15 — Fan Pulse: 실시간 의견 흐름 집계)
--
-- 팬 여론을 게시글이 아닌 "의견 흐름(Pulse)"으로 집계한다.
--   • pulse_topics : 관리자 생성 투표 주제(질문 + 선택지 2~6 + 팀 + 기간 + 공개여부)
--   • pulse_votes  : 1인 1표(DI 기준 UNIQUE, 변경 불가), 본인인증 사용자만
--   • pulse_daily_stats : 일별 롤업(시계열/이력, hot-row 회피)
--   • pulse_trending    : 실시간 트렌딩 뷰(active+public, 24h 속도)
--
-- 동시성/성능 원칙
--   • 공유 카운터 행 없음 → 투표는 pulse_votes 개별 insert(hot row 없음).
--   • 1인 1표: UNIQUE(topic_id, di_hash) + ON CONFLICT DO NOTHING = CAS 중복차단.
--   • 집계는 (topic_id, option_id) 인덱스 GROUP BY 또는 일별 롤업.
--   • 개별 투표는 비공개(RLS: 본인만) — 집계는 SECURITY DEFINER RPC 로만 노출.
--   • 상태: active / closed / archived (compare-and-set 전이).
--   • RLS: 팬은 active+public 주제만, 관리자는 전체.
-- ============================================================================

-- ── (1) pulse_topics ────────────────────────────────────────────────────────
create table if not exists public.pulse_topics (
  id          uuid primary key default gen_random_uuid(),
  question    text not null,
  options     jsonb not null,                          -- [{ "id": "a", "label": "..." }, ...] 2~6
  team_id     text,                                    -- null = 전체
  status      text not null default 'active' check (status in ('active','closed','archived')),
  visibility  text not null default 'public' check (visibility in ('public','private')),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint pulse_options_count check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6)
);
create index if not exists pulse_topics_status_idx on public.pulse_topics (status, created_at desc);
create index if not exists pulse_topics_team_idx   on public.pulse_topics (team_id, status, created_at desc);
create index if not exists pulse_topics_active_idx on public.pulse_topics (created_at desc) where status = 'active' and visibility = 'public';

-- ── (2) pulse_votes (1인1표 = DI 기준 UNIQUE) ───────────────────────────────
create table if not exists public.pulse_votes (
  id         uuid primary key default gen_random_uuid(),
  topic_id   uuid not null references public.pulse_topics (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  option_id  text not null,
  di_hash    text not null,                            -- 본인인증 DI 해시(중복투표 차단 기준)
  created_at timestamptz not null default now()
);
-- 1인 1표: 주제당 DI 하나(변경불가 — ON CONFLICT DO NOTHING).
create unique index if not exists pulse_votes_di_uk    on public.pulse_votes (topic_id, di_hash);
create index if not exists pulse_votes_option_idx on public.pulse_votes (topic_id, option_id);
create index if not exists pulse_votes_time_idx   on public.pulse_votes (topic_id, created_at);
create index if not exists pulse_votes_user_idx   on public.pulse_votes (user_id);

-- ── (3) pulse_daily_stats (일별 롤업 — 시계열/이력) ──────────────────────────
create table if not exists public.pulse_daily_stats (
  topic_id   uuid not null references public.pulse_topics (id) on delete cascade,
  stat_date  date not null,
  total      integer not null default 0,
  by_option  jsonb not null default '{}'::jsonb,       -- { "a": 12, "b": 7 }
  updated_at timestamptz not null default now(),
  primary key (topic_id, stat_date)
);

-- ── (4) RLS ─────────────────────────────────────────────────────────────────
alter table public.pulse_topics enable row level security;
alter table public.pulse_votes  enable row level security;
alter table public.pulse_daily_stats enable row level security;
revoke all on public.pulse_votes from anon, authenticated;
revoke all on public.pulse_daily_stats from anon, authenticated;
grant select on public.pulse_topics to authenticated;
grant select on public.pulse_votes to authenticated;   -- 본인 투표만(정책으로 제한)

drop policy if exists pulse_topics_read on public.pulse_topics;
create policy pulse_topics_read on public.pulse_topics for select
  using ((status = 'active' and visibility = 'public') or public.is_admin());
drop policy if exists pulse_votes_self on public.pulse_votes;
create policy pulse_votes_self on public.pulse_votes for select
  using (auth.uid() = user_id or public.is_admin());
drop policy if exists pulse_stats_admin on public.pulse_daily_stats;
create policy pulse_stats_admin on public.pulse_daily_stats for select using (public.is_admin());

-- ── (5) 실시간 트렌딩 뷰 (active+public, 24h 속도) ───────────────────────────
--   뷰 소유자(postgres) 권한으로 집계 → 개별 투표 미노출, 집계만. active+public 한정.
drop view if exists public.pulse_trending;
create view public.pulse_trending as
  select t.id as topic_id, t.question, t.team_id, t.created_at,
         count(v.id) filter (where v.created_at > now() - interval '24 hours') as votes_24h,
         count(v.id) as votes_total
  from public.pulse_topics t
  left join public.pulse_votes v on v.topic_id = t.id
  where t.status = 'active' and t.visibility = 'public'
  group by t.id
  order by votes_24h desc, votes_total desc;
grant select on public.pulse_trending to authenticated, service_role;

-- ── (6) Audit 헬퍼 (service_role 컨텍스트 대비 actor 명시) ────────────────────
create or replace function public._pulse_audit(p_actor uuid, p_action text, p_topic uuid, p_extra jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if p_actor is null then return; end if;
  select role into r from public.profiles where id = p_actor;
  insert into public.audit_logs(actor_id, actor_role, action, target_type, target_id, detail)
  values (p_actor, r, p_action, 'pulse', p_topic::text, coalesce(p_extra, '{}'::jsonb));
end $$;

-- ── (7) 생성 RPC (관리자) ───────────────────────────────────────────────────
create or replace function public.pulse_create(
  p_question text, p_options jsonb, p_team text default null,
  p_ends_at timestamptz default null, p_visibility text default 'public'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  if p_question is null or btrim(p_question) = '' then return jsonb_build_object('ok', false, 'code', 'empty_question'); end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) < 2 or jsonb_array_length(p_options) > 6 then
    return jsonb_build_object('ok', false, 'code', 'invalid_options');
  end if;
  insert into public.pulse_topics(question, options, team_id, ends_at, visibility, created_by)
  values (left(p_question, 300), p_options, p_team, p_ends_at,
          case when p_visibility = 'private' then 'private' else 'public' end, v_uid)
  returning id into v_id;
  perform public._pulse_audit(v_uid, 'pulse.create', v_id, jsonb_build_object('options', jsonb_array_length(p_options)));
  return jsonb_build_object('ok', true, 'code', 'created', 'topic_id', v_id);
end $$;

-- ── (8) 투표 RPC (본인인증 사용자, 1인1표, CAS 중복차단, 변경불가) ───────────
create or replace function public.pulse_vote(p_topic uuid, p_option text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_di text; v_topic public.pulse_topics; v_inserted uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'unauthorized'); end if;
  select identity_di_hash into v_di from public.profiles where id = v_uid;
  if v_di is null then return jsonb_build_object('ok', false, 'code', 'not_verified'); end if; -- 본인인증만
  select * into v_topic from public.pulse_topics where id = p_topic;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_topic.status <> 'active' then return jsonb_build_object('ok', false, 'code', 'not_active'); end if;
  if now() < v_topic.starts_at or (v_topic.ends_at is not null and now() > v_topic.ends_at) then
    return jsonb_build_object('ok', false, 'code', 'out_of_period');
  end if;
  if not exists (select 1 from jsonb_array_elements(v_topic.options) e where e->>'id' = p_option) then
    return jsonb_build_object('ok', false, 'code', 'invalid_option');
  end if;
  -- CAS: 주제당 DI 하나만. 이미 투표했으면 삽입 0건 → already_voted(변경 불가).
  insert into public.pulse_votes(topic_id, user_id, option_id, di_hash)
  values (p_topic, v_uid, p_option, v_di)
  on conflict (topic_id, di_hash) do nothing
  returning id into v_inserted;
  if v_inserted is null then return jsonb_build_object('ok', false, 'code', 'already_voted'); end if;
  perform public._pulse_audit(v_uid, 'pulse.vote', p_topic, jsonb_build_object('option', p_option));
  return jsonb_build_object('ok', true, 'code', 'voted');
end $$;

-- ── (9) 상태 전이 RPC (compare-and-set): close/reopen/archive ────────────────
--   active→closed(close), closed→active(reopen), {active,closed}→archived(archive).
create or replace function public.pulse_set_status(p_topic uuid, p_to text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_from text; v_ok boolean;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select status into v_from from public.pulse_topics where id = p_topic;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  v_ok := (v_from, p_to) in (('active','closed'),('closed','active'),('active','archived'),('closed','archived'));
  if not v_ok then return jsonb_build_object('ok', false, 'code', 'illegal_transition', 'from', v_from, 'to', p_to); end if;
  update public.pulse_topics set status = p_to, updated_at = now() where id = p_topic and status = v_from;
  if not found then return jsonb_build_object('ok', false, 'code', 'conflict'); end if;
  perform public._pulse_audit(v_uid,
    case p_to when 'closed' then 'pulse.close' when 'active' then 'pulse.reopen' else 'pulse.archive' end, p_topic,
    jsonb_build_object('from', v_from, 'to', p_to));
  return jsonb_build_object('ok', true, 'code', p_to);
end $$;

-- ── (10) 삭제 RPC (관리자) ──────────────────────────────────────────────────
create or replace function public.pulse_delete(p_topic uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  if not exists (select 1 from public.pulse_topics where id = p_topic) then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  perform public._pulse_audit(v_uid, 'pulse.delete', p_topic);   -- 삭제 전 기록(cascade 로 votes 정리)
  delete from public.pulse_topics where id = p_topic;
  return jsonb_build_object('ok', true, 'code', 'deleted');
end $$;

-- ── (11) 실시간 통계 RPC (집계만, 개별투표 미노출) ──────────────────────────
--   total / 선택지 비율 / 연령대 / 성별 / 시간별(24h) — public 주제 또는 관리자.
create or replace function public.pulse_stats(p_topic uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_topic public.pulse_topics; v_total int; v_result jsonb;
begin
  select * into v_topic from public.pulse_topics where id = p_topic;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not (v_topic.visibility = 'public' or public.is_admin()) then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select count(*) into v_total from public.pulse_votes where topic_id = p_topic;
  v_result := jsonb_build_object(
    'ok', true, 'topic_id', p_topic, 'status', v_topic.status, 'total', v_total,
    'by_option', coalesce((
      select jsonb_agg(jsonb_build_object('id', o->>'id', 'label', o->>'label',
               'votes', coalesce(c.votes,0),
               'ratio', case when v_total>0 then round(coalesce(c.votes,0)::numeric*100/v_total,1) else 0 end))
      from jsonb_array_elements(v_topic.options) o
      left join (select option_id, count(*) votes from public.pulse_votes where topic_id=p_topic group by option_id) c
        on c.option_id = o->>'id'), '[]'::jsonb),
    'by_age', coalesce((select jsonb_object_agg(coalesce(p.age_group,'na'), c) from
      (select p.age_group, count(*) c from public.pulse_votes v join public.profiles p on p.id=v.user_id
       where v.topic_id=p_topic group by p.age_group) p), '{}'::jsonb),
    'by_gender', coalesce((select jsonb_object_agg(coalesce(p.gender,'na'), c) from
      (select p.gender, count(*) c from public.pulse_votes v join public.profiles p on p.id=v.user_id
       where v.topic_id=p_topic group by p.gender) p), '{}'::jsonb),
    'hourly', coalesce((select jsonb_agg(jsonb_build_object('h', h, 'votes', c) order by h) from
      (select date_trunc('hour', created_at) h, count(*) c from public.pulse_votes
       where topic_id=p_topic and created_at > now()-interval '24 hours' group by 1) s), '[]'::jsonb)
  );
  return v_result;
end $$;

-- ── (12) 일별 롤업 RPC (cron 없이 관리자/서비스 호출, hot-row 회피) ──────────
create or replace function public.pulse_rollup_daily(p_topic uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.pulse_daily_stats(topic_id, stat_date, total, by_option, updated_at)
  select x.topic_id, x.d, sum(x.cnt), jsonb_object_agg(x.option_id, x.cnt), now()
  from (
    select topic_id, (created_at at time zone 'UTC')::date d, option_id, count(*) cnt
    from public.pulse_votes
    where p_topic is null or topic_id = p_topic
    group by topic_id, (created_at at time zone 'UTC')::date, option_id
  ) x
  group by x.topic_id, x.d
  on conflict (topic_id, stat_date) do update set total = excluded.total, by_option = excluded.by_option, updated_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ── (13) 관리자 대시보드 RPC ────────────────────────────────────────────────
create or replace function public.pulse_dashboard(p_limit integer default 5)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  return jsonb_build_object('ok', true,
    'active',    (select count(*) from public.pulse_topics where status='active'),
    'closed',    (select count(*) from public.pulse_topics where status='closed'),
    'archived',  (select count(*) from public.pulse_topics where status='archived'),
    'total_votes', (select count(*) from public.pulse_votes),
    'participants', (select count(distinct di_hash) from public.pulse_votes),
    'today_votes', (select count(*) from public.pulse_votes where created_at >= date_trunc('day', now())),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('topic_id', id, 'question', question, 'status', status,
                 'votes', (select count(*) from public.pulse_votes v where v.topic_id = t.id)) order by created_at desc)
               from (select * from public.pulse_topics order by created_at desc limit greatest(1,least(p_limit,20))) t), '[]'::jsonb),
    'trending', coalesce((select jsonb_agg(jsonb_build_object('topic_id', topic_id, 'question', question, 'votes_24h', votes_24h))
               from (select * from public.pulse_trending limit 5) tr), '[]'::jsonb)
  );
end $$;

-- ── (14) 실행 권한 최소화 ───────────────────────────────────────────────────
revoke all on function public.pulse_create(text, jsonb, text, timestamptz, text) from public;
revoke all on function public.pulse_vote(uuid, text) from public;
revoke all on function public.pulse_set_status(uuid, text) from public;
revoke all on function public.pulse_delete(uuid) from public;
revoke all on function public.pulse_stats(uuid) from public;
revoke all on function public.pulse_dashboard(integer) from public;
revoke all on function public.pulse_rollup_daily(uuid) from public;
revoke all on function public._pulse_audit(uuid, text, uuid, jsonb) from public;
grant execute on function public.pulse_vote(uuid, text) to authenticated, service_role;
grant execute on function public.pulse_stats(uuid) to authenticated, service_role;
grant execute on function public.pulse_create(text, jsonb, text, timestamptz, text) to authenticated, service_role;
grant execute on function public.pulse_set_status(uuid, text) to authenticated, service_role;
grant execute on function public.pulse_delete(uuid) to authenticated, service_role;
grant execute on function public.pulse_dashboard(integer) to authenticated, service_role;
grant execute on function public.pulse_rollup_daily(uuid) to authenticated, service_role;
