-- ============================================================================
-- FANCLUV — 0049_perf_indexes.sql
-- 성능 인덱스 — 실제 쿼리 술어와 정확히 일치하는 것만 추가(추측 없음).
-- ⚠️ 근거: 아래는 코드상 쿼리가 그대로 사용하는 필터/그룹 컬럼. 다만 현재 베타
--    데이터 규모가 작아 EXPLAIN ANALYZE 로 스케일 이득을 실측하진 못함(스테이징 필요).
--    술어-일치 부분 인덱스라 스케일에서 seq scan → index scan 으로 개선될 근거가 명확.
-- 소량 테이블이라 CREATE INDEX 즉시 완료(락 우려 없음).
-- ============================================================================

-- (1) 미읽음 알림 카운트: notificationsRepo.unreadCount 이
--     .eq('user_id', me).eq('is_read', false).count(head) 로 매 페이지(벨 배지) 호출.
--     기존 (user_id, created_at desc) 는 is_read 를 커버하지 못함 → 부분 인덱스.
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where is_read = false;

-- (2)/(3) fan_ranking(0041): opinions/comments 를 status='visible' 로 필터 후
--     author_id 로 group by. 전체 스캔 그룹핑 → 술어-일치 부분 인덱스로 개선.
create index if not exists opinions_visible_author_idx
  on public.opinions (author_id)
  where status = 'visible';

create index if not exists comments_visible_author_idx
  on public.comments (author_id)
  where status = 'visible';
