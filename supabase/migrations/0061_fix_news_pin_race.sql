-- ============================================================================
-- FANCLUV — 0061_fix_news_pin_race.sql  (Phase 13 검증 중 발견 버그 수정)
--
-- 버그(스테이징 실측): 고정(pinned) 최대 3개 제한이 동시성에 안전하지 않았다.
--   tg_news_pin_limit 이 잠금 없이 `count(*) where pinned` 만 확인 → 20개 동시 pin 요청에서
--   여러 트랜잭션이 서로의 커밋 전 스냅샷을 읽어 모두 통과 → 10개가 고정됨(최대 3 초과).
--
-- 수정: pin 을 켜는 경로를 advisory lock 으로 직렬화한다. pin 은 관리자·저빈도(최대 3)라
--   경합이 사실상 없어 비용이 무시할 수준이며, 잠금 획득 후 count 가 최신 커밋을 반영해
--   정확히 3개로 강제된다.
-- ============================================================================
create or replace function public.tg_news_pin_limit()
returns trigger language plpgsql set search_path = public as $$
begin
  -- 고정 슬롯(3개)에 대한 전역 직렬화 — 동시 pin 요청 간 phantom read 방지.
  perform pg_advisory_xact_lock(hashtextextended('team_news_pin_slots', 0));
  if (select count(*) from public.team_news where pinned and id <> NEW.id) >= 3 then
    raise exception 'pin_limit: 최대 3개까지 고정할 수 있습니다' using errcode = 'check_violation';
  end if;
  return NEW;
end $$;
