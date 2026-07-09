-- ============================================================================
-- FANCLUV — 0036_activity_events_and_realtime.sql
-- (1) 활동 이벤트 로그 테이블  (2) Realtime publication 등록.
--
-- 내 활동 "최근 활동"이 작성/수정/삭제/댓글/공감/공감취소/설문참여/신고 등 모든
-- 행위를 최신순으로 보여주려면, 행(row)만으로는 삭제/취소/수정을 표현할 수 없다.
-- → 사용자별 활동 이벤트를 append-only 로 기록하는 activity_events 를 둔다.
-- 또한 관리자 대시보드/내 활동이 새로고침 없이 즉시 갱신되도록 관련 테이블을
-- Supabase Realtime publication 에 추가한다.
-- ============================================================================

-- (1) 활동 이벤트 로그
create table if not exists public.activity_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  type        text not null,           -- opinion_create/opinion_update/opinion_delete/
                                        -- comment_create/comment_update/comment_delete/
                                        -- like_add/like_remove/survey_join/report_submit
  entity_type text,                     -- opinion | comment | survey | report
  entity_id   text,
  team_id     text,
  title       text,                     -- 대상 제목 스냅샷(원본 삭제돼도 표시 유지)
  created_at  timestamptz not null default now()
);
create index if not exists activity_events_user_created_idx
  on public.activity_events (user_id, created_at desc);

alter table public.activity_events enable row level security;

drop policy if exists "own activity readable" on public.activity_events;
create policy "own activity readable"
  on public.activity_events for select using (auth.uid() = user_id);
drop policy if exists "insert own activity" on public.activity_events;
create policy "insert own activity"
  on public.activity_events for insert with check (auth.uid() = user_id);

grant select, insert on table public.activity_events to authenticated;
grant select, insert on table public.activity_events to service_role;

-- (2) Realtime publication 등록 (이미 등록돼 있으면 무시)
do $$
declare t text;
begin
  foreach t in array array[
    'opinions','comments','likes','reports','survey_responses','activity_events','profiles'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;   -- 이미 등록됨
      when undefined_object then null;   -- publication 없음(로컬 등) — 무시
    end;
  end loop;
end $$;
