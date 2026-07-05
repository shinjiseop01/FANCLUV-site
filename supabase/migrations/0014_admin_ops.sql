-- 0014_admin_ops.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 관리자 운영 기능 고도화
--   1) notices 확장 : 중요 공지 / 노출 기간 / 상단 고정(pin) / 숨김
--   2) admin_notes  : 회원·의견·댓글·신고에 다는 운영자 전용 내부 메모
--
-- reports.status 는 text 라 'rejected'(반려) 값을 앱에서 추가 사용(스키마 변경 불필요).
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. 공지(notices) 확장 ──
alter table public.notices add column if not exists is_important boolean not null default false;
alter table public.notices add column if not exists pinned       boolean not null default false;
alter table public.notices add column if not exists hidden       boolean not null default false;
alter table public.notices add column if not exists start_at     date;
alter table public.notices add column if not exists end_at       date;
alter table public.notices add column if not exists updated_at    timestamptz not null default now();

-- 홈 화면 노출용 조회 최적화 (고정 → 중요 → 최신 순)
create index if not exists notices_active_idx
  on public.notices (hidden, pinned desc, is_important desc, created_at desc);

-- 알림 broadcast 트리거: 숨김 상태로 만든 공지는 알림을 생성하지 않는다.
create or replace function public.notify_on_notice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.hidden then
    return NEW;
  end if;
  insert into public.notifications (user_id, type, title, body, url)
  select p.id, 'notice', NEW.title, NEW.body, null
    from public.profiles p
   where NEW.team_id is null or p.selected_team = NEW.team_id;
  return NEW;
end $$;

-- ── 2. 관리자 내부 메모(admin_notes) ──
-- entity_type: 'member' | 'opinion' | 'comment' | 'report'
-- entity_id  : 대상 레코드 id(text — uuid/mock id 모두 수용)
create table if not exists public.admin_notes (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id   text not null,
  body        text not null,
  author_id   uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists admin_notes_entity_idx
  on public.admin_notes (entity_type, entity_id, created_at desc);

alter table public.admin_notes enable row level security;

-- 운영자만 조회/작성/수정/삭제 가능 → 일반 사용자에게 절대 노출되지 않는다.
drop policy if exists "admins read notes"   on public.admin_notes;
create policy "admins read notes"   on public.admin_notes for select using (public.is_admin());
drop policy if exists "admins insert notes" on public.admin_notes;
create policy "admins insert notes" on public.admin_notes for insert with check (public.is_admin() and auth.uid() = author_id);
drop policy if exists "admins update notes" on public.admin_notes;
create policy "admins update notes" on public.admin_notes for update using (public.is_admin());
drop policy if exists "admins delete notes" on public.admin_notes;
create policy "admins delete notes" on public.admin_notes for delete using (public.is_admin());
