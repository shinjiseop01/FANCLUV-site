-- ============================================================================
-- FANCLUV — 0057_identity_verification_platform.sql
--   본인인증(PASS/NICE/KCB) 플랫폼: 검증 세션/상태 모델 + DI 기반 1인1계정 연결 +
--   관리자 관측(원문 미노출). 0026(CI unique/claim_identity)·0044(di_hash unique/
--   linked_providers)를 확장한다. 원문(주민번호/CI/DI/토큰/시크릿)은 저장하지 않는다.
--
-- 핵심:
--   (1) identity_verifications: 인증 세션/시도 상태(pending/verified/failed/expired/blocked)
--       + nonce(replay 방지, UNIQUE) + expires_at. di_hash/ci 원문 미저장(존재여부만).
--   (2) start/complete/fail/expire RPC: 상태 전이 exactly-once(compare-and-set).
--   (3) link_identity_by_di: 동일 di_hash 가 다른 계정에 있으면 그 계정에 provider 를
--       연결(1인1계정, 신규계정 생성 안 함). 없으면 본인 계정에 di_hash 저장.
--   (4) admin_identity_status: 관리자 관측 — provider/status/di_hash 존재여부/실패횟수만.
-- 모든 RPC 는 SECURITY DEFINER + search_path 고정 + 최소 실행권한.
-- ============================================================================

-- ── 검증 세션/시도 상태 ──
create table if not exists public.identity_verifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  provider       text not null,                       -- pass | nice | kcb | mock
  status         text not null default 'pending'
                 check (status in ('pending', 'verified', 'failed', 'expired', 'blocked')),
  nonce          text not null unique,                -- replay 방지(1회용)
  di_hash        text,                                -- 성공 시 연결에 사용(원문 아님)
  ci_present     boolean not null default false,      -- CI 원문 저장 안 함, 존재여부만
  failure_reason text,
  expires_at     timestamptz not null,
  verified_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idv_user_idx    on public.identity_verifications (user_id, created_at desc);
create index if not exists idv_status_idx  on public.identity_verifications (status);

alter table public.identity_verifications enable row level security;
revoke all on public.identity_verifications from anon, authenticated;
-- 본인은 자기 세션 상태만 조회(원문 컬럼 없음). 쓰기는 RPC/service_role 만.
create policy idv_self_read on public.identity_verifications for select
  using (auth.uid() = user_id);
grant select on public.identity_verifications to authenticated;

-- ── 세션 시작: pending 생성(+nonce). ──
create or replace function public.start_identity_verification(p_provider text, p_nonce text, p_ttl_seconds integer default 300)
returns table(session_id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_exp timestamptz := now() + make_interval(secs => greatest(coalesce(p_ttl_seconds, 300), 30)); v_id uuid;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if p_nonce is null or length(p_nonce) < 8 then raise exception 'invalid_nonce' using errcode = '22023'; end if;
  insert into public.identity_verifications(user_id, provider, nonce, expires_at)
  values (v_uid, coalesce(nullif(p_provider, ''), 'mock'), p_nonce, v_exp)
  returning id into v_id;
  session_id := v_id; expires_at := v_exp; return next;
end $$;

-- ── 완료: pending→verified 전이 성공 요청만 DI 연결 수행(exactly-once). ──
-- 반환: { ok, code: verified|linked|duplicate|expired|invalid|already, canonical_id }
create or replace function public.complete_identity_verification(
  p_session uuid, p_nonce text, p_di_hash text, p_ci_present boolean, p_provider text, p_provider_user_id text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_row public.identity_verifications; v_existing uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'unauthorized'); end if;
  -- 세션 검증(본인·nonce 일치·pending). 만료면 expired 로 전이.
  select * into v_row from public.identity_verifications where id = p_session and user_id = v_uid;
  if not found or v_row.nonce is distinct from p_nonce then return jsonb_build_object('ok', false, 'code', 'invalid'); end if;
  if v_row.status = 'verified' then return jsonb_build_object('ok', true, 'code', 'already'); end if;
  if v_row.status <> 'pending' then return jsonb_build_object('ok', false, 'code', v_row.status); end if;
  if now() > v_row.expires_at then
    update public.identity_verifications set status = 'expired', updated_at = now() where id = p_session and status = 'pending';
    return jsonb_build_object('ok', false, 'code', 'expired');
  end if;
  if p_di_hash is null or length(p_di_hash) < 16 then return jsonb_build_object('ok', false, 'code', 'invalid'); end if;

  -- pending→verified compare-and-set (동시요청 1개만 성공).
  update public.identity_verifications
     set status = 'verified', di_hash = p_di_hash, ci_present = coalesce(p_ci_present, false), verified_at = now(), updated_at = now()
   where id = p_session and status = 'pending'
   returning * into v_row;
  if not found then return jsonb_build_object('ok', true, 'code', 'already'); end if;

  -- DI 기반 1인1계정: 동일 di_hash 가 다른 계정에 있으면 그 계정에 provider 연결.
  select id into v_existing from public.profiles where identity_di_hash = p_di_hash and id <> v_uid limit 1;
  if v_existing is not null then
    update public.profiles
       set linked_providers = case
             when linked_providers @> jsonb_build_array(jsonb_build_object('provider', p_provider, 'provider_user_id', p_provider_user_id))
               then linked_providers
             else linked_providers || jsonb_build_array(jsonb_build_object(
               'provider', coalesce(p_provider, 'unknown'), 'provider_user_id', p_provider_user_id, 'linked_at', now(), 'linked_via', 'identity_di'))
           end,
           updated_at = now()
     where id = v_existing;
    return jsonb_build_object('ok', true, 'code', 'linked', 'canonical_id', v_existing);
  end if;

  -- 신규 DI: 본인 계정에 저장(0044 di_hash UNIQUE 가 1인1계정 강제).
  update public.profiles
     set identity_verified = true, identity_verified_at = now(), identity_provider = coalesce(p_provider, 'unknown'),
         identity_di_hash = p_di_hash,
         verification_status = 'phone_verified',
         linked_providers = case
           when linked_providers @> jsonb_build_array(jsonb_build_object('provider', p_provider, 'provider_user_id', p_provider_user_id))
             then linked_providers
           else linked_providers || jsonb_build_array(jsonb_build_object(
             'provider', coalesce(p_provider, 'unknown'), 'provider_user_id', p_provider_user_id, 'linked_at', now(), 'linked_via', 'identity_di'))
         end,
         updated_at = now()
   where id = v_uid;
  return jsonb_build_object('ok', true, 'code', 'verified', 'canonical_id', v_uid);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'code', 'duplicate');
end $$;

-- ── 실패: pending→failed(사유 코드만). 실패 누적 5회 이상이면 blocked. ──
create or replace function public.fail_identity_verification(p_session uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_fail int;
begin
  if v_uid is null then return; end if;
  update public.identity_verifications
     set status = 'failed', failure_reason = left(coalesce(p_reason, 'unknown'), 100), updated_at = now()
   where id = p_session and user_id = v_uid and status = 'pending';
  select count(*) into v_fail from public.identity_verifications where user_id = v_uid and status = 'failed' and created_at > now() - interval '1 hour';
  if v_fail >= 5 then
    update public.identity_verifications set status = 'blocked', updated_at = now()
     where user_id = v_uid and status = 'pending';
  end if;
end $$;

-- ── 만료 housekeeping: pending 중 만료된 것 expired 로. (관리자/스케줄 호출용) ──
create or replace function public.expire_identity_verifications()
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with u as (update public.identity_verifications set status = 'expired', updated_at = now()
             where status = 'pending' and now() > expires_at returning 1)
  select count(*) into n from u; return n;
end $$;

-- ── 관리자 관측: provider/status/di_hash 존재여부/실패횟수 (원문 미노출) ──
create or replace function public.admin_identity_status(p_limit integer default 100)
returns table(user_id uuid, latest_status text, provider text, di_present boolean, ci_present boolean,
              failure_count bigint, verified_at timestamptz, last_attempt_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id,
         (select v.status from public.identity_verifications v where v.user_id = p.id order by v.created_at desc limit 1),
         p.identity_provider,
         (p.identity_di_hash is not null),
         (p.identity_ci is not null),
         (select count(*) from public.identity_verifications v where v.user_id = p.id and v.status = 'failed'),
         p.identity_verified_at,
         (select max(v.created_at) from public.identity_verifications v where v.user_id = p.id)
  from public.profiles p
  where public.is_admin()
    and (p.identity_verified or exists (select 1 from public.identity_verifications v where v.user_id = p.id))
  order by p.identity_verified_at desc nulls last
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

-- ── 실행권한 최소화 ──
revoke all on function public.start_identity_verification(text, text, integer) from public;
revoke all on function public.complete_identity_verification(uuid, text, text, boolean, text, text) from public;
revoke all on function public.fail_identity_verification(uuid, text) from public;
revoke all on function public.expire_identity_verifications() from public;
revoke all on function public.admin_identity_status(integer) from public;
-- 본인이 자기 세션을 시작/완료/실패 처리(원문은 서버 계산). 관측은 관리자.
grant execute on function public.start_identity_verification(text, text, integer) to authenticated, service_role;
grant execute on function public.complete_identity_verification(uuid, text, text, boolean, text, text) to authenticated, service_role;
grant execute on function public.fail_identity_verification(uuid, text) to authenticated, service_role;
grant execute on function public.expire_identity_verifications() to service_role;
grant execute on function public.admin_identity_status(integer) to authenticated, service_role;
