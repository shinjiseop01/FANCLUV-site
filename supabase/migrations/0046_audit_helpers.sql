-- ============================================================================
-- FANCLUV — 0046_audit_helpers.sql
-- 라이브 DB 메타데이터 감사용 읽기 전용 함수(마이그레이션 vs 실제 원격 DB 대조).
-- 사용자 데이터 0 — 스키마 메타데이터(RLS/정책/제약/SECURITY DEFINER proconfig)만 반환.
-- service_role 만 실행(감사 후 유지해도 무해하나 노출 최소화).
-- ============================================================================
create or replace function public.audit_schema()
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select jsonb_build_object(
    'tables', (
      select jsonb_object_agg(c.relname, jsonb_build_object(
        'rls', c.relrowsecurity,
        'policies', (
          select coalesce(jsonb_agg(jsonb_build_object('name', p.polname, 'cmd', p.polcmd)), '[]'::jsonb)
          from pg_policy p where p.polrelid = c.oid)
      ))
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    ),
    'constraints', (
      select jsonb_agg(jsonb_build_object('table', conrelid::regclass::text, 'name', conname, 'type', contype))
      from pg_constraint where connamespace = 'public'::regnamespace and contype in ('u','f','c','p')
    ),
    'secdef_funcs', (
      select jsonb_agg(jsonb_build_object('name', p.proname, 'secdef', p.prosecdef, 'config', p.proconfig))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef = true
    ),
    'indexes', (
      select jsonb_agg(jsonb_build_object('table', tablename, 'name', indexname))
      from pg_indexes where schemaname = 'public' and indexname like '%uniq%' or (schemaname='public' and indexname like '%unique%')
    )
  );
$$;
revoke all on function public.audit_schema() from public, anon, authenticated;
