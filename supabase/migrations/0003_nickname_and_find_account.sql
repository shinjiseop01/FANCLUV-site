-- ============================================================================
-- FANCLUV — 0003_nickname_and_find_account.sql
--   (1) 닉네임 변경 쿨다운 컬럼
--   (2) 아이디 찾기 서버 함수(RPC) — 클라이언트가 전체 유저를 조회하지 못하게 함
-- Supabase 대시보드 → SQL Editor 에서 실행하세요.
-- ============================================================================

-- (1) 닉네임 변경 쿨다운 (3개월에 1회) 기준 시각
alter table public.profiles
  add column if not exists nickname_updated_at timestamptz;

-- ── 이메일 마스킹 헬퍼 ── 예) fan@gmail.com → fan****@gmail.com
create or replace function public.mask_email(email text)
returns text
language sql
immutable
as $$
  select case
    when email is null or position('@' in email) = 0 then email
    else left(split_part(email, '@', 1), least(3, length(split_part(email, '@', 1))))
         || '****@' || split_part(email, '@', 2)
  end;
$$;

-- (2) 아이디 찾기 — 이메일 또는 닉네임(정확히 일치)으로 계정을 찾아 마스킹된 이메일만 반환.
-- SECURITY DEFINER 로 서버에서 조회하므로, 클라이언트는 profiles 전체를 읽지 않는다
-- (profiles RLS 는 본인 것만 노출 → 타인 조회는 이 함수로만 가능).
create or replace function public.find_account_by_hint(hint text)
returns table (masked_email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  found_email text;
  q text := lower(trim(coalesce(hint, '')));
begin
  if q = '' then
    return;
  end if;
  select email into found_email
    from public.profiles
   where lower(email) = q or lower(nickname) = q
   limit 1;
  if found_email is null then
    return;
  end if;
  return query select public.mask_email(found_email);
end;
$$;

-- 로그인 전(anon) 화면에서도 호출하므로 anon/authenticated 에 실행 권한 부여.
grant execute on function public.find_account_by_hint(text) to anon, authenticated;
