-- ============================================================================
-- FANCLUV — 0063_pulse_fan_closed_read.sql  (Phase 16 — 팬 UI 지원)
--
-- 팬 Fan Pulse 목록은 "진행중(active) + 종료(closed)"를 함께 보여준다(종료 후 결과 열람).
-- 0062 의 pulse_topics_read 는 active 만 허용했으므로 closed(공개)도 조회 가능하도록 확장.
--   • active/closed + public → 팬 조회 가능
--   • archived → 팬 미노출(관리자만)
--   • 투표는 여전히 status='active' 에서만(pulse_vote), closed 는 읽기전용 결과.
-- ============================================================================
drop policy if exists pulse_topics_read on public.pulse_topics;
create policy pulse_topics_read on public.pulse_topics for select
  using ((status in ('active','closed') and visibility = 'public') or public.is_admin());
