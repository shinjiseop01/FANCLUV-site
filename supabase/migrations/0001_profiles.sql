-- ============================================================================
-- FANCLUV — 0001_profiles.sql  (1차 이관: Auth + Profile)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.
-- ============================================================================

-- 사용자 역할 (user / admin). 관리자 콘솔 접근 판정에 사용.
do $$ begin
  create type public.user_role as enum ('user', 'admin');
exception when duplicate_object then null; end $$;

-- 이메일/본인인증 상태 (앱의 VERIFICATION 체계와 매핑).
do $$ begin
  create type public.verification_status as enum ('unverified', 'email_verified', 'phone_verified');
exception when duplicate_object then null; end $$;

-- ── 프로필 테이블 ──
-- auth.users(1) ↔ profiles(1). 앱에서 필요한 사용자 프로필 정보를 담는다.
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text,
  nickname            text not null default 'FANCLUV 팬',
  selected_team       text,                          -- 응원팀 id (teams.jsx의 id)
  gender              text,                           -- 'male' | 'female' | 'na' | null
  age_group           text,                           -- '10' | '20' | '30' | '40' | '50+'
  avatar_url          text,                           -- 프로필 이미지 URL
  role                public.user_role not null default 'user',
  verification_status public.verification_status not null default 'unverified',
  is_email_verified   boolean not null default false,
  provider            text,                           -- 'email' | 'google' | 'kakao' | 'naver'
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.profiles is 'FANCLUV 사용자 프로필 (auth.users 1:1)';

-- ── Row Level Security ──
alter table public.profiles enable row level security;

-- 본인 프로필만 조회/수정. (관리자 정책은 다음 단계에서 확장)
drop policy if exists "own profile is viewable" on public.profiles;
create policy "own profile is viewable"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "own profile is updatable" on public.profiles;
create policy "own profile is updatable"
  on public.profiles for update
  using (auth.uid() = id);

-- ── 신규 가입 시 프로필 자동 생성 ──
-- auth.users 에 사용자가 생기면 회원가입 시 넘긴 메타데이터로 프로필 row 를 만든다.
-- (signUp options.data 로 nickname/gender/age_group/provider 를 전달)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, nickname, gender, age_group, provider, is_email_verified, verification_status)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'nickname', ''), split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'gender',
    new.raw_user_meta_data ->> 'age_group',
    coalesce(new.raw_user_meta_data ->> 'provider', 'email'),
    new.email_confirmed_at is not null,
    case when new.email_confirmed_at is not null then 'email_verified'::verification_status
         else 'unverified'::verification_status end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 이메일 인증 완료 시 프로필 동기화 ──
-- auth.users.email_confirmed_at 이 채워지면 프로필의 인증 상태를 갱신한다.
create or replace function public.handle_email_confirmed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.email_confirmed_at is not null and (old.email_confirmed_at is null) then
    update public.profiles
      set is_email_verified = true,
          verification_status = 'email_verified',
          updated_at = now()
      where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update on auth.users
  for each row execute function public.handle_email_confirmed();

-- ── updated_at 자동 갱신 ──
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 관리자 계정 만들기 (선택):
--   1) 앱/대시보드에서 이메일로 가입
--   2) 아래 실행 (이메일을 본인 것으로 교체)
--      update public.profiles set role = 'admin'
--       where email = 'admin@fancluv.kr';
-- ============================================================================
