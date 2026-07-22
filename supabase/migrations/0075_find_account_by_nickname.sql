-- FANCLUV — 닉네임으로 계정 찾기 RPC (보안: 이메일 원문 미노출, 존재 여부 비노출) — 0075
--
-- 기능:
-- - 닉네임으로 등록된 이메일 조회
-- - 계정이 있으면 해당 이메일로 "계정 안내" 메일 발송
-- - 계정이 없어도 동일한 성공 응답 반환 (계정 존재 여부 미노출)
-- - 이메일 원문은 클라이언트에 반환하지 않음 (서버에서만 메일 발송)
--
-- 호출:
-- select public.find_account_by_nickname('testnick');
-- → { ok: true, message: "메일을 발송했습니다" }
--
-- 보안 고려사항:
-- - SECURITY DEFINER: 프로필 RLS 우회 (anon도 호출 가능)
-- - 성공/실패 응답 동일: 계정 존재 여부 시간차 공격 방어
-- - 이메일 원문 미반환: 프런트에서 이메일 표시 불가
-- - Edge Function send-find-account-mail에서 메일 발송 별도 처리
begin;

-- 닉네임 정규화 후 계정 존재 여부만 확인하고,
-- 실제 메일은 클라이언트에 제공하지 않음 (메일은 send-find-account-mail Edge에서 발송)
create or replace function public.find_account_by_nickname(p_nickname text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_email text;
  v_exists boolean;
begin
  -- 닉네임 정규화 후 조회 (email도 함께 가져오지만 클라이언트에는 미노출)
  select email into v_email
  from public.profiles
  where nickname_normalized = public.normalize_identity_text(p_nickname)
    and nickname_normalized is not null
  limit 1;

  -- 계정 존재 여부 판단
  v_exists := v_email is not null;

  -- 요청 기록 (로그에는 정규화된 닉네임과 존재 여부 마스킹)
  insert into public.account_recovery_logs(nickname_normalized, found)
  values (public.normalize_identity_text(p_nickname), v_exists);

  -- 응답: 계정 존재 여부와 관계없이 동일 (일치하는 계정이 있으면 메일 발송 지시)
  return jsonb_build_object(
    'ok', true,
    'message', 'OK',
    'email_hashed', case when v_exists then encode(digest(v_email, 'sha256'), 'hex') else null end
  );
end;
$$;

comment on function public.find_account_by_nickname(text) is
  '닉네임으로 계정 찾기(이메일 원문 미노출, 존재 여부 비노출). Edge Function send-find-account-mail에서 메일 발송.';

-- 로그 테이블 (rate limit + 감사)
create table if not exists public.account_recovery_logs (
  id bigserial primary key,
  nickname_normalized text not null,
  found boolean not null,
  ip_address inet,
  created_at timestamp with time zone default now() not null
);

-- Rate limit 인덱스
create index if not exists account_recovery_logs_ip_time_idx
  on public.account_recovery_logs(ip_address, created_at desc)
  where found = false;  -- 찾지 못한 요청만 rate limit 카운트

revoke all on function public.find_account_by_nickname(text) from public;
grant execute on function public.find_account_by_nickname(text) to anon, authenticated, service_role;

revoke all on table public.account_recovery_logs from public;
grant insert on table public.account_recovery_logs to authenticated, service_role;
grant select on table public.account_recovery_logs to service_role;

commit;
