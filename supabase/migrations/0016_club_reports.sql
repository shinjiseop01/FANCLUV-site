-- 0016_club_reports.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 구단 전달용 리포트 관리 워크플로우.
--
-- FANCLUV 운영자가 팬 데이터를 분석·검토한 뒤 구단에 "정리된 리포트"만 전달하는 구조.
-- 리포트 본문(content)에는 집계/요약/분석 결과만 담기며 개인정보(이메일·닉네임·원본 의견 등)는
-- 절대 저장하지 않는다(애플리케이션에서 집계 필드만 스냅샷).
--
--   club_reports      : 리포트 문서(초안→검토중→승인됨→전달완료) + 편집 가능한 content(jsonb)
--   report_deliveries : "전달 완료" 시 전달 기록(전달일·대상 구단·리포트 ID·처리 운영자)
--
-- 접근: 두 테이블 모두 RLS 로 is_admin() 만 허용 → 일반 사용자/구단은 접근 불가.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.club_reports (
  id           uuid primary key default gen_random_uuid(),
  team_id      text not null,                       -- 대상 구단 id
  title        text not null,
  period_type  text not null default 'monthly',     -- current | monthly | quarterly | yearly
  period_label text,                                 -- 분석 기간 표시 라벨
  status       text not null default 'draft',        -- draft | review | approved | delivered
  -- 편집 가능한 리포트 본문(집계/요약만). 개인정보 없음:
  --   summary, sentiment{positive,neutral,negative}, keywords[], categories[],
  --   satisfaction, suggestions[], kpi{}, operatorComment, finalSummary
  content      jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  delivered_at timestamptz,
  delivered_by text                                  -- 처리한 운영자(닉네임 스냅샷)
);
create index if not exists club_reports_team_idx on public.club_reports (team_id, created_at desc);

create table if not exists public.report_deliveries (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid references public.club_reports (id) on delete cascade,
  team_id      text not null,
  operator     text,                                 -- 처리 운영자(닉네임)
  delivered_at timestamptz not null default now()
);
create index if not exists report_deliveries_report_idx on public.report_deliveries (report_id, delivered_at desc);

alter table public.club_reports enable row level security;
alter table public.report_deliveries enable row level security;

-- 운영자(admin)만 접근 — 구단/일반 사용자는 원본은 물론 리포트 문서도 직접 접근 불가.
drop policy if exists "admins all club_reports" on public.club_reports;
create policy "admins all club_reports" on public.club_reports
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins all deliveries" on public.report_deliveries;
create policy "admins all deliveries" on public.report_deliveries
  for all using (public.is_admin()) with check (public.is_admin());
