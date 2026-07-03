-- ============================================================================
-- FANCLUV — 0011_reports_notices.sql  (신고 접수 / 관리자 공지)
-- Supabase 대시보드 → SQL Editor 에서 실행하세요. (0010 이후)
--
--  1) reports  : 팬이 접수한 신고를 관리자가 확인/처리
--  2) notices  : 관리자 공지 → 트리거가 대상 팬에게 'notice' 알림 생성
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════
--  1. 신고 (reports)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  target_type   text not null,                       -- 'opinion' | 'comment'
  target_id     text,                                -- 신고 대상 id
  target_excerpt text,                               -- 신고 시점의 대상 내용 스냅샷
  reporter_id   uuid references auth.users (id) on delete set null,  -- 신고자
  reason        text not null,                       -- 사유 코드 (abuse/ad/false/…)
  detail        text,                                -- '기타' 선택 시 직접 입력 내용
  status        text not null default 'pending',     -- 'pending' | 'resolved'
  created_at    timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);
alter table public.reports enable row level security;

-- 접수: 로그인 사용자는 본인 명의로 신고 생성 가능
drop policy if exists "authenticated insert reports" on public.reports;
create policy "authenticated insert reports"
  on public.reports for insert
  with check (auth.uid() = reporter_id);

-- 조회 / 처리 / 삭제: 관리자만 (is_admin() — 0005 에서 정의)
drop policy if exists "admins read reports" on public.reports;
create policy "admins read reports"
  on public.reports for select using (public.is_admin());
drop policy if exists "admins update reports" on public.reports;
create policy "admins update reports"
  on public.reports for update using (public.is_admin());
drop policy if exists "admins delete reports" on public.reports;
create policy "admins delete reports"
  on public.reports for delete using (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════
--  2. 관리자 공지 (notices)
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.notices (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  team_id     text,                                  -- 대상 구단 id (null = 전체)
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists notices_created_idx on public.notices (created_at desc);
alter table public.notices enable row level security;

-- 조회: 로그인 사용자 / 등록·수정·삭제: 관리자만
drop policy if exists "notices readable by authenticated" on public.notices;
create policy "notices readable by authenticated"
  on public.notices for select using (auth.role() = 'authenticated');
drop policy if exists "admins insert notices" on public.notices;
create policy "admins insert notices"
  on public.notices for insert with check (public.is_admin());
drop policy if exists "admins update notices" on public.notices;
create policy "admins update notices"
  on public.notices for update using (public.is_admin());
drop policy if exists "admins delete notices" on public.notices;
create policy "admins delete notices"
  on public.notices for delete using (public.is_admin());

-- 관리자 공지 등록 시 대상 팬(또는 전체)에게 'notice' 알림 생성.
-- url 은 비워두고 body 에 공지 본문을 담아, 클라이언트가 알림 클릭 시 모달로 표시한다.
create or replace function public.notify_on_notice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, url)
  select p.id, 'notice', NEW.title, NEW.body, null
  from public.profiles p
  where NEW.team_id is null or p.selected_team = NEW.team_id;
  return NEW;
end $$;
drop trigger if exists trg_notify_notice on public.notices;
create trigger trg_notify_notice after insert on public.notices
  for each row execute function public.notify_on_notice();
