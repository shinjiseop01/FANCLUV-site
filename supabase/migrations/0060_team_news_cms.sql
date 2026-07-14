-- ============================================================================
-- FANCLUV — 0060_team_news_cms.sql  (Phase 13 — 팀 뉴스 CMS Production Ready)
--
-- 운영자가 직접 등록하는 뉴스 CMS 를 프로덕션 수준으로 완성한다(외부 API/크롤러 없음).
--   • 게시상태: draft / scheduled / published / archived (compare-and-set 전이)
--   • 예약발행(publish_at) — cron 없이 진입/조회 시 자동 승격(news_autopublish)
--   • 고정(pinned, 최대 3) / 태그(text[]) / 조회수 / updated_by·updated_at
--   • AI 분석 큐(news_ai_queue, pending 만 — 실분석은 향후 Phase)
--   • 검색 인덱스(pg_trgm), 상태/팀/예약/고정 인덱스
--   • RLS: 팬은 published 만 조회(draft/scheduled/archived 차단), 쓰기는 관리자
--   • Audit: create/update/publish/schedule/pin/unpin/archive/restore/delete
--   • Storage: news-images 공개 버킷(관리자 쓰기, 공개 읽기)
-- ============================================================================

create extension if not exists pg_trgm;

-- ── (1) team_news 컬럼 확장 ─────────────────────────────────────────────────
alter table public.team_news add column if not exists publish_at  timestamptz;
alter table public.team_news add column if not exists pinned      boolean not null default false;
alter table public.team_news add column if not exists pinned_at   timestamptz;
alter table public.team_news add column if not exists tags        text[] not null default '{}';
alter table public.team_news add column if not exists view_count  integer not null default 0;
alter table public.team_news add column if not exists updated_by  uuid references auth.users (id) on delete set null;
alter table public.team_news add column if not exists updated_at  timestamptz not null default now();

-- 기존 status('published'|'hidden') → 신규 4-상태로 이관 후 CHECK 부여.
update public.team_news set status = 'archived' where status = 'hidden';
update public.team_news set status = 'published' where status not in ('draft','scheduled','published','archived');
alter table public.team_news alter column status set default 'draft';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'team_news_status_chk') then
    alter table public.team_news add constraint team_news_status_chk
      check (status in ('draft','scheduled','published','archived'));
  end if;
end $$;

comment on column public.team_news.status is 'draft|scheduled|published|archived (compare-and-set 전이)';
comment on column public.team_news.publish_at is '예약 발행 시각. status=scheduled 이고 now()>=publish_at 이면 자동 published.';

-- ── (2) 인덱스 (검색/필터/정렬 — LIKE 스캔 방지) ────────────────────────────
create index if not exists team_news_status_idx     on public.team_news (status, created_at desc);
create index if not exists team_news_team_status_idx on public.team_news (team_id, status, created_at desc);
create index if not exists team_news_sched_idx       on public.team_news (publish_at) where status = 'scheduled';
create index if not exists team_news_pinned_idx      on public.team_news (pinned_at desc) where pinned;
create index if not exists team_news_author_idx      on public.team_news (author_id);
create index if not exists team_news_viewcount_idx   on public.team_news (view_count desc);
create index if not exists team_news_tags_gin        on public.team_news using gin (tags);
create index if not exists team_news_title_trgm      on public.team_news using gin (title gin_trgm_ops);
create index if not exists team_news_content_trgm    on public.team_news using gin (content gin_trgm_ops);

-- ── (3) 고정(pinned) 최대 3개 — 트리거로 강제 ───────────────────────────────
create or replace function public.tg_news_pin_limit()
returns trigger language plpgsql set search_path = public as $$
begin
  if NEW.pinned and (select count(*) from public.team_news where pinned and id <> NEW.id) >= 3 then
    raise exception 'pin_limit: 최대 3개까지 고정할 수 있습니다' using errcode = 'check_violation';
  end if;
  return NEW;
end $$;
drop trigger if exists trg_news_pin_limit on public.team_news;
create trigger trg_news_pin_limit before insert or update of pinned on public.team_news
  for each row when (NEW.pinned) execute function public.tg_news_pin_limit();

-- ── (4) updated_at 자동 갱신 ────────────────────────────────────────────────
create or replace function public.tg_news_touch()
returns trigger language plpgsql set search_path = public as $$
begin NEW.updated_at := now(); return NEW; end $$;
drop trigger if exists trg_news_touch on public.team_news;
create trigger trg_news_touch before update on public.team_news
  for each row execute function public.tg_news_touch();

-- ── (5) AI 분석 큐 (pending 만 — 실분석은 향후 Phase) ────────────────────────
create table if not exists public.news_ai_queue (
  id         uuid primary key default gen_random_uuid(),
  news_id    uuid not null references public.team_news (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending','processing','done','failed')),
  reason     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 뉴스당 pending 1건만(중복 큐 방지).
create unique index if not exists news_ai_queue_pending_uk on public.news_ai_queue (news_id) where status = 'pending';
create index if not exists news_ai_queue_status_idx on public.news_ai_queue (status, created_at);
alter table public.news_ai_queue enable row level security;
revoke all on public.news_ai_queue from anon, authenticated;
drop policy if exists news_ai_queue_admin_read on public.news_ai_queue;
create policy news_ai_queue_admin_read on public.news_ai_queue for select using (public.is_admin());

-- ── (6) RLS 재정의 — 팬은 published 만, 관리자는 전체 ───────────────────────
drop policy if exists "news readable by authenticated" on public.team_news;
drop policy if exists news_read_scoped on public.team_news;
create policy news_read_scoped on public.team_news for select
  using (status = 'published' or public.is_admin());
-- insert/update/delete 관리자 정책은 0006 에서 유지(is_admin()).

-- ── (7) 통합 Audit + AI큐 트리거 (create/update/status/pin/delete 일원화) ─────
-- 0053 의 news.delete 트리거는 이 트리거로 대체(중복 방지).
drop trigger if exists audit_news_del on public.team_news;

create or replace function public.tg_news_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_role text; v_action text; v_detail jsonb := '{}'::jsonb;
begin
  if TG_OP = 'INSERT' then
    v_action := 'news.create';
    if NEW.status = 'published' then
      insert into public.news_ai_queue(news_id, status) values (NEW.id, 'pending')
        on conflict (news_id) where (status = 'pending') do nothing;
    end if;
  elsif TG_OP = 'DELETE' then
    v_action := 'news.delete';
    v_detail := jsonb_build_object('title', OLD.title);
  else -- UPDATE
    if NEW.status is distinct from OLD.status then
      v_action := case NEW.status
        when 'published' then 'news.publish'
        when 'scheduled' then 'news.schedule'
        when 'archived'  then 'news.archive'
        when 'draft'     then case when OLD.status = 'archived' then 'news.restore' else 'news.draft' end
      end;
      v_detail := jsonb_build_object('from', OLD.status, 'to', NEW.status);
      if NEW.status = 'published' then
        insert into public.news_ai_queue(news_id, status) values (NEW.id, 'pending')
          on conflict (news_id) where (status = 'pending') do nothing;
      end if;
    elsif NEW.pinned is distinct from OLD.pinned then
      v_action := case when NEW.pinned then 'news.pin' else 'news.unpin' end;
    elsif NEW.view_count is distinct from OLD.view_count
          and NEW.title is not distinct from OLD.title
          and NEW.content is not distinct from OLD.content then
      return NEW; -- 조회수만 증가한 변경은 audit 하지 않음(고빈도)
    else
      v_action := 'news.update';
    end if;
  end if;

  if v_actor is null or v_action is null then return coalesce(NEW, OLD); end if; -- 서비스/시스템은 미기록
  select role into v_role from public.profiles where id = v_actor;
  insert into public.audit_logs(actor_id, actor_role, action, target_type, target_id, detail)
  values (v_actor, v_role, v_action, 'news', coalesce(NEW.id, OLD.id)::text, v_detail);
  return coalesce(NEW, OLD);
end $$;
drop trigger if exists trg_news_audit_ins on public.team_news;
drop trigger if exists trg_news_audit_upd on public.team_news;
drop trigger if exists trg_news_audit_del on public.team_news;
create trigger trg_news_audit_ins after insert on public.team_news for each row execute function public.tg_news_audit();
create trigger trg_news_audit_upd after update on public.team_news for each row execute function public.tg_news_audit();
create trigger trg_news_audit_del after delete on public.team_news for each row execute function public.tg_news_audit();

-- 새 뉴스 알림은 published 로 게시될 때만(draft/scheduled 는 알림 없음).
drop trigger if exists trg_notify_news on public.team_news;
create trigger trg_notify_news after insert on public.team_news
  for each row when (NEW.status = 'published') execute function public.notify_on_news();

-- ── (8) 상태 전이 RPC (compare-and-set + 전이 매트릭스 검증) ──────────────────
-- 허용: draft→{scheduled,published,archived}, scheduled→{published,draft,archived},
--       published→archived, archived→draft(복원). published→draft, archived→published 금지.
create or replace function public.news_transition_status(p_id uuid, p_to text, p_publish_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_from text; v_ok boolean;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select status into v_from from public.team_news where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  v_ok := (v_from, p_to) in (
    ('draft','scheduled'),('draft','published'),('draft','archived'),
    ('scheduled','published'),('scheduled','draft'),('scheduled','archived'),
    ('published','archived'),
    ('archived','draft'));
  if not v_ok then return jsonb_build_object('ok', false, 'code', 'illegal_transition', 'from', v_from, 'to', p_to); end if;
  if p_to = 'scheduled' and p_publish_at is null then
    return jsonb_build_object('ok', false, 'code', 'publish_at_required');
  end if;
  -- compare-and-set: 동시 전이 중 1건만 성공.
  update public.team_news
     set status = p_to,
         publish_at = case when p_to = 'scheduled' then p_publish_at
                           when p_to = 'published' then coalesce(publish_at, now()) else publish_at end,
         updated_by = auth.uid()
   where id = p_id and status = v_from;
  if not found then return jsonb_build_object('ok', false, 'code', 'conflict'); end if;
  return jsonb_build_object('ok', true, 'code', p_to);
end $$;

-- ── (9) 예약 자동 발행 (cron 없이 진입/조회 시 호출) ─────────────────────────
create or replace function public.news_autopublish()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with promoted as (
    update public.team_news set status = 'published', updated_at = now()
     where status = 'scheduled' and publish_at is not null and publish_at <= now()
     returning 1)
  select count(*) into n from promoted;
  return n;
end $$;

-- ── (10) 고정 설정 RPC (max 3 은 트리거로 강제, 여기선 code 매핑) ────────────
create or replace function public.news_set_pinned(p_id uuid, p_pinned boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  update public.team_news
     set pinned = p_pinned, pinned_at = case when p_pinned then now() else null end, updated_by = auth.uid()
   where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'code', case when p_pinned then 'pinned' else 'unpinned' end);
exception when check_violation then
  return jsonb_build_object('ok', false, 'code', 'pin_limit');
end $$;

-- ── (11) 조회수 증가 (published 만, audit 없음) ──────────────────────────────
create or replace function public.news_increment_view(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.team_news set view_count = view_count + 1 where id = p_id and status = 'published';
end $$;

-- ── (12) 관리자 대시보드 카운트 ─────────────────────────────────────────────
create or replace function public.news_dashboard_counts()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  return jsonb_build_object(
    'draft',     (select count(*) from public.team_news where status='draft'),
    'published', (select count(*) from public.team_news where status='published'),
    'scheduled', (select count(*) from public.team_news where status='scheduled'),
    'archived',  (select count(*) from public.team_news where status='archived'),
    'pinned',    (select count(*) from public.team_news where pinned),
    'today',     (select count(*) from public.team_news where status='published' and updated_at >= date_trunc('day', now())),
    'this_week', (select count(*) from public.team_news where status='published' and updated_at >= date_trunc('week', now())),
    'ai_pending',(select count(*) from public.news_ai_queue where status='pending')
  );
end $$;

-- ── (13) 실행 권한 ──────────────────────────────────────────────────────────
revoke all on function public.news_transition_status(uuid, text, timestamptz) from public;
revoke all on function public.news_set_pinned(uuid, boolean) from public;
revoke all on function public.news_dashboard_counts() from public;
grant execute on function public.news_transition_status(uuid, text, timestamptz) to authenticated, service_role;
grant execute on function public.news_set_pinned(uuid, boolean) to authenticated, service_role;
grant execute on function public.news_autopublish() to authenticated, service_role; -- 진입/조회 시 관리자·서비스 호출
grant execute on function public.news_increment_view(uuid) to authenticated, service_role;
grant execute on function public.news_dashboard_counts() to authenticated, service_role;

-- ── (14) Storage: news-images 공개 버킷(관리자 쓰기, 공개 읽기) ──────────────
insert into storage.buckets (id, name, public) values ('news-images','news-images', true)
  on conflict (id) do nothing;
drop policy if exists "news images public read" on storage.objects;
create policy "news images public read" on storage.objects for select using (bucket_id = 'news-images');
drop policy if exists "news images admin insert" on storage.objects;
create policy "news images admin insert" on storage.objects for insert with check (bucket_id = 'news-images' and public.is_admin());
drop policy if exists "news images admin update" on storage.objects;
create policy "news images admin update" on storage.objects for update using (bucket_id = 'news-images' and public.is_admin());
drop policy if exists "news images admin delete" on storage.objects;
create policy "news images admin delete" on storage.objects for delete using (bucket_id = 'news-images' and public.is_admin());
