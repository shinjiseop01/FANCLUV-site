-- 0015_notice_important.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 관리자 공지를 홈 화면 카드가 아니라 "알림센터에서만" 노출한다.
-- 알림센터에서 중요 공지 여부를 표시할 수 있도록 notifications 에 is_important 추가하고,
-- 공지 broadcast 트리거가 notice 의 중요도를 알림으로 전달하게 한다.
-- (홈 배너는 클라이언트에서 제거 — 스키마 변경 아님)
-- ─────────────────────────────────────────────────────────────────────────

alter table public.notifications add column if not exists is_important boolean not null default false;

create or replace function public.notify_on_notice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.hidden then
    return NEW;
  end if;
  insert into public.notifications (user_id, type, title, body, url, is_important)
  select p.id, 'notice', NEW.title, NEW.body, null, NEW.is_important
    from public.profiles p
   where NEW.team_id is null or p.selected_team = NEW.team_id;
  return NEW;
end $$;
