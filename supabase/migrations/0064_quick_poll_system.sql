-- ============================================================================
-- FANCLUV — 0064_quick_poll_system.sql   (Phase 17 — Quick Poll: 콘텐츠 임베드 초경량 투표)
--
-- Fan Pulse(독립 여론 페이지, DI 강무결성, 상세 통계)와 분리된 별도 구조.
-- Quick Poll = 콘텐츠(home/news/opinion/match) 안에 삽입되는 1문항·2~4선택지 즉시 투표.
--
-- 핵심 정책
--   • 1인 1표: voter_key = 'di:'||di_hash (본인인증 시) 또는 'user:'||uuid (fallback).
--     UNIQUE(poll_id, voter_key) + ON CONFLICT DO NOTHING = CAS 중복차단, 변경 불가.
--     voter_key 원문은 사용자에게 노출하지 않는다(집계/응답에 미포함).
--   • 동일 context active Poll 최대 1개(부분 UNIQUE, 동시생성 race 차단).
--   • 개별 투표는 audit_logs 미기록(hot spot 방지) — quick_poll_votes 가 원장 + activity_events.
--   • 관리자 상태변경만 audit_logs. DI/voter_key/email/IP/JWT 미기록.
--   • 결과 공개: always | after_vote | after_close. 개별 voter 미노출.
--   • 상태: draft/active/closed/archived. 자동종료(quick_poll_close_expired).
-- ============================================================================

-- ── (1) quick_polls ─────────────────────────────────────────────────────────
create table if not exists public.quick_polls (
  id            uuid primary key default gen_random_uuid(),
  team_id       text,
  question      text not null,
  options       jsonb not null,                          -- [{id,label}] 2~4
  status        text not null default 'active' check (status in ('draft','active','closed','archived')),
  visibility    text not null default 'public' check (visibility in ('public','private')),
  context_type  text not null default 'standalone' check (context_type in ('home','news','match','opinion','standalone')),
  context_id    text,                                    -- news_id/opinion_id/... (home/standalone=null)
  starts_at     timestamptz not null default now(),
  ends_at       timestamptz,
  allow_result_before_vote boolean not null default false,
  result_visibility text not null default 'after_vote' check (result_visibility in ('always','after_vote','after_close')),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint qp_options_count check (jsonb_typeof(options)='array' and jsonb_array_length(options) between 2 and 4),
  constraint qp_period check (ends_at is null or ends_at > starts_at)
);
create index if not exists qp_status_idx  on public.quick_polls (status, created_at desc);
create index if not exists qp_team_idx     on public.quick_polls (team_id, status);
create index if not exists qp_context_idx  on public.quick_polls (context_type, context_id) where status = 'active';
create index if not exists qp_expire_idx   on public.quick_polls (ends_at) where status = 'active' and ends_at is not null;
-- 동일 context active 1개(news/opinion/match): context_id 기준.
create unique index if not exists qp_active_context_uk on public.quick_polls (context_type, context_id)
  where status = 'active' and context_id is not null;
-- home active 1개(팀 기준; null 팀=글로벌 1개).
create unique index if not exists qp_active_home_uk on public.quick_polls ((coalesce(team_id,'__all__')))
  where status = 'active' and context_type = 'home';

-- ── (2) quick_poll_votes (voter_key = di 우선 / user fallback) ───────────────
create table if not exists public.quick_poll_votes (
  id         uuid primary key default gen_random_uuid(),
  poll_id    uuid not null references public.quick_polls (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  voter_key  text not null,                              -- 'di:<hash>' | 'user:<uuid>' (원문 비노출)
  option_id  text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists qp_votes_voter_uk on public.quick_poll_votes (poll_id, voter_key);
create index if not exists qp_votes_option_idx on public.quick_poll_votes (poll_id, option_id);
create index if not exists qp_votes_user_idx   on public.quick_poll_votes (user_id);

-- ── (3) quick_poll_stats (옵션별 롤업 — 대시보드 효율용, 결과 RPC 는 라이브 집계) ─
create table if not exists public.quick_poll_stats (
  poll_id    uuid not null references public.quick_polls (id) on delete cascade,
  option_id  text not null,
  vote_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (poll_id, option_id)
);

-- ── (4) RLS ─────────────────────────────────────────────────────────────────
alter table public.quick_polls enable row level security;
alter table public.quick_poll_votes enable row level security;
alter table public.quick_poll_stats enable row level security;
revoke all on public.quick_poll_votes from anon, authenticated;
revoke all on public.quick_poll_stats from anon, authenticated;
grant select on public.quick_polls to authenticated;
grant select on public.quick_poll_votes to authenticated;

drop policy if exists qp_read on public.quick_polls;
create policy qp_read on public.quick_polls for select
  using ((status in ('active','closed') and visibility = 'public') or public.is_admin());
-- private/draft/archived 는 SECURITY DEFINER RPC(list_for_context/get_results)로만 노출.
drop policy if exists qp_votes_self on public.quick_poll_votes;
create policy qp_votes_self on public.quick_poll_votes for select
  using (auth.uid() = user_id or public.is_admin());
drop policy if exists qp_stats_admin on public.quick_poll_stats;
create policy qp_stats_admin on public.quick_poll_stats for select using (public.is_admin());

-- ── (5) Audit 헬퍼(관리자 액션만; 투표는 미기록) ─────────────────────────────
create or replace function public._qp_audit(p_actor uuid, p_action text, p_poll uuid, p_extra jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if p_actor is null then return; end if;
  select role into r from public.profiles where id = p_actor;
  insert into public.audit_logs(actor_id, actor_role, action, target_type, target_id, detail)
  values (p_actor, r, p_action, 'quick_poll', p_poll::text, coalesce(p_extra, '{}'::jsonb));
end $$;

-- ── (6) voter_key 생성(내부): di 우선, 없으면 user ──────────────────────────
create or replace function public._qp_voter_key(p_uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when p.identity_di_hash is not null then 'di:'||p.identity_di_hash else 'user:'||p_uid::text end
  from public.profiles p where p.id = p_uid;
$$;

-- ── (7) create (관리자) ─────────────────────────────────────────────────────
create or replace function public.quick_poll_create(
  p_question text, p_options jsonb, p_context_type text, p_context_id text default null,
  p_team text default null, p_ends_at timestamptz default null, p_visibility text default 'public',
  p_allow_result_before_vote boolean default false, p_result_visibility text default 'after_vote'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_ctx text := p_context_id;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  if p_question is null or btrim(p_question) = '' then return jsonb_build_object('ok', false, 'code', 'empty_question'); end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) < 2 or jsonb_array_length(p_options) > 4 then
    return jsonb_build_object('ok', false, 'code', 'invalid_options');
  end if;
  if p_context_type not in ('home','news','match','opinion','standalone') then return jsonb_build_object('ok', false, 'code', 'invalid_context_type'); end if;
  -- context 유효성
  if p_context_type in ('home','standalone') then
    v_ctx := null;
  elsif p_context_type = 'match' then
    return jsonb_build_object('ok', false, 'code', 'match_unavailable');  -- 경기 provider 미연동
  elsif p_context_type = 'news' then
    begin if not exists (select 1 from public.team_news where id = v_ctx::uuid and status = 'published') then return jsonb_build_object('ok', false, 'code', 'invalid_context'); end if;
    exception when others then return jsonb_build_object('ok', false, 'code', 'invalid_context'); end;
  elsif p_context_type = 'opinion' then
    begin if not exists (select 1 from public.opinions where id = v_ctx::uuid) then return jsonb_build_object('ok', false, 'code', 'invalid_context'); end if;
    exception when others then return jsonb_build_object('ok', false, 'code', 'invalid_context'); end;
  end if;
  begin
    insert into public.quick_polls(team_id, question, options, context_type, context_id, ends_at, visibility,
      allow_result_before_vote, result_visibility, created_by, status)
    values (p_team, left(p_question,300), p_options, p_context_type, v_ctx, p_ends_at,
      case when p_visibility='private' then 'private' else 'public' end, coalesce(p_allow_result_before_vote,false),
      case when p_result_visibility in ('always','after_vote','after_close') then p_result_visibility else 'after_vote' end,
      v_uid, 'active')
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'context_conflict');  -- 동일 context active 이미 존재
  end;
  perform public._qp_audit(v_uid, 'quick_poll.create', v_id, jsonb_build_object('context', p_context_type));
  return jsonb_build_object('ok', true, 'code', 'created', 'poll_id', v_id);
end $$;

-- ── (8) vote (로그인, active/기간, voter_key CAS, 변경불가, activity 1건) ────
create or replace function public.quick_poll_vote(p_poll uuid, p_option text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_key text; v_poll public.quick_polls; v_ins uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'unauthorized'); end if;
  select * into v_poll from public.quick_polls where id = p_poll;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_poll.status <> 'active' then return jsonb_build_object('ok', false, 'code', 'not_active'); end if;
  if now() < v_poll.starts_at or (v_poll.ends_at is not null and now() > v_poll.ends_at) then
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;
  if not exists (select 1 from jsonb_array_elements(v_poll.options) e where e->>'id' = p_option) then
    return jsonb_build_object('ok', false, 'code', 'invalid_option');
  end if;
  v_key := public._qp_voter_key(v_uid);
  insert into public.quick_poll_votes(poll_id, user_id, voter_key, option_id)
  values (p_poll, v_uid, v_key, p_option)
  on conflict (poll_id, voter_key) do nothing
  returning id into v_ins;
  if v_ins is null then return jsonb_build_object('ok', false, 'code', 'already_voted'); end if;
  -- activity(비민감, exactly-once: 투표 성공 1건에만). 실패해도 투표는 유효.
  insert into public.activity_events(user_id, type, entity_type, entity_id, team_id, title)
  values (v_uid, 'quick_poll_vote', 'quick_poll', p_poll::text, v_poll.team_id, left(v_poll.question,120));
  return jsonb_build_object('ok', true, 'code', 'voted');
end $$;

-- ── (9) 상태 전이 (compare-and-set) ─────────────────────────────────────────
--   draft→{active,archived}, active→{closed,archived}, closed→{active,archived}, archived→{draft}.
create or replace function public.quick_poll_set_status(p_poll uuid, p_to text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_from text; v_ok boolean;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select status into v_from from public.quick_polls where id = p_poll;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  v_ok := (v_from, p_to) in (('draft','active'),('draft','archived'),('active','closed'),('active','archived'),
                             ('closed','active'),('closed','archived'),('archived','draft'));
  if not v_ok then return jsonb_build_object('ok', false, 'code', 'illegal_transition', 'from', v_from, 'to', p_to); end if;
  begin
    update public.quick_polls set status = p_to, updated_at = now() where id = p_poll and status = v_from;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'context_conflict');  -- 활성화 시 동일 context 충돌
  end;
  if not found then return jsonb_build_object('ok', false, 'code', 'conflict'); end if;
  perform public._qp_audit(v_uid,
    case p_to when 'active' then 'quick_poll.activate' when 'closed' then 'quick_poll.close'
              when 'archived' then 'quick_poll.archive' else 'quick_poll.restore' end, p_poll,
    jsonb_build_object('from', v_from, 'to', p_to));
  return jsonb_build_object('ok', true, 'code', p_to);
end $$;

-- ── (10) delete ─────────────────────────────────────────────────────────────
create or replace function public.quick_poll_delete(p_poll uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  if not exists (select 1 from public.quick_polls where id = p_poll) then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  perform public._qp_audit(v_uid, 'quick_poll.delete', p_poll);
  delete from public.quick_polls where id = p_poll;
  return jsonb_build_object('ok', true, 'code', 'deleted');
end $$;

-- ── (11) 결과 (공개정책 적용, 개별 voter 미노출, has_voted 포함) ────────────
create or replace function public.quick_poll_get_results(p_poll uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_poll public.quick_polls; v_uid uuid := auth.uid(); v_key text; v_total int; v_voted boolean; v_myopt text; v_show boolean;
begin
  select * into v_poll from public.quick_polls where id = p_poll;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not (v_poll.visibility='public' or public.is_admin()) then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  v_key := case when v_uid is null then null else public._qp_voter_key(v_uid) end;
  select option_id into v_myopt from public.quick_poll_votes where poll_id=p_poll and voter_key=v_key;
  v_voted := v_myopt is not null;
  -- 결과 공개 정책
  v_show := public.is_admin() or v_poll.allow_result_before_vote
            or (v_poll.result_visibility='always')
            or (v_poll.result_visibility='after_vote' and v_voted)
            or (v_poll.result_visibility='after_close' and v_poll.status in ('closed','archived'));
  select count(*) into v_total from public.quick_poll_votes where poll_id=p_poll;
  return jsonb_build_object('ok', true, 'poll_id', p_poll, 'status', v_poll.status,
    'has_voted', v_voted, 'my_option', v_myopt, 'show_results', v_show, 'total', case when v_show then v_total else null end,
    'by_option', case when v_show then coalesce((
      select jsonb_agg(jsonb_build_object('id', o->>'id', 'label', o->>'label',
        'votes', coalesce(c.votes,0),
        'ratio', case when v_total>0 then round(coalesce(c.votes,0)::numeric*100/v_total,1) else 0 end))
      from jsonb_array_elements(v_poll.options) o
      left join (select option_id, count(*) votes from public.quick_poll_votes where poll_id=p_poll group by option_id) c
        on c.option_id = o->>'id'), '[]'::jsonb) else null end);
end $$;

-- ── (12) context 조회(임베드) — 만료 자동종료 후 active 1개 반환 ─────────────
create or replace function public.quick_poll_list_for_context(p_context_type text, p_context_id text default null, p_team text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_poll public.quick_polls;
begin
  perform public.quick_poll_close_expired();  -- 조회 시 만료분 종료(due row only)
  if p_context_type = 'home' then
    select * into v_poll from public.quick_polls
     where context_type='home' and status='active' and (team_id = p_team or team_id is null)
     order by (team_id = p_team) desc nulls last, created_at desc limit 1;
  else
    select * into v_poll from public.quick_polls
     where context_type = p_context_type and context_id = p_context_id and status='active' limit 1;
  end if;
  if not found then return jsonb_build_object('ok', true, 'poll', null); end if;
  return jsonb_build_object('ok', true, 'poll', jsonb_build_object(
    'id', v_poll.id, 'question', v_poll.question, 'options', v_poll.options, 'status', v_poll.status,
    'team_id', v_poll.team_id, 'ends_at', v_poll.ends_at, 'context_type', v_poll.context_type));
end $$;

-- ── (13) 자동 종료(반복 호출 안전, due row only, audit exactly-once) ─────────
create or replace function public.quick_poll_close_expired()
returns integer language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in with upd as (
             update public.quick_polls set status='closed', updated_at=now()
               where status='active' and ends_at is not null and ends_at <= now()
               returning id, created_by)
           select id, created_by from upd loop
    perform public._qp_audit(coalesce(r.created_by, auth.uid()), 'quick_poll.close', r.id, jsonb_build_object('auto', true));
    n := n + 1;
  end loop;
  return n;
end $$;

-- ── (14) 관리자 대시보드 ────────────────────────────────────────────────────
create or replace function public.quick_poll_dashboard(p_limit integer default 5)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  return jsonb_build_object('ok', true,
    'active',   (select count(*) from public.quick_polls where status='active'),
    'closed',   (select count(*) from public.quick_polls where status='closed'),
    'archived', (select count(*) from public.quick_polls where status='archived'),
    'total_votes', (select count(*) from public.quick_poll_votes),
    'today_votes', (select count(*) from public.quick_poll_votes where created_at >= date_trunc('day', now())),
    'participants', (select count(distinct voter_key) from public.quick_poll_votes),
    'by_context', coalesce((select jsonb_object_agg(context_type, c) from (select context_type, count(*) c from public.quick_polls group by context_type) x), '{}'::jsonb),
    'ending_soon', coalesce((select jsonb_agg(jsonb_build_object('id',id,'question',question,'ends_at',ends_at) order by ends_at)
       from (select * from public.quick_polls where status='active' and ends_at is not null and ends_at > now() order by ends_at limit 5) e), '[]'::jsonb),
    'top', coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'question',q.question,'votes',v.c) order by v.c desc)
       from (select poll_id, count(*) c from public.quick_poll_votes group by poll_id order by c desc limit 5) v
       join public.quick_polls q on q.id=v.poll_id), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('id',id,'question',question,'status',status,'context',context_type) order by created_at desc)
       from (select * from public.quick_polls order by created_at desc limit greatest(1,least(p_limit,20))) r), '[]'::jsonb));
end $$;

-- ── (15) 관리자 목록(전체, 필터) ────────────────────────────────────────────
create or replace function public.quick_poll_admin_list(p_status text default null, p_context text default null, p_team text default null, p_q text default null, p_limit int default 20, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_total int;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select count(*) into v_total from public.quick_polls
    where (p_status is null or status=p_status) and (p_context is null or context_type=p_context)
      and (p_team is null or team_id=p_team) and (p_q is null or question ilike '%'||replace(p_q,'%','')||'%');
  return jsonb_build_object('ok', true, 'total', v_total, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id',id,'question',question,'status',status,'context_type',context_type,
             'context_id',context_id,'team_id',team_id,'ends_at',ends_at,'created_at',created_at,
             'votes',(select count(*) from public.quick_poll_votes v where v.poll_id=q.id)) order by created_at desc)
    from (select * from public.quick_polls q2
          where (p_status is null or status=p_status) and (p_context is null or context_type=p_context)
            and (p_team is null or team_id=p_team) and (p_q is null or question ilike '%'||replace(p_q,'%','')||'%')
          order by created_at desc limit least(greatest(p_limit,1),100) offset greatest(p_offset,0)) q), '[]'::jsonb));
end $$;

-- ── (16) 실행 권한 (least-privilege) ────────────────────────────────────────
revoke all on function public._qp_audit(uuid,text,uuid,jsonb) from public;
revoke all on function public._qp_voter_key(uuid) from public;
revoke all on function public.quick_poll_create(text,jsonb,text,text,text,timestamptz,text,boolean,text) from public;
revoke all on function public.quick_poll_vote(uuid,text) from public;
revoke all on function public.quick_poll_set_status(uuid,text) from public;
revoke all on function public.quick_poll_delete(uuid) from public;
revoke all on function public.quick_poll_get_results(uuid) from public;
revoke all on function public.quick_poll_list_for_context(text,text,text) from public;
revoke all on function public.quick_poll_close_expired() from public;
revoke all on function public.quick_poll_dashboard(integer) from public;
revoke all on function public.quick_poll_admin_list(text,text,text,text,integer,integer) from public;
grant execute on function public.quick_poll_vote(uuid,text) to authenticated, service_role;
grant execute on function public.quick_poll_get_results(uuid) to authenticated, service_role;
grant execute on function public.quick_poll_list_for_context(text,text,text) to authenticated, service_role;
grant execute on function public.quick_poll_create(text,jsonb,text,text,text,timestamptz,text,boolean,text) to authenticated, service_role;
grant execute on function public.quick_poll_set_status(uuid,text) to authenticated, service_role;
grant execute on function public.quick_poll_delete(uuid) to authenticated, service_role;
grant execute on function public.quick_poll_close_expired() to authenticated, service_role;
grant execute on function public.quick_poll_dashboard(integer) to authenticated, service_role;
grant execute on function public.quick_poll_admin_list(text,text,text,text,integer,integer) to authenticated, service_role;
