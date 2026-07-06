-- 0017_report_delivery.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 구단 전달(Delivery) 이력 확장.
--
-- 승인된 리포트를 구단에 "전달"할 때, 전달 방식/메모/리포트 제목까지 이력으로 남긴다.
--   report_title : 전달 시점의 리포트 제목 스냅샷
--   method       : 'pdf' | 'email' | 'link' (이메일/링크는 구조만 — 실제 전송 미구현)
--   memo         : 운영자 전달 메모 (PDF 마지막 페이지에도 포함 가능)
--
-- club_reports 에도 전달 방식/메모를 함께 보관해 재조회/PDF 재생성에 사용한다.
-- 두 테이블 모두 기존 RLS(is_admin 전용) 유지.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.report_deliveries add column if not exists report_title text;
alter table public.report_deliveries add column if not exists method       text default 'pdf';
alter table public.report_deliveries add column if not exists memo         text;

alter table public.club_reports add column if not exists delivery_method text;
alter table public.club_reports add column if not exists delivery_memo   text;
