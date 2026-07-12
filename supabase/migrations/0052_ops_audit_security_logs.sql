-- ============================================================================
-- FANCLUV — 0052_ops_audit_security_logs.sql  (운영 로그 체계: Audit / Security)
--
-- 목적: 운영 로그를 4계층(Error / Warning / Audit / Security)으로 나눈다.
--   - Error/Warning: 애플리케이션 로그(logger.js) → Sentry/원격 sink + 콘솔.
--   - Audit: 관리자/운영 행위 감사(누가 무엇을 했는가). 본 테이블 audit_logs.
--   - Security: 보안 이벤트(로그인 실패/권한 거부/비정상 접근). 본 테이블 security_events.
--
-- 접근: 관리자만 조회(RLS is_admin). 쓰기는 service_role 또는 아래 SECURITY DEFINER RPC.
-- ============================================================================

-- ── Audit 로그 ──
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users(id) on delete set null,
  actor_role  text,
  action      text not null,                    -- 예: 'opinion.delete', 'member.role_change'
  target_type text,
  target_id   text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_actor_idx   on public.audit_logs (actor_id);
create index if not exists audit_logs_action_idx  on public.audit_logs (action);

-- ── Security 이벤트 ──
create table if not exists public.security_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  event       text not null,                    -- 예: 'auth.login_failed','access.forbidden'
  severity    text not null default 'warning',  -- info | warning | critical
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists security_events_created_idx  on public.security_events (created_at desc);
create index if not exists security_events_severity_idx on public.security_events (severity);

-- ── RLS: 관리자만 조회. 쓰기 정책 없음(service_role/RPC 만 기록) ──
alter table public.audit_logs      enable row level security;
alter table public.security_events enable row level security;

drop policy if exists audit_logs_admin_read on public.audit_logs;
create policy audit_logs_admin_read on public.audit_logs
  for select using (public.is_admin());

drop policy if exists security_events_admin_read on public.security_events;
create policy security_events_admin_read on public.security_events
  for select using (public.is_admin());

-- ── 기록 RPC (SECURITY DEFINER) ──
-- 보안 이벤트: 로그인 사용자/익명 모두 자기 관련 이벤트 기록 가능.
create or replace function public.log_security_event(
  p_event text, p_severity text default 'warning', p_detail jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.security_events (user_id, event, severity, detail)
  values (auth.uid(), p_event, coalesce(nullif(p_severity, ''), 'warning'), coalesce(p_detail, '{}'::jsonb));
end $$;
grant execute on function public.log_security_event(text, text, jsonb) to authenticated, anon;

-- 감사 로그: 로그인 사용자(주로 관리자 행위). actor_role 은 서버에서 채운다.
create or replace function public.log_audit(
  p_action text, p_target_type text default null, p_target_id text default null, p_detail jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if auth.uid() is null then return; end if;
  select role into r from public.profiles where id = auth.uid();
  insert into public.audit_logs (actor_id, actor_role, action, target_type, target_id, detail)
  values (auth.uid(), r, p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb));
end $$;
grant execute on function public.log_audit(text, text, text, jsonb) to authenticated;
