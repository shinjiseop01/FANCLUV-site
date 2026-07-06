-- 0018_customers.sql
-- ─────────────────────────────────────────────────────────────────────────
-- B2B 고객(구단) 관리.
--
-- FANCLUV 운영자가 계약된 구단을 관리한다. 계약 상태/플랜/담당자/계약 이력을 저장하고,
-- 운영자 전용 메모는 admin_notes(entity_type='customer') 를 재사용한다.
--
--   customers                  : 구단 계약 정보(상태·플랜·담당자·계약 기간)
--   customer_contract_history  : 계약 변경 이력(날짜 + 설명)
--
-- 접근: 두 테이블 모두 RLS 로 is_admin() 만 허용 → 구단/일반 사용자 접근 불가.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  team_id       text not null,                        -- 대상 구단 id (teams.jsx)
  club_name     text,                                  -- 표시용 구단명 스냅샷
  status        text not null default 'pilot',         -- pilot | negotiating | active | ended | terminated
  plan          text not null default 'basic',         -- basic | professional | enterprise
  start_date    date,                                  -- 계약 시작일
  end_date      date,                                  -- 계약 종료일
  contact_name  text,                                  -- 담당자 이름
  contact_email text,                                  -- 담당자 이메일
  contact_title text,                                  -- 담당자 직책
  contact_phone text,                                  -- 담당자 연락처
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists customers_team_idx on public.customers (team_id);

create table if not exists public.customer_contract_history (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete cascade,
  event_date  date not null default current_date,       -- 변경 일자
  description text not null,                             -- 예: "Professional 시작"
  created_at  timestamptz not null default now()
);
create index if not exists customer_history_idx on public.customer_contract_history (customer_id, event_date desc);

alter table public.customers enable row level security;
alter table public.customer_contract_history enable row level security;

drop policy if exists "admins all customers" on public.customers;
create policy "admins all customers" on public.customers
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins all customer_history" on public.customer_contract_history;
create policy "admins all customer_history" on public.customer_contract_history
  for all using (public.is_admin()) with check (public.is_admin());
