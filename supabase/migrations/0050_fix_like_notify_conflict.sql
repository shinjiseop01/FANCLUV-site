-- ============================================================================
-- FANCLUV — 0050_fix_like_notify_conflict.sql  (P1 버그 수정)
--
-- 문제: 0048 의 notify_on_like 트리거가
--   INSERT ... ON CONFLICT (user_id, dedup_key) DO NOTHING
-- 를 사용하는데, dedup 인덱스(notifications_user_dedup_uidx)는 **부분 유니크 인덱스**
--   (... WHERE dedup_key IS NOT NULL) 라서, ON CONFLICT 추론이 predicate 없이는
--   해당 인덱스를 매칭하지 못해 42P10("no unique or exclusion constraint matching
--   the ON CONFLICT specification") 로 실패했다.
--   → 트리거가 실패하면서 **likes INSERT 전체가 롤백(400)** → 공감 기능이 깨졌다.
--   (스테이징 Smoke 에서 fan-b 공감 400 으로 발견.)
--
-- 수정: ON CONFLICT 에 부분 인덱스와 동일한 predicate 를 명시해 인덱스를 추론시킨다.
--   ON CONFLICT (user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
-- ============================================================================
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
    on conflict (user_id, dedup_key) where dedup_key is not null do nothing;
  end if;
  return NEW;
end $$;
