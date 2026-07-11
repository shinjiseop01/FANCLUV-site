-- ============================================================================
-- FANCLUV — 0048_like_notification_dedup.sql
-- 공감 알림 중복 방지. likes 는 unique(opinion_id,user_id) 라 동시 like 는 1행이나,
-- like → unlike → re-like 시 트리거가 다시 발화해 알림이 중복 생성될 수 있었다.
--
-- 정책: (recipient=opinion 작성자) + (actor=liker) + opinion + type=like 조합은
--   알림 1개만 유지(재공감 시 새 알림 없음). 서로 다른 사용자의 공감은 각각 유지.
-- 구현: notifications.dedup_key + 부분 unique index + ON CONFLICT DO NOTHING.
-- ============================================================================
alter table public.notifications add column if not exists dedup_key text;

-- 같은 (수신자, dedup_key) 는 1개만. dedup_key NULL(기존/일반 알림)은 제약 대상 아님.
create unique index if not exists notifications_user_dedup_uidx
  on public.notifications (user_id, dedup_key) where dedup_key is not null;

-- 공감 알림: 수신자별 'like:<opinion>:<actor>' 키로 중복 차단.
create or replace function public.notify_on_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select author_id, team_id, id into o from public.opinions where id = NEW.opinion_id;
  if o.author_id is not null and o.author_id <> NEW.user_id
     and public.wants_notification(o.author_id, 'like') then
    insert into public.notifications (user_id, type, title, body, url, dedup_key)
    values (o.author_id, 'like', '새 공감', '내 의견에 공감이 추가되었습니다.',
            '/club/' || o.team_id || '/opinions/' || o.id,
            'like:' || o.id::text || ':' || NEW.user_id::text)
    on conflict (user_id, dedup_key) do nothing;  -- 재공감 시 중복 알림 방지
  end if;
  return NEW;
end $$;
