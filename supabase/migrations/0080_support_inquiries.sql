-- FANCLUV — 0080: 고객 문의 시스템(support_inquiries) + Admin 처리
--
-- Fan 문의 작성 → DB 저장 → Admin 목록/상세/상태/답변 → Fan 답변 확인.
-- 실시간 채팅/스레드 아님(답변 1개). 기존 audit_logs/notifications/is_admin 재사용.
--   · 사용자 직접 INSERT/UPDATE/DELETE 정책 없음 → 쓰기는 RPC 로만(user_id=auth.uid 서버 확정).
--   · 탈퇴 FK: user_id ON DELETE CASCADE(delete-account 가 auth.users 삭제 → 문의 정리).
begin;

create table if not exists public.support_inquiries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    text not null check (category in ('account','service','bug','privacy','etc')),
  subject     text not null,
  content     text not null,
  status      text not null default 'pending' check (status in ('pending','in_progress','resolved')),
  admin_reply text,
  replied_by  uuid,
  replied_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists support_inquiries_user_idx on public.support_inquiries (user_id, created_at desc);
create index if not exists support_inquiries_status_idx on public.support_inquiries (status, created_at desc);

alter table public.support_inquiries enable row level security;
-- 본인 조회 / 관리자 조회. (INSERT/UPDATE/DELETE 정책 없음 → 직접 쓰기 차단, RPC 전용)
do $$ begin
  create policy si_self_read on public.support_inquiries for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy si_admin_read on public.support_inquiries for select using (public.is_admin());
exception when duplicate_object then null; end $$;

-- 문의 생성: 검증 + rate limit(1분 3건) + user_id=auth.uid 서버 확정.
create or replace function public.create_inquiry(p_category text, p_subject text, p_content text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); v_subject text; v_content text; v_recent int; v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code','NOT_ALLOWED'); end if;
  if p_category is null or p_category not in ('account','service','bug','privacy','etc') then
    return jsonb_build_object('ok', false, 'code','INVALID_CATEGORY'); end if;
  v_subject := btrim(coalesce(p_subject, ''));
  v_content := btrim(coalesce(p_content, ''));
  if char_length(v_subject) < 2 or char_length(v_subject) > 100 then
    return jsonb_build_object('ok', false, 'code','INVALID_SUBJECT'); end if;
  if char_length(v_content) < 10 or char_length(v_content) > 5000 then
    return jsonb_build_object('ok', false, 'code','INVALID_CONTENT'); end if;
  -- rate limit: 최근 60초 3건 이상 → 차단
  select count(*) into v_recent from public.support_inquiries
    where user_id = v_uid and created_at > now() - interval '60 seconds';
  if v_recent >= 3 then return jsonb_build_object('ok', false, 'code','RATE_LIMITED'); end if;

  insert into public.support_inquiries(user_id, category, subject, content)
    values (v_uid, p_category, v_subject, v_content) returning id into v_id;
  return jsonb_build_object('ok', true, 'code','OK', 'id', v_id);
end $$;
grant execute on function public.create_inquiry(text, text, text) to authenticated;

-- 관리자 답변: reply 필수, status(기본 resolved), replied_by/at 기록, 알림(dedup) + audit.
create or replace function public.admin_reply_inquiry(p_id uuid, p_reply text, p_status text default 'resolved')
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid := auth.uid(); v_role text; v_reply text; v_status text; v_user uuid; v_subject text;
begin
  if v_actor is null or not public.is_admin() then return jsonb_build_object('ok', false, 'code','NOT_ALLOWED'); end if;
  v_reply := btrim(coalesce(p_reply, ''));
  if char_length(v_reply) < 1 or char_length(v_reply) > 5000 then return jsonb_build_object('ok', false, 'code','INVALID_REPLY'); end if;
  v_status := coalesce(p_status, 'resolved');
  if v_status not in ('in_progress','resolved') then return jsonb_build_object('ok', false, 'code','INVALID_STATUS'); end if;

  select user_id, subject into v_user, v_subject from public.support_inquiries where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code','NOT_FOUND'); end if;

  update public.support_inquiries
    set admin_reply = v_reply, replied_by = v_actor, replied_at = now(), status = v_status, updated_at = now()
    where id = p_id;

  -- 사용자 알림(중복 방지: user_id+dedup_key UNIQUE). 답변 재저장/재시도 시 1건 유지.
  insert into public.notifications(user_id, type, title, body, url, dedup_key)
    values (v_user, 'support', '문의 답변 등록',
            '문의하신 내용에 답변이 등록되었습니다.', '/support/my/' || p_id::text, 'support_reply:' || p_id::text)
  on conflict (user_id, dedup_key) where dedup_key is not null do nothing;

  select role::text into v_role from public.profiles where id = v_actor;
  insert into public.audit_logs(actor_id, actor_role, action, target_type, target_id, detail)
    values (v_actor, v_role, 'support.reply', 'support_inquiry', p_id::text, jsonb_build_object('status', v_status));
  return jsonb_build_object('ok', true, 'code','OK', 'status', v_status);
end $$;
grant execute on function public.admin_reply_inquiry(uuid, text, text) to authenticated;

-- 관리자 목록: 상태/카테고리 필터 + 제목 검색 + 페이지네이션 + 닉네임 조인(개인정보 최소).
create or replace function public.admin_list_inquiries(
  p_status text default null, p_category text default null, p_q text default null,
  p_page integer default 1, p_page_size integer default 20
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_total int; v_items jsonb; v_off int := (greatest(1, p_page) - 1) * least(greatest(p_page_size,1),100);
        v_q text := nullif(btrim(coalesce(p_q,'')), '');
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code','NOT_ALLOWED'); end if;
  select count(*) into v_total from public.support_inquiries si
    where (p_status is null or si.status = p_status)
      and (p_category is null or si.category = p_category)
      and (v_q is null or si.subject ilike '%'||v_q||'%');
  select coalesce(jsonb_agg(row order by created_at desc), '[]'::jsonb) into v_items from (
    select jsonb_build_object('id', si.id, 'user_id', si.user_id, 'category', si.category,
             'subject', si.subject, 'status', si.status, 'created_at', si.created_at,
             'updated_at', si.updated_at, 'nickname', p.nickname) row, si.created_at
    from public.support_inquiries si left join public.profiles p on p.id = si.user_id
    where (p_status is null or si.status = p_status)
      and (p_category is null or si.category = p_category)
      and (v_q is null or si.subject ilike '%'||v_q||'%')
    order by si.created_at desc
    offset v_off limit least(greatest(p_page_size,1),100)
  ) t;
  return jsonb_build_object('ok', true, 'items', v_items, 'total', v_total);
end $$;
grant execute on function public.admin_list_inquiries(text, text, text, integer, integer) to authenticated;

-- 관리자 상세: 닉네임/이메일(운영 필요 최소) 조인.
create or replace function public.admin_get_inquiry(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v jsonb;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code','NOT_ALLOWED'); end if;
  select jsonb_build_object('ok', true, 'inquiry', jsonb_build_object(
    'id', si.id, 'user_id', si.user_id, 'category', si.category, 'subject', si.subject,
    'content', si.content, 'status', si.status, 'admin_reply', si.admin_reply,
    'replied_by', si.replied_by, 'replied_at', si.replied_at, 'created_at', si.created_at,
    'nickname', p.nickname)) into v
  from public.support_inquiries si left join public.profiles p on p.id = si.user_id
  where si.id = p_id;
  return coalesce(v, jsonb_build_object('ok', false, 'code','NOT_FOUND'));
end $$;
grant execute on function public.admin_get_inquiry(uuid) to authenticated;

-- 관리자 상태 변경: resolved 는 반드시 admin_reply 존재해야(비정상 상태 방지) + audit.
create or replace function public.admin_set_inquiry_status(p_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid := auth.uid(); v_role text; v_reply text;
begin
  if v_actor is null or not public.is_admin() then return jsonb_build_object('ok', false, 'code','NOT_ALLOWED'); end if;
  if p_status not in ('pending','in_progress','resolved') then return jsonb_build_object('ok', false, 'code','INVALID_STATUS'); end if;
  select admin_reply into v_reply from public.support_inquiries where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code','NOT_FOUND'); end if;
  if p_status = 'resolved' and btrim(coalesce(v_reply, '')) = '' then
    return jsonb_build_object('ok', false, 'code','NEED_REPLY'); end if;
  update public.support_inquiries set status = p_status, updated_at = now() where id = p_id;
  select role::text into v_role from public.profiles where id = v_actor;
  insert into public.audit_logs(actor_id, actor_role, action, target_type, target_id, detail)
    values (v_actor, v_role, 'support.status_change', 'support_inquiry', p_id::text, jsonb_build_object('status', p_status));
  return jsonb_build_object('ok', true, 'code','OK', 'status', p_status);
end $$;
grant execute on function public.admin_set_inquiry_status(uuid, text) to authenticated;

commit;
