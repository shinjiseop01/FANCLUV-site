-- ============================================================================
-- FANCLUV — 0026_identity_verification.sql  (본인인증 PASS/NICE/KCB — CI/DI)
--   (1) profiles 에 본인인증 컬럼 추가 (여부/시각/기관/CI/DI만 — 민감정보 없음)
--   (2) 동일 CI 중복가입 방지 (unique)
--   (3) claim_identity RPC (중복확인 + 저장, CI 비교는 서버에서 수행)
--   (4) is_identity_verified() + 핵심 기능(의견/댓글/설문) insert 정책에 게이트 추가
-- Supabase 대시보드 → SQL Editor 에서 실행하세요. (0001 이후 언제든)
-- ============================================================================

-- (1) 본인인증 컬럼 — 주민등록번호/이름/휴대폰 등 민감정보는 저장하지 않는다.
alter table public.profiles
  add column if not exists identity_verified    boolean not null default false,
  add column if not exists identity_verified_at timestamptz,
  add column if not exists identity_provider    text,   -- 'pass' | 'nice' | 'kcb' | 'mock'
  add column if not exists identity_ci           text,   -- 연계정보(CI) — 업체 권장 식별값
  add column if not exists identity_di           text;   -- 중복가입확인정보(DI)

comment on column public.profiles.identity_ci is '본인인증 CI (동일인 식별). 하나의 CI = 하나의 계정.';

-- (2) 동일 CI 는 하나의 계정만(중복가입 방지). NULL 은 제외(부분 인덱스).
create unique index if not exists profiles_identity_ci_unique
  on public.profiles (identity_ci) where identity_ci is not null;

-- (3) 본인인증 저장 RPC — 클라이언트가 CI/DI 를 넘기면 서버에서 중복확인 후 본인 프로필에 저장.
--   • CI 비교/저장이 서버(SECURITY DEFINER)에서 이뤄져 클라이언트는 남의 CI 를 읽지 않는다.
--   • 실 Provider(운영)는 identity-verify Edge Function 이 CI/DI 를 직접 저장하므로 이 RPC
--     는 Mock Provider(개발) + Supabase 조합에서 사용된다.
create or replace function public.claim_identity(p_ci text, p_di text, p_agency text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  existing uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  end if;
  if p_ci is null or length(trim(p_ci)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;
  -- 동일 CI 가 다른 계정에 이미 있으면 중복.
  select id into existing
    from public.profiles
    where identity_ci = p_ci and id <> auth.uid()
    limit 1;
  if existing is not null then
    return jsonb_build_object('ok', false, 'code', 'duplicate');
  end if;
  update public.profiles
    set identity_verified = true,
        identity_verified_at = now(),
        identity_provider = coalesce(p_agency, 'unknown'),
        identity_ci = p_ci,
        identity_di = p_di,
        -- 본인인증 완료 = 휴대폰 인증 완료로 간주(기존 verification_status 체계와 매핑).
        verification_status = 'phone_verified'
    where id = auth.uid();
  return jsonb_build_object('ok', true);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'code', 'duplicate');
end;
$$;

revoke all on function public.claim_identity(text, text, text) from public;
grant execute on function public.claim_identity(text, text, text) to authenticated;

-- (4) 본인인증 여부 판정 함수 — 관리자/구단 계정은 면제(운영자 발급).
create or replace function public.is_identity_verified()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select p.identity_verified or p.role::text in ('admin', 'club')
       from public.profiles p where p.id = auth.uid()),
    false)
$$;

-- ── 핵심 기능 insert 정책에 본인인증 게이트 추가(이중 방어) ──
-- 미인증 계정은 팬 의견/댓글/설문 응답을 작성할 수 없다. (뉴스 등 읽기는 그대로 허용)
drop policy if exists "insert own opinion" on public.opinions;
create policy "insert own opinion"
  on public.opinions for insert
  with check (auth.uid() = author_id and public.is_identity_verified());

drop policy if exists "insert own comment" on public.comments;
create policy "insert own comment"
  on public.comments for insert
  with check (auth.uid() = author_id and public.is_identity_verified());

drop policy if exists "insert own response" on public.survey_responses;
create policy "insert own response"
  on public.survey_responses for insert
  with check (auth.uid() = user_id and public.is_identity_verified());

-- ============================================================================
-- 실 Provider(PASS/NICE/KCB) 사용 시:
--   identity-verify Edge Function(service_role)이 업체 API 로 CI/DI 를 받아
--   중복확인 후 위 컬럼에 직접 저장한다. 클라이언트는 CI/DI 원문을 받지 않는다.
--   배포: supabase functions deploy identity-verify
--   시크릿(업체별): supabase secrets set IDENTITY_VENDOR=nice \
--     IDENTITY_CLIENT_ID=... IDENTITY_CLIENT_SECRET=... IDENTITY_SITE_URL=...
-- ============================================================================
