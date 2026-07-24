-- FANCLUV — 0088: 뉴스 AI 요약 Queue Worker 인프라(atomic claim + retry/backoff + stale recovery + health).
--
-- 배경(현 구조 실측): news_ai_queue(0060 트리거가 team_news 발행 시 enqueue) 에 소비자(Worker) 가 없어
--   pending 이 적체(114건). 실제 AI 요약은 lazy(summarize-news, 팬 조회 시 1회 생성+캐시)로만 동작.
-- 이 마이그레이션은 news_ai_queue 를 백그라운드 Worker(news-ai-worker Edge)가 소비할 수 있도록 확장한다.
--   · 뉴스 수집/노출은 OpenAI 와 무관(team_news 그대로). AI 결과는 news_ai_summary 로 분리(원문 미변경).
--   · 429/5xx/timeout = 제한적 재시도(backoff), 잘못된 입력 = 즉시 failed, MAX_ATTEMPTS 로 무한재시도 차단.
--   · claim 은 FOR UPDATE SKIP LOCKED 로 동시 Worker 중복 처리 방지. stale processing 자동 회수.
--   · queue write 는 service_role/Worker 와 SECURITY DEFINER RPC 만(팬/구단 불가). additive, destructive 없음.
begin;

-- ── 상태 확장: 'retry'(backoff 대기) 추가 ──
alter table public.news_ai_queue drop constraint if exists news_ai_queue_status_check;
alter table public.news_ai_queue add constraint news_ai_queue_status_check
  check (status in ('pending','processing','done','failed','retry'));

-- ── Worker 운영 컬럼(additive) ──
alter table public.news_ai_queue add column if not exists attempts             int not null default 0;
alter table public.news_ai_queue add column if not exists next_retry_at        timestamptz;
alter table public.news_ai_queue add column if not exists processing_started_at timestamptz;
alter table public.news_ai_queue add column if not exists last_error           text;
alter table public.news_ai_queue add column if not exists completed_at         timestamptz;

-- claim 대상(pending/retry-ready/stale) 조회용.
create index if not exists news_ai_queue_claimable_idx
  on public.news_ai_queue (status, next_retry_at, created_at);

-- ── Atomic claim: pending/retry-ready/stale-processing → processing. attempts 는 실제 시도 시에만 증가(여기선 유지). ──
--   동시 Worker 중복 방지(FOR UPDATE SKIP LOCKED). team_news 원문 동봉. service_role/Worker 만 실행.
create or replace function public.news_ai_claim_batch(p_limit int default 8)
returns table(queue_id uuid, news_id uuid, team_id text, title text, content text, source_url text, attempts int)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with cand as (
    select q.id
    from public.news_ai_queue q
    where q.status = 'pending'
       or (q.status = 'retry' and coalesce(q.next_retry_at, now()) <= now())
       or (q.status = 'processing' and coalesce(q.processing_started_at, q.updated_at) < now() - interval '5 minutes')
    order by coalesce(q.next_retry_at, q.created_at) asc
    limit greatest(1, least(coalesce(p_limit, 8), 20))
    for update skip locked
  ),
  upd as (
    update public.news_ai_queue q
       set status = 'processing', processing_started_at = now(), updated_at = now()
      from cand where q.id = cand.id
    returning q.id, q.news_id, q.attempts
  )
  select u.id, u.news_id, tn.team_id, coalesce(tn.title,''), coalesce(tn.content, tn.excerpt, ''), tn.source_url, u.attempts
  from upd u join public.team_news tn on tn.id = u.news_id;
end $$;
revoke all on function public.news_ai_claim_batch(int) from public;
do $$ begin
  execute 'revoke all on function public.news_ai_claim_batch(int) from anon, authenticated';
exception when others then null; end $$;

-- ── 결과 반영(Worker 가 service_role 로 호출) ──
create or replace function public.news_ai_mark_done(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.news_ai_queue set status='done', completed_at=now(), last_error=null, updated_at=now() where id=p_id;
$$;
create or replace function public.news_ai_mark_retry(p_id uuid, p_backoff_sec int, p_error text)
returns void language sql security definer set search_path = public as $$
  update public.news_ai_queue
     set status='retry', attempts=attempts+1, next_retry_at=now() + make_interval(secs => greatest(30, coalesce(p_backoff_sec,60))),
         last_error=left(coalesce(p_error,''),200), updated_at=now()
   where id=p_id;
$$;
create or replace function public.news_ai_mark_failed(p_id uuid, p_error text)
returns void language sql security definer set search_path = public as $$
  update public.news_ai_queue
     set status='failed', attempts=attempts+1, next_retry_at=null, last_error=left(coalesce(p_error,''),200), updated_at=now()
   where id=p_id;
$$;
-- 이미 요약이 있는 기사(lazy 로 생성됨)는 중복 호출 없이 done 처리.
create or replace function public.news_ai_mark_skip(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.news_ai_queue set status='done', completed_at=now(), last_error='already_summarized', updated_at=now() where id=p_id;
$$;
do $$ begin execute 'revoke all on function public.news_ai_mark_done(uuid), public.news_ai_mark_retry(uuid,int,text), public.news_ai_mark_failed(uuid,text), public.news_ai_mark_skip(uuid) from anon, authenticated'; exception when others then null; end $$;

-- ── Admin: Queue Health(집계, 브라우저에서 전체 SELECT 금지) ──
create or replace function public.news_ai_queue_health()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.is_admin() then jsonb_build_object('ok', false, 'code','NOT_ALLOWED')
  else jsonb_build_object('ok', true,
    'pending',    (select count(*) from public.news_ai_queue where status='pending'),
    'processing', (select count(*) from public.news_ai_queue where status='processing'),
    'retrying',   (select count(*) from public.news_ai_queue where status='retry'),
    'failed',     (select count(*) from public.news_ai_queue where status='failed'),
    'done',       (select count(*) from public.news_ai_queue where status='done'),
    'total',      (select count(*) from public.news_ai_queue),
    'oldestPending', (select min(created_at) from public.news_ai_queue where status in ('pending','retry')),
    'lastDoneAt',    (select max(completed_at) from public.news_ai_queue where status='done'),
    'lastError',     (select last_error from public.news_ai_queue where last_error is not null order by updated_at desc limit 1),
    'summaries',  (select jsonb_build_object(
                     'ai', count(*) filter (where model is not null and model <> 'extractive'),
                     'extractive', count(*) filter (where model='extractive'),
                     'total', count(*)) from public.news_ai_summary)
  ) end
$$;
grant execute on function public.news_ai_queue_health() to authenticated;

-- ── Admin 수동 처리: is_admin + rate limit + pg_net → news-ai-worker. p_mode: 'process' | 'retry_failed'. ──
create or replace function public.admin_news_ai_process(p_mode text default 'process')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_req bigint; v_role text; v_reset int := 0;
begin
  if not public.is_admin() then return jsonb_build_object('ok', false, 'code', 'NOT_ALLOWED'); end if;
  if exists (select 1 from public.league_sync_state where resource='news_ai_manual' and updated_at > now() - interval '20 seconds') then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  end if;
  insert into public.league_sync_state(resource, updated_at) values ('news_ai_manual', now())
    on conflict (resource) do update set updated_at = now();
  -- 영구 실패분 재시도: failed → pending(attempts 초기화). 관리자 명시적 선택 시에만.
  if p_mode = 'retry_failed' then
    with r as (update public.news_ai_queue set status='pending', attempts=0, next_retry_at=null, updated_at=now()
               where status='failed' returning 1)
    select count(*) into v_reset from r;
  end if;
  select net.http_post(
    url := 'https://cuuzbddxnzhhlrqmmebz.supabase.co/functions/v1/news-ai-worker',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name='league_sync_secret')),
    body := jsonb_build_object('mode','process'),
    timeout_milliseconds := 150000
  ) into v_req;
  select role::text into v_role from public.profiles where id = auth.uid();
  insert into public.audit_logs(actor_id, actor_role, action, target_type, target_id, detail)
    values (auth.uid(), v_role, 'news.ai_process', 'news_ai', p_mode, jsonb_build_object('mode', p_mode, 'requeued', v_reset, 'requestId', v_req));
  return jsonb_build_object('ok', true, 'mode', p_mode, 'requeued', v_reset, 'requestId', v_req);
end $$;
grant execute on function public.admin_news_ai_process(text) to authenticated;

commit;
