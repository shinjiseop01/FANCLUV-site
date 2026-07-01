-- ============================================================================
-- FANCLUV — 0006_news_notifications.sql  (팀 뉴스 / 알림 이관)
-- Supabase 대시보드 → SQL Editor 에서 실행하세요. (0005 이후)
-- ============================================================================

-- ── 팀 뉴스 ──
create table if not exists public.team_news (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  content      text not null,
  team_id      text,                                -- 대상 구단 id (null = 전체)
  category     text,                                -- 구단 공지 / 경기 / 선수 ...
  image_url    text,                                -- 대표 이미지 URL
  author_id    uuid references auth.users (id) on delete set null,  -- 작성자
  status       text not null default 'published',   -- 'published' | 'hidden'
  is_important boolean not null default false,       -- 중요 뉴스 여부
  created_at   timestamptz not null default now()    -- 작성일
);
create index if not exists team_news_team_idx on public.team_news (team_id, created_at desc);
alter table public.team_news enable row level security;

-- 조회: 로그인 사용자 / 등록·수정·삭제: 관리자만 (is_admin() — 0005 에서 정의)
drop policy if exists "news readable by authenticated" on public.team_news;
create policy "news readable by authenticated"
  on public.team_news for select using (auth.role() = 'authenticated');
drop policy if exists "admins insert news" on public.team_news;
create policy "admins insert news"
  on public.team_news for insert with check (public.is_admin());
drop policy if exists "admins update news" on public.team_news;
create policy "admins update news"
  on public.team_news for update using (public.is_admin());
drop policy if exists "admins delete news" on public.team_news;
create policy "admins delete news"
  on public.team_news for delete using (public.is_admin());

-- ── 알림 ──
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       text not null,                          -- 'comment' | 'like' | 'survey' | 'news'
  title      text not null,
  body       text,
  url        text,                                   -- 연결 URL
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;

-- 본인 알림만 조회/수정(읽음 처리). 생성은 아래 트리거(SECURITY DEFINER)가 담당.
drop policy if exists "read own notifications" on public.notifications;
create policy "read own notifications"
  on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "update own notifications" on public.notifications;
create policy "update own notifications"
  on public.notifications for update using (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════
--  알림 생성 트리거 (SECURITY DEFINER → 타 사용자 알림도 안전하게 생성)
-- ════════════════════════════════════════════════════════════════════════

-- 내 의견에 댓글이 달리면 작성자에게 알림 (본인 댓글 제외)
create or replace function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select author_id, team_id, id into o from public.opinions where id = NEW.opinion_id;
  if o.author_id is not null and o.author_id <> NEW.author_id then
    insert into public.notifications (user_id, type, title, body, url)
    values (o.author_id, 'comment', '새 댓글', '내 의견에 새 댓글이 달렸습니다.',
            '/club/' || o.team_id || '/opinions/' || o.id);
  end if;
  return NEW;
end $$;
drop trigger if exists trg_notify_comment on public.comments;
create trigger trg_notify_comment after insert on public.comments
  for each row execute function public.notify_on_comment();

-- 내 의견에 공감이 추가되면 작성자에게 알림 (본인 공감 제외)
create or replace function public.notify_on_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select author_id, team_id, id into o from public.opinions where id = NEW.opinion_id;
  if o.author_id is not null and o.author_id <> NEW.user_id then
    insert into public.notifications (user_id, type, title, body, url)
    values (o.author_id, 'like', '새 공감', '내 의견에 공감이 추가되었습니다.',
            '/club/' || o.team_id || '/opinions/' || o.id);
  end if;
  return NEW;
end $$;
drop trigger if exists trg_notify_like on public.likes;
create trigger trg_notify_like after insert on public.likes
  for each row execute function public.notify_on_like();

-- 새 설문 등록 시 대상 구단 팬(또는 전체)에게 알림
create or replace function public.notify_on_survey()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, url)
  select p.id, 'survey', '새 설문', NEW.title,
         case when NEW.team_id is not null then '/club/' || NEW.team_id || '/survey' else null end
  from public.profiles p
  where NEW.team_id is null or p.selected_team = NEW.team_id;
  return NEW;
end $$;
drop trigger if exists trg_notify_survey on public.surveys;
create trigger trg_notify_survey after insert on public.surveys
  for each row execute function public.notify_on_survey();

-- 새 팀 뉴스 등록 시 대상 구단 팬(또는 전체)에게 알림
create or replace function public.notify_on_news()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, url)
  select p.id, 'news', '새 팀 뉴스', NEW.title,
         case when NEW.team_id is not null then '/club/' || NEW.team_id || '/news/' || NEW.id else null end
  from public.profiles p
  where NEW.team_id is null or p.selected_team = NEW.team_id;
  return NEW;
end $$;
drop trigger if exists trg_notify_news on public.team_news;
create trigger trg_notify_news after insert on public.team_news
  for each row execute function public.notify_on_news();
