-- ============================================================================
-- FANCLUV — 0045_notification_system.sql
--
-- 알림 시스템 완성:
--   (1) profiles.notification_prefs (jsonb) — 알림 종류별 수신 설정을 서버에 저장.
--       기존엔 localStorage 뿐이라 DB 트리거가 설정을 무시했다(OFF 해도 생성됨).
--   (2) 알림 생성 트리거(comment/like/survey/news)가 수신자의 notification_prefs 를
--       존중하도록 갱신 — OFF 인 종류는 아예 생성하지 않는다.
--   (3) notify_admins() RPC (SECURITY DEFINER) — 운영 알림을 관리자에게 안전 생성.
--       (기존 클라이언트 직접 insert 는 notifications 에 insert RLS 정책이 없어
--        차단되어 조용히 실패했다. 이제 이 RPC 로 일원화 → 직접 insert 금지.)
--   (4) notifications DELETE 정책 — 사용자가 본인 알림을 삭제할 수 있게.
--
-- prefs 키 = 알림 type 과 동일: comment | like | survey | news | notice
-- ============================================================================

-- (1) 알림 설정 컬럼 (기본 전부 수신).
alter table public.profiles
  add column if not exists notification_prefs jsonb not null
    default '{"comment":true,"like":true,"survey":true,"news":true,"notice":true}'::jsonb;

comment on column public.profiles.notification_prefs is
  '알림 종류별 수신 설정. 키=알림 type(comment/like/survey/news/notice), 값=boolean. 미설정 종류는 수신(true)로 간주.';

-- 수신자 pref 확인 헬퍼: 해당 type 이 명시적으로 false 가 아니면 true.
create or replace function public.wants_notification(p_user uuid, p_type text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (notification_prefs ->> p_type)::boolean from public.profiles where id = p_user),
    true);
$$;

-- (2) 트리거 갱신 — 수신자 설정 존중.

-- 내 의견에 댓글 (본인 댓글 제외 + 수신자가 comment 알림 ON)
create or replace function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select author_id, team_id, id into o from public.opinions where id = NEW.opinion_id;
  if o.author_id is not null and o.author_id <> NEW.author_id
     and public.wants_notification(o.author_id, 'comment') then
    insert into public.notifications (user_id, type, title, body, url)
    values (o.author_id, 'comment', '새 댓글', '내 의견에 새 댓글이 달렸습니다.',
            '/club/' || o.team_id || '/opinions/' || o.id);
  end if;
  return NEW;
end $$;

-- 내 의견에 공감 (본인 공감 제외 + 수신자가 like 알림 ON)
create or replace function public.notify_on_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select author_id, team_id, id into o from public.opinions where id = NEW.opinion_id;
  if o.author_id is not null and o.author_id <> NEW.user_id
     and public.wants_notification(o.author_id, 'like') then
    insert into public.notifications (user_id, type, title, body, url)
    values (o.author_id, 'like', '새 공감', '내 의견에 공감이 추가되었습니다.',
            '/club/' || o.team_id || '/opinions/' || o.id);
  end if;
  return NEW;
end $$;

-- 새 설문 → 대상 구단 팬 중 survey 알림 ON 인 사람만
create or replace function public.notify_on_survey()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, url)
  select p.id, 'survey', '새 설문', NEW.title,
         case when NEW.team_id is not null then '/club/' || NEW.team_id || '/survey/' || NEW.id else null end
  from public.profiles p
  where (NEW.team_id is null or p.selected_team = NEW.team_id)
    and coalesce((p.notification_prefs ->> 'survey')::boolean, true);
  return NEW;
end $$;

-- 새 팀 뉴스 → 대상 구단 팬 중 news 알림 ON 인 사람만
create or replace function public.notify_on_news()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, url)
  select p.id, 'news', '새 팀 뉴스', NEW.title,
         case when NEW.team_id is not null then '/club/' || NEW.team_id || '/news/' || NEW.id else null end
  from public.profiles p
  where (NEW.team_id is null or p.selected_team = NEW.team_id)
    and coalesce((p.notification_prefs ->> 'news')::boolean, true);
  return NEW;
end $$;

-- (3) 운영 알림 → 관리자 전원(SECURITY DEFINER). 클라이언트 직접 insert 대체.
create or replace function public.notify_admins(p_type text, p_title text, p_body text, p_url text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  -- 호출자는 관리자여야 한다(운영 알림 스팸 방지).
  if not public.is_admin() then
    return 0;
  end if;
  insert into public.notifications (user_id, type, title, body, url)
  select id, coalesce(p_type, 'notice'), p_title, p_body, p_url
  from public.profiles
  where role::text in ('admin', 'superadmin', 'staff');
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.notify_admins(text, text, text, text) from public;
grant execute on function public.notify_admins(text, text, text, text) to authenticated;

-- (4) 본인 알림 삭제 허용.
drop policy if exists "delete own notifications" on public.notifications;
create policy "delete own notifications"
  on public.notifications for delete using (auth.uid() = user_id);
