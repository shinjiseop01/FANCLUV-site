-- ============================================================================
-- FANCLUV — 0004_opinions_comments_likes.sql  (2차 이관: 팬 의견 / 댓글 / 공감)
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- ============================================================================

-- ── 팬 의견 ──
create table if not exists public.opinions (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references auth.users (id) on delete cascade,
  team_id     text not null,                       -- 구단 id (teams.jsx)
  category    text,                                -- 경기장 / 응원문화 / 티켓 ...
  rating      smallint check (rating between 1 and 5),
  title       text not null,
  body        text not null,
  has_photo   boolean not null default false,
  status      text not null default 'visible',     -- 'visible' | 'hidden'
  created_at  timestamptz not null default now()
);
create index if not exists opinions_team_created_idx on public.opinions (team_id, created_at desc);
alter table public.opinions enable row level security;

drop policy if exists "opinions readable by authenticated" on public.opinions;
create policy "opinions readable by authenticated"
  on public.opinions for select using (auth.role() = 'authenticated');
drop policy if exists "insert own opinion" on public.opinions;
create policy "insert own opinion"
  on public.opinions for insert with check (auth.uid() = author_id);
drop policy if exists "update own opinion" on public.opinions;
create policy "update own opinion"
  on public.opinions for update using (auth.uid() = author_id);
drop policy if exists "delete own opinion" on public.opinions;
create policy "delete own opinion"
  on public.opinions for delete using (auth.uid() = author_id);

-- ── 댓글 ──
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  opinion_id  uuid not null references public.opinions (id) on delete cascade,
  author_id   uuid not null references auth.users (id) on delete cascade,
  content     text not null,
  status      text not null default 'visible',     -- 'visible' | 'hidden'
  created_at  timestamptz not null default now()
);
create index if not exists comments_opinion_created_idx on public.comments (opinion_id, created_at);
alter table public.comments enable row level security;

drop policy if exists "comments readable by authenticated" on public.comments;
create policy "comments readable by authenticated"
  on public.comments for select using (auth.role() = 'authenticated');
drop policy if exists "insert own comment" on public.comments;
create policy "insert own comment"
  on public.comments for insert with check (auth.uid() = author_id);
drop policy if exists "update own comment" on public.comments;
create policy "update own comment"
  on public.comments for update using (auth.uid() = author_id);
drop policy if exists "delete own comment" on public.comments;
create policy "delete own comment"
  on public.comments for delete using (auth.uid() = author_id);

-- ── 공감(좋아요) ── 한 사용자당 한 의견에 1회만 (unique). 취소는 delete.
create table if not exists public.likes (
  id          uuid primary key default gen_random_uuid(),
  opinion_id  uuid not null references public.opinions (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (opinion_id, user_id)
);
create index if not exists likes_opinion_idx on public.likes (opinion_id);
alter table public.likes enable row level security;

drop policy if exists "likes readable by authenticated" on public.likes;
create policy "likes readable by authenticated"
  on public.likes for select using (auth.role() = 'authenticated');
drop policy if exists "insert own like" on public.likes;
create policy "insert own like"
  on public.likes for insert with check (auth.uid() = user_id);
drop policy if exists "delete own like" on public.likes;
create policy "delete own like"
  on public.likes for delete using (auth.uid() = user_id);

-- ── 집계 뷰 ── 목록에서 N+1 없이 작성자 + 공감수 + 댓글수를 한 번에 조회.
-- security_invoker=true 로 조회자의 RLS 를 그대로 적용한다.
create or replace view public.opinions_view
with (security_invoker = true) as
select
  o.*,
  p.nickname  as author_nickname,
  p.avatar_url as author_avatar,
  (select count(*) from public.likes l where l.opinion_id = o.id) as likes_count,
  (select count(*) from public.comments c
     where c.opinion_id = o.id and c.status = 'visible') as comments_count
from public.opinions o
left join public.profiles p on p.id = o.author_id;
