-- FANCLUV — 구단 액션 결과 메모 (Club Action Tracker).
--
-- 운영자가 Action 결과/후속 계획을 기록하는 메모. Club Action Tracker 에서 편집한다.
alter table public.club_actions
  add column if not exists result_note text;

comment on column public.club_actions.result_note is 'Club Action Tracker 운영자 결과 메모.';
