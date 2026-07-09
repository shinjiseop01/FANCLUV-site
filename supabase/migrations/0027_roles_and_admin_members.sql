-- ============================================================================
-- FANCLUV — 0027_roles_and_admin_members.sql
--   (1) user_role enum 확장: superadmin / staff / club / club_admin
--   (2) is_admin() 보강: admin/superadmin/staff 를 관리자로 판정
--   (3) 관리자 회원 목록 조회 RPC(admin_list_members) — 관리자만
--   (4) 회원 활성/비활성 RPC(admin_set_member_deactivated) — 관리자만
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
--
-- ⚠️ (1) 의 `alter type ... add value` 가 같은 트랜잭션 제약으로 에러가 나면,
--    (1) 4줄만 먼저 개별 실행한 뒤 (2)~(4) 를 실행하세요. is_admin/RPC 는 role::text
--    비교라 새 enum 값을 "사용"하지 않아 안전합니다.
-- ============================================================================

-- (1) 역할 enum 확장 — 기존 profiles.role(user_role) 에 값 추가.
alter type public.user_role add value if not exists 'superadmin';
alter type public.user_role add value if not exists 'staff';
alter type public.user_role add value if not exists 'club';
alter type public.user_role add value if not exists 'club_admin';

-- (2) is_admin(): 관리자 계열(admin/superadmin/staff). role::text 비교로 enum 트랜잭션 제약 회피.
--   club/club_admin(구단 계정)은 관리자가 아니다 → 관리자 데이터/콘솔 접근 불가.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role::text in ('admin', 'superadmin', 'staff')
  );
$$;

-- (3) 관리자 회원 목록 — 관리자만 전체 조회(비관리자는 빈 결과). profiles RLS 는 본인만이지만
--   이 함수는 SECURITY DEFINER 로 is_admin() 통과 시에만 전체를 반환한다(개인정보 최소 필드).
create or replace function public.admin_list_members()
returns table (
  id                  uuid,
  nickname            text,
  email               text,
  joined_at           timestamptz,
  team                text,
  status              text,
  role                text,
  verification_status text,
  identity_verified   boolean,
  provider            text,
  gender              text,
  age_group           text,
  last_active_at      timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select
    p.id, p.nickname, p.email, p.created_at, p.selected_team,
    case when p.deactivated_at is not null then 'inactive' else 'active' end,
    p.role::text, p.verification_status::text, coalesce(p.identity_verified, false),
    p.provider, p.gender, p.age_group, p.updated_at
  from public.profiles p
  where public.is_admin()
  order by p.created_at desc
  limit 1000
$$;

revoke all on function public.admin_list_members() from public;
grant execute on function public.admin_list_members() to authenticated;

-- (4) 회원 활성/비활성(deactivated_at) — 관리자만. 비활성 계정은 로그인 차단(loadCurrentSupabaseUser).
create or replace function public.admin_set_member_deactivated(p_id uuid, p_deactivated boolean)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  update public.profiles
     set deactivated_at = case when p_deactivated then now() else null end,
         updated_at = now()
   where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_set_member_deactivated(uuid, boolean) from public;
grant execute on function public.admin_set_member_deactivated(uuid, boolean) to authenticated;

-- ============================================================================
-- 검증:
--   select proname from pg_proc where proname in
--     ('is_admin','admin_list_members','admin_set_member_deactivated');
--   -- 관리자 계정으로 로그인 후 앱 /admin/members 에서 실제 profiles 목록이 보이는지 확인.
-- ============================================================================
