-- FANCLUV — 닉네임 사용가능 확인 RPC(익명 호출 가능, 프로필 데이터 미노출) — 0073
--
-- 문제(회귀): 회원가입 화면의 닉네임 중복 사전검사가 profiles 를 직접 SELECT 하는데,
-- profiles RLS 는 "own profile is viewable(auth.uid()=id)" 라 미로그인(anon) 사용자는
-- 타인 닉네임을 볼 수 없어 항상 "사용 가능"으로 오판 → 중복 안내가 안 뜨고 제출이 진행됨.
-- (최종적으로 DB UNIQUE(0072)가 막지만 UX 가 깨짐.)
--
-- 해결: SECURITY DEFINER 로 nickname_normalized(정규화) 존재 여부만 boolean 으로 반환.
-- 개별 프로필 데이터는 노출하지 않는다. anon/authenticated 에 execute 부여.
-- 기존 0072(normalize_identity_text, UNIQUE)를 재사용하며 스키마는 변경하지 않는다.
begin;

create or replace function public.nickname_available(p_nickname text, p_exclude_id uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.profiles
     where nickname_normalized = public.normalize_identity_text(p_nickname)
       and nickname_normalized is not null
       and (p_exclude_id is null or id <> p_exclude_id)
  )
$$;

comment on function public.nickname_available(text, uuid) is
  '닉네임 사용가능 여부(정규화 기준). true=사용가능. 프로필 데이터 미노출. 익명 호출 허용.';

revoke all on function public.nickname_available(text, uuid) from public;
grant execute on function public.nickname_available(text, uuid) to anon, authenticated, service_role;

commit;
