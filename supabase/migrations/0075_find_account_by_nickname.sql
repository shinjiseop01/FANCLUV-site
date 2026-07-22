-- FANCLUV — 닉네임으로 계정 찾기 (enumeration-safe) — 0075
--
-- ┌─ 보안 설계 원칙 ──────────────────────────────────────────────────────────┐
-- │ • 클라이언트는 계정 존재 여부를 절대 알 수 없어야 한다.                    │
-- │ • 존재 여부를 드러내는 조회는 service_role 에게만 허용(anon/authenticated  │
-- │   호출 불가) → 직접 RPC 호출로 enumeration 하는 경로를 원천 차단.          │
-- │ • 실제 메일 발송/응답은 Edge Function(send-find-account-mail)이 service_   │
-- │   role 로 내부 처리하며, 계정 유무와 무관하게 항상 { ok: true } 만 반환.   │
-- └────────────────────────────────────────────────────────────────────────────┘
--
-- ⚠️ 이전 설계(find_account_by_nickname → email_hashed 반환)는 email_hashed 의
--    null 여부로 계정 존재를 구분할 수 있어 account enumeration 취약점이 있었다.
--    → 해당 anon-callable 함수를 폐기하고, service_role 전용 내부 함수로 대체한다.
begin;

-- 0) 이전 enumeration 취약 함수 폐기(존재 시). anon 이 호출해 존재 여부를 구분하던 경로 제거.
drop function if exists public.find_account_by_nickname(text);

-- 1) 요청 감사 + rate limit 로그.
--    원문 닉네임을 저장하지 않고 정규화 닉네임의 sha256 해시만 보관(개인정보 최소화).
create table if not exists public.account_recovery_logs (
  id            bigserial primary key,
  nickname_hash text        not null,   -- md5(normalize_identity_text(nickname)) — 원문 미저장
  found         boolean     not null,   -- 내부 감사용(클라이언트에는 절대 노출 안 함)
  ip_address    inet,                    -- rate limit 용(Edge가 전달)
  created_at    timestamptz not null default now()
);

-- rate limit 조회 인덱스(IP + 최근순).
create index if not exists account_recovery_logs_ip_time_idx
  on public.account_recovery_logs(ip_address, created_at desc);

-- 2) service_role 전용 내부 조회 함수.
--    닉네임으로 이메일을 찾아 반환(존재 시 email, 없으면 null)하고 시도를 로깅한다.
--    ⚠️ 존재 여부(=반환 email 유무)를 드러내므로 service_role 에게만 execute 를 부여한다.
--       anon/authenticated 는 호출할 수 없어 클라이언트 enumeration 이 불가능하다.
create or replace function public.find_account_email_internal(
  p_nickname text,
  p_ip       inet default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm  text := public.normalize_identity_text(p_nickname);
  v_email text;
begin
  if v_norm is null or length(v_norm) = 0 then
    return null;
  end if;

  select email into v_email
  from public.profiles
  where nickname_normalized = v_norm
    and nickname_normalized is not null
  limit 1;

  -- 감사/rate limit 로그(원문 미저장 — md5 해시만; core 내장 함수라 extension 불필요).
  insert into public.account_recovery_logs(nickname_hash, found, ip_address)
  values (md5(v_norm), v_email is not null, p_ip);

  return v_email; -- service_role 내부에서만 사용(Edge가 메일 발송에 사용, 클라이언트 미노출)
end;
$$;

comment on function public.find_account_email_internal(text, inet) is
  '아이디 찾기 내부 조회(service_role 전용). 닉네임→이메일 반환+시도 로깅. 클라이언트 호출 불가(enumeration 방지). 메일 발송은 send-find-account-mail Edge에서.';

-- 3) 권한: service_role 만. anon/authenticated/public 은 명시적으로 회수.
revoke all on function public.find_account_email_internal(text, inet) from public;
revoke all on function public.find_account_email_internal(text, inet) from anon, authenticated;
grant  execute on function public.find_account_email_internal(text, inet) to service_role;

-- 로그 테이블도 service_role 만 접근(클라이언트가 found 통계로 enumeration 하지 못하도록).
revoke all on table public.account_recovery_logs from public;
revoke all on table public.account_recovery_logs from anon, authenticated;
grant  select, insert on table public.account_recovery_logs to service_role;
grant  usage, select on sequence public.account_recovery_logs_id_seq to service_role;

commit;
