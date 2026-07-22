-- FANCLUV — 회원가입 이메일·닉네임 중복 방지(Race-safe DB 강제) — 0072
--
-- 목표: 어떤 클라이언트가 어떤 순서로 몇 번 요청하든 동일 이메일/닉네임이 profiles 에
-- 중복 저장되지 않도록 DB UNIQUE 로 최종 강제한다. 정규화 기준: NFC + trim + lower(§5,§6).
-- NFKC(전각 폴딩)는 도입하지 않는다(요구 기준=NFC). 기존 migration 은 수정하지 않는다.
--
-- 사전 감사(staging): profiles=10, normalized email dup=0, nickname dup=0, null=0 → 안전.
-- 기존 이미 존재: profiles_email_unique(lower(email)) — 대소문자는 막지만 trim/NFC 는 미포함.
--   → 아래 email_normalized(NFC+trim+lower) UNIQUE 로 공백/유니코드 변형까지 강화(중복 인덱스는
--     무해한 상위집합). 닉네임은 UNIQUE 가 전무했으므로 신규 도입.
-- 재사용 정책: 탈퇴(deactivated_at)·병합(merged_into) 계정의 이메일/닉네임도 인덱스에 포함하여
--   보수적으로 재사용을 막는다(계정복구·감사·사칭방지·DI 통합 대비, §7.4).
begin;

-- ── 1) 정규화 generated 컬럼(immutable: normalize/btrim/lower) ──
-- 빈 문자열/NULL 은 NULL 로 귀결시켜 부분 UNIQUE 에서 자연히 제외되게 한다.
alter table public.profiles
  add column if not exists email_normalized text
    generated always as (nullif(lower(btrim(normalize(email, NFC))), '')) stored,
  add column if not exists nickname_normalized text
    generated always as (nullif(lower(btrim(normalize(nickname, NFC))), '')) stored;

-- ── 2) 부분 UNIQUE 인덱스(최종 강제) ──
create unique index if not exists profiles_email_norm_uk
  on public.profiles (email_normalized) where email_normalized is not null;
create unique index if not exists profiles_nickname_norm_uk
  on public.profiles (nickname_normalized) where nickname_normalized is not null;

comment on column public.profiles.email_normalized is 'NFC+trim+lower canonical email — 중복 차단 기준(generated).';
comment on column public.profiles.nickname_normalized is 'NFC+trim+lower canonical nickname — 중복 차단 기준(generated).';

-- ── 3) 정규화 헬퍼(서버 공용 — 애플리케이션에서 참조 가능) ──
create or replace function public.normalize_identity_text(p text)
returns text language sql immutable strict set search_path = public as $$
  select nullif(lower(btrim(normalize(p, NFC))), '')
$$;

-- ── 4) complete_signup RPC — 트랜잭션 원자성·idempotent·Race-safe·명확한 conflict code ──
-- 신뢰 기준: auth.uid()/auth.jwt(email). 클라이언트가 준 user_id/email 은 신뢰하지 않는다.
-- 프로필은 auth.users 트리거(handle_new_user)로 이미 생성되어 있으므로 여기서는 닉네임/프로필
-- 확정만 원자적으로 수행한다. 닉네임 UNIQUE 위반은 500 이 아니라 NICKNAME_ALREADY_TAKEN 으로.
create or replace function public.complete_signup(
  p_nickname text, p_gender text default null, p_age_group text default null, p_team text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_nick_norm text := public.normalize_identity_text(p_nickname);
  v_disp text := btrim(coalesce(p_nickname, ''));
  r public.profiles%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED'); end if;
  if v_nick_norm is null or char_length(v_nick_norm) < 2 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_NICKNAME'); end if;

  select * into r from public.profiles where id = v_uid;
  if not found then
    -- 트리거가 아직 프로필을 안 만든 극단 상황 → 원자 insert(이메일 정규화는 generated 컬럼이 처리).
    begin
      insert into public.profiles (id, email, nickname, gender, age_group, selected_team, is_email_verified)
      values (v_uid, v_email, v_disp, p_gender, p_age_group, p_team, true);
    exception
      when unique_violation then
        -- 어떤 유니크가 깨졌는지 구분(이메일 vs 닉네임)
        if exists (select 1 from public.profiles where nickname_normalized = v_nick_norm and id <> v_uid)
          then return jsonb_build_object('ok', false, 'code', 'NICKNAME_ALREADY_TAKEN');
          else return jsonb_build_object('ok', false, 'code', 'EMAIL_ALREADY_REGISTERED'); end if;
    end;
    return jsonb_build_object('ok', true, 'code', 'SIGNUP_COMPLETED', 'nickname', v_disp);
  end if;

  -- Idempotent: 이미 같은 닉네임으로 완료된 계정의 재호출 → 동일 성공 반환.
  if r.nickname_normalized = v_nick_norm and coalesce(r.is_email_verified, false) then
    return jsonb_build_object('ok', true, 'code', 'SIGNUP_ALREADY_COMPLETED', 'nickname', r.nickname);
  end if;

  -- 프로필 확정(닉네임/성별/나이대/팀) — 닉네임 UNIQUE 로 Race-safe(동시엔 1개만 성공).
  begin
    update public.profiles
       set nickname = v_disp,
           gender = coalesce(p_gender, gender),
           age_group = coalesce(p_age_group, age_group),
           selected_team = coalesce(p_team, selected_team),
           is_email_verified = true,
           updated_at = now()
     where id = v_uid;
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'code', 'NICKNAME_ALREADY_TAKEN');
  end;
  return jsonb_build_object('ok', true, 'code', 'SIGNUP_COMPLETED', 'nickname', v_disp);
end $$;

revoke all on function public.complete_signup(text,text,text,text) from public, anon;
grant execute on function public.complete_signup(text,text,text,text) to authenticated, service_role;
revoke all on function public.normalize_identity_text(text) from public;
grant execute on function public.normalize_identity_text(text) to authenticated, service_role;

commit;
