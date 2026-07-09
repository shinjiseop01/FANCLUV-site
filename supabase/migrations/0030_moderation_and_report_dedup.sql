-- ============================================================================
-- FANCLUV — 0030_moderation_and_report_dedup.sql
-- (1) 관리자 모더레이션 정책, (2) 중복 신고 방지.
--
-- 배경 1) 관리자 숨김/삭제 실패:
--   기존 opinions/comments 의 update/delete RLS 는 "본인만"(auth.uid()=author_id).
--   그래서 관리자가 남의 의견/댓글을 숨김(status='hidden')·삭제하는 moderateTarget
--   (reportsRepo)이 라이브에서 실패했다. is_admin() 관리자에게 update/delete 를
--   허용하는 PERMISSIVE 정책을 추가한다(기존 본인 정책과 OR 로 결합 → 본인+관리자).
--
-- 배경 2) 중복 신고:
--   같은 사용자가 같은 대상을 여러 번 신고할 수 있었다. (reporter_id, target_type,
--   target_id) 부분 unique 인덱스로 1회로 제한한다. 앱은 위반(23505) 시 "이미 신고"
--   로 안내한다(reportsRepo.submitReport).
--   ⚠️ 이미 중복 행이 있으면 인덱스 생성이 실패한다. 그 경우 아래 정리 쿼리로
--      중복을 먼저 제거한 뒤 재실행하라(주석 참고).
-- ============================================================================

-- (1) 관리자 모더레이션 — 의견
drop policy if exists "admins update opinions" on public.opinions;
create policy "admins update opinions"
  on public.opinions for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete opinions" on public.opinions;
create policy "admins delete opinions"
  on public.opinions for delete using (public.is_admin());

-- (1) 관리자 모더레이션 — 댓글
drop policy if exists "admins update comments" on public.comments;
create policy "admins update comments"
  on public.comments for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete comments" on public.comments;
create policy "admins delete comments"
  on public.comments for delete using (public.is_admin());

-- (2) 중복 신고 방지 (같은 사용자 × 같은 대상 = 1회)
-- 이미 중복이 있어 실패하면 먼저 정리:
--   delete from public.reports r using public.reports r2
--   where r.ctid < r2.ctid and r.reporter_id = r2.reporter_id
--     and r.target_type = r2.target_type and r.target_id = r2.target_id;
create unique index if not exists reports_reporter_target_uidx
  on public.reports (reporter_id, target_type, target_id)
  where reporter_id is not null and target_id is not null;
