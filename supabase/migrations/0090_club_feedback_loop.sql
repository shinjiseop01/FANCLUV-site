-- 0090_club_feedback_loop.sql
-- Feedback Loop Phase 1: 구단이 완료(done)한 개선 조치를 팬에게 「구단 피드백」으로 공개.
-- 기존 club_actions(관리자 전용 RLS) 재사용. 업무 진행 status 와 팬 공개 상태(is_published)를 분리.
--   · completed(=status 'done') ≠ 자동 공개. 명시적 publish 필요.
--   · 팬 read RPC 는 sanitize 된 공개 필드만 반환(내부 memo/kpi/insight 원문 미노출).
--   · 공개/취소 는 is_admin() 또는 자기 구단 Club 만(tenant 강제).
-- Additive only. 기존 migration 무수정. destructive 없음.

-- ── 1) 팬 공개용 필드(내부 status 와 분리) ──
alter table public.club_actions
  add column if not exists is_published  boolean     not null default false,
  add column if not exists public_title  text,
  add column if not exists public_summary text,
  add column if not exists published_at  timestamptz,
  add column if not exists published_by  uuid references auth.users(id) on delete set null,
  add column if not exists completed_at  timestamptz;

-- 기존 done 조치의 completed_at 백필(존재 시).
update public.club_actions set completed_at = coalesce(completed_at, updated_at)
  where status in ('done','closed') and completed_at is null;

-- ── 2) 가드 트리거 ── status 가 done 이 아니게 되면 자동 비공개(§14). done 진입 시 completed_at 세팅.
--     공개(is_published=true)는 done + 공개 제목/요약 필수(RPC 와 이중 방어).
create or replace function public.club_actions_publish_guard()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and new.completed_at is null then
    new.completed_at := now();
  end if;
  -- 완료 상태가 아니면 팬 공개 강제 해제.
  if new.status <> 'done' then
    new.is_published := false;
  end if;
  -- 공개하려면 공개 제목/요약이 반드시 있어야 함.
  if new.is_published then
    if new.public_title is null or btrim(new.public_title) = ''
       or new.public_summary is null or btrim(new.public_summary) = '' then
      raise exception 'club_feedback_missing_public_fields';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_club_actions_publish_guard on public.club_actions;
create trigger trg_club_actions_publish_guard
  before insert or update on public.club_actions
  for each row execute function public.club_actions_publish_guard();

-- ── 3) 팬 공개 목록 인덱스(team_id, published_at desc) — 공개된 행만 ──
create index if not exists club_actions_feedback_idx
  on public.club_actions (club_id, published_at desc)
  where is_published;

-- ── 4) Fan read RPC ── sanitize 된 공개 필드만. published + done + 자기팀, bounded.
create or replace function public.fan_club_feedback(p_team_id text, p_limit int default 5)
returns table(id bigint, club_id text, public_title text, public_summary text,
              category text, completed_at timestamptz, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.club_id, a.public_title, a.public_summary,
         a.category, a.completed_at, a.published_at
    from public.club_actions a
   where a.is_published
     and a.status = 'done'
     and a.club_id = p_team_id
     and a.public_title is not null and btrim(a.public_title) <> ''
     and a.public_summary is not null and btrim(a.public_summary) <> ''
   order by a.published_at desc nulls last
   limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

-- ── 5) 공개 RPC ── is_admin() 또는 자기 구단 Club. done + 공개 제목/요약 필수.
create or replace function public.club_publish_action(
  p_action_id bigint, p_public_title text, p_public_summary text, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record; v_title text := btrim(coalesce(p_public_title,'')); v_sum text := btrim(coalesce(p_public_summary,''));
begin
  select * into a from public.club_actions where id = p_action_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not (public.is_admin() or (public.is_club_account() and public.current_user_team() = a.club_id)) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ALLOWED');
  end if;
  if a.status <> 'done' then return jsonb_build_object('ok', false, 'code', 'not_completed'); end if;
  if v_title = '' or v_sum = '' then return jsonb_build_object('ok', false, 'code', 'missing_public_fields'); end if;
  update public.club_actions
     set is_published = true, public_title = v_title, public_summary = v_sum,
         category = coalesce(nullif(btrim(coalesce(p_category,'')),''), category),
         published_at = now(), published_by = auth.uid(), updated_at = now()
   where id = p_action_id;
  return jsonb_build_object('ok', true, 'id', p_action_id);
end $$;

-- ── 6) 공개 취소 RPC ── 동일 gate. row 삭제 안 함(§13). 즉시 Fan read 에서 제외.
create or replace function public.club_unpublish_action(p_action_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from public.club_actions where id = p_action_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not (public.is_admin() or (public.is_club_account() and public.current_user_team() = a.club_id)) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ALLOWED');
  end if;
  update public.club_actions set is_published = false, updated_at = now() where id = p_action_id;
  return jsonb_build_object('ok', true, 'id', p_action_id);
end $$;

-- ── 7) Club 자기 조치 목록 RPC(공개 UI용) ── 자기 구단 only. 공개 판단에 필요한 최소 필드만.
--     내부 result_note/before_after_kpi/ai prompt 는 반환하지 않음.
create or replace function public.club_list_own_actions(p_limit int default 50)
returns table(id bigint, club_id text, title text, category text, status text,
              completed_at timestamptz, is_published boolean,
              public_title text, public_summary text, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.club_id, a.title, a.category, a.status,
         a.completed_at, a.is_published, a.public_title, a.public_summary, a.published_at
    from public.club_actions a
   where public.is_club_account() and a.club_id = public.current_user_team()
   order by (a.status = 'done') desc, a.completed_at desc nulls last, a.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- ── 8) 권한: public execute revoke 후 필요 role 에만 grant ──
revoke all on function public.fan_club_feedback(text, int) from public;
revoke all on function public.club_publish_action(bigint, text, text, text) from public;
revoke all on function public.club_unpublish_action(bigint) from public;
revoke all on function public.club_list_own_actions(int) from public;

grant execute on function public.fan_club_feedback(text, int) to anon, authenticated;
grant execute on function public.club_publish_action(bigint, text, text, text) to authenticated;
grant execute on function public.club_unpublish_action(bigint) to authenticated;
grant execute on function public.club_list_own_actions(int) to authenticated;
