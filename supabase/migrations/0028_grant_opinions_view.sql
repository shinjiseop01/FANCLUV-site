-- ============================================================================
-- FANCLUV — 0028_grant_opinions_view.sql
-- opinions_view 조회 권한 보정.
--
-- 배경: 팬 의견을 저장(public.opinions insert)하면 DB 에는 정상 저장되지만,
--   목록/홈/프로필의 일부 조회가 public.opinions_view 를 통해 이뤄질 때 라이브에서
--   행이 반환되지 않는 문제가 있었다. security_invoker 뷰가 마이그레이션(postgres)
--   으로 생성될 때 authenticated/anon 역할에 SELECT 권한이 자동 부여되지 않는
--   경우가 있어, PostgREST 조회가 권한 오류로 빈 결과가 되기 때문이다.
--
-- 조치: 뷰에 대한 SELECT 권한을 명시적으로 부여한다(멱등 — 이미 있으면 무해).
--   기반 테이블(opinions/likes/comments/profiles)은 RLS + 기존 권한으로 정상
--   동작하므로 뷰 권한만 보정한다. RLS 는 뷰(security_invoker)에서 그대로 적용된다.
--
-- 참고: 앱의 팬 의견 목록/상세는 이제 base 테이블(public.opinions)을 직접 읽어
--   뷰에 의존하지 않는다(opinionsRepo.js). 이 마이그레이션은 여전히 뷰를 쓰는
--   홈 인기 콘텐츠(homeRepo)·프로필 통계(profileStatsRepo)를 위한 보정이다.
-- ============================================================================

grant select on public.opinions_view to anon, authenticated;
