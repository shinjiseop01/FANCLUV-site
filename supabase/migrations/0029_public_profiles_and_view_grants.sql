-- ============================================================================
-- FANCLUV — 0029_public_profiles_and_view_grants.sql
-- 공개 프로필 뷰(안전 컬럼만) + 집계 뷰 조회 권한 보정.
--
-- 배경 1) 작성자 닉네임 조회 불가:
--   opinions/comments/reports 등은 author_id/reporter_id 가 auth.users 를 참조한다.
--   PostgREST 는 이들에서 public.profiles 를 직접 임베드(조인)할 수 없어 조회가
--   에러가 났고(→ 댓글/신고 목록이 빈 채로 표시), 설령 임베드가 되더라도 profiles
--   RLS 가 "본인만 조회(auth.uid()=id)"라 타인의 닉네임을 읽을 수 없다.
--
-- 조치: 닉네임/아바타 같은 "공개해도 안전한" 컬럼만 노출하는 뷰를 만든다.
--   security_invoker=false(정의자 권한) 로 동작해 profiles RLS 를 우회하되,
--   이메일/성별/나이대 등 개인정보 컬럼은 절대 포함하지 않는다. 앱은 작성자
--   닉네임이 필요할 때 이 뷰를 별도 조회해 조립한다(임베드 미사용).
--
-- 배경 2) 집계 뷰(opinions_view/surveys_view)가 라이브에서 빈 결과:
--   security_invoker 뷰가 마이그레이션(postgres)으로 생성될 때 authenticated/anon
--   에 SELECT 권한이 자동 부여되지 않는 경우가 있어 PostgREST 조회가 권한 오류가
--   된다. 명시적으로 SELECT 를 부여한다(멱등 — 이미 있으면 무해).
-- ============================================================================

-- (1) 공개 프로필 뷰 — 안전 컬럼(id/nickname/avatar_url)만. 개인정보 미포함.
create or replace view public.public_profiles
with (security_invoker = false) as
select id, nickname, avatar_url
from public.profiles;

grant select on public.public_profiles to anon, authenticated;

-- (2) 집계 뷰 SELECT 권한 보정(멱등).
grant select on public.opinions_view to anon, authenticated;
grant select on public.surveys_view  to anon, authenticated;
