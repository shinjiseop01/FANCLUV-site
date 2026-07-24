-- 0091_feedback_provenance.sql
-- Feedback Loop Phase 2: 공개 피드백 상세 + 검증된 provenance.
--
-- 원칙: provenance 는 "생성 당시 저장된 실제 source 관계"에서만 계산한다(§9).
--   · category 유사성으로 역추론 금지. 추측 count 금지.
--   · 기존 ai_insights 에는 source 관계가 없다 → 신규 insight 부터 ai_insight_sources 에 기록.
--   · Fan 상세 RPC 는 sanitize 공개필드 + 실제 linked source 의 test-제외 aggregate 만 반환.
-- Additive only. destructive 없음. 기존 migration 무수정.

-- ── 1) Insight → source 관계 링크 테이블(신규 provenance 기반) ──
create table if not exists public.ai_insight_sources (
  id                 bigint generated always as identity primary key,
  ai_insight_id      uuid not null references public.ai_insights(id) on delete cascade,
  source_type        text not null check (source_type in ('opinion','survey','survey_response')),
  opinion_id         uuid references public.opinions(id) on delete cascade,
  survey_id          uuid references public.surveys(id) on delete cascade,
  survey_response_id uuid references public.survey_responses(id) on delete cascade,
  created_at         timestamptz not null default now()
);
create index if not exists ai_insight_sources_insight_idx on public.ai_insight_sources (ai_insight_id, source_type);
create unique index if not exists ai_insight_sources_uniq_opinion
  on public.ai_insight_sources (ai_insight_id, opinion_id) where opinion_id is not null;

-- RLS: 내부 traceability 테이블 → 관리자만 직접 접근(ai_insights 와 동일 정책). Fan/Club 은 RPC 로만.
alter table public.ai_insight_sources enable row level security;
drop policy if exists ai_insight_sources_admin on public.ai_insight_sources;
create policy ai_insight_sources_admin on public.ai_insight_sources
  for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.ai_insight_sources from anon, authenticated;

-- ── 2) Fan 공개 피드백 상세 + provenance RPC ──
-- published + done + 자기팀 + 공개필드 존재하는 Action 만. 내부필드/ source IDs / PII 0.
-- provenance_level: 0=insight 링크 없음, 1=insight 링크 있으나 source 기록 없음, 2=source 기록 존재.
-- source count 는 ai_insight_sources 의 실제 관계에서 test 계정 제외하여 계산(§17).
create or replace function public.fan_club_feedback_detail(p_feedback_id bigint, p_team_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  a record; ins record;
  v_level int := 0; v_op int := 0; v_sv int := 0; v_sr int := 0;
  v_keywords jsonb := '[]'::jsonb; v_topic text := null;
begin
  select * into a from public.club_actions
   where id = p_feedback_id and is_published and status = 'done' and club_id = p_team_id
     and public_title is not null and btrim(public_title) <> ''
     and public_summary is not null and btrim(public_summary) <> '';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- linked insight(soft link: club_actions.ai_insight_id = ai_insights.id::text)
  if a.ai_insight_id is not null and btrim(a.ai_insight_id) <> '' then
    begin
      select * into ins from public.ai_insights where id = a.ai_insight_id::uuid;
    exception when others then ins := null; end;
    if ins.id is not null then
      v_level := 1;
      v_topic := ins.period;
      -- safe keywords: tag 문자열만(카운트/내부 metadata 제외), 최대 5.
      select coalesce(jsonb_agg(tag), '[]'::jsonb) into v_keywords from (
        select distinct (kw->>'tag') tag
          from jsonb_array_elements(coalesce(ins.keywords, '[]'::jsonb)) kw
         where coalesce(btrim(kw->>'tag'), '') <> ''
         limit 5
      ) k;
      -- 실제 linked source count(test 계정 제외).
      select count(distinct s.opinion_id) into v_op
        from public.ai_insight_sources s
        join public.opinions o on o.id = s.opinion_id
        join public.profiles pr on pr.id = o.author_id
       where s.ai_insight_id = ins.id and s.source_type = 'opinion'
         and o.status = 'visible' and coalesce(pr.is_test_account, false) = false;
      select count(distinct s.survey_id) into v_sv
        from public.ai_insight_sources s where s.ai_insight_id = ins.id and s.survey_id is not null;
      select count(distinct s.survey_response_id) into v_sr
        from public.ai_insight_sources s
        join public.survey_responses rr on rr.id = s.survey_response_id
        join public.profiles pr on pr.id = rr.user_id
       where s.ai_insight_id = ins.id and s.source_type = 'survey_response'
         and coalesce(pr.is_test_account, false) = false;
      if (v_op + v_sv + v_sr) > 0 then v_level := 2; end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', a.id, 'club_id', a.club_id,
    'public_title', a.public_title, 'public_summary', a.public_summary,
    'category', a.category, 'completed_at', a.completed_at, 'published_at', a.published_at,
    'provenance', jsonb_build_object(
      'level', v_level,
      'opinion_count', v_op, 'survey_count', v_sv, 'survey_response_count', v_sr,
      'keywords', case when v_level >= 1 then v_keywords else '[]'::jsonb end,
      'topic', case when v_level >= 1 then v_topic else null end
    )
  );
end $$;

-- ── 3) Admin/Club 내부 traceability RPC — Action 의 연결된 insight/report 존재 여부 + source 요약(자기 구단/admin). ──
create or replace function public.club_action_provenance(p_action_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a record; ins record; v_op int := 0;
begin
  select * into a from public.club_actions where id = p_action_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if not (public.is_admin() or (public.is_club_account() and public.current_user_team() = a.club_id)) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ALLOWED');
  end if;
  if a.ai_insight_id is not null and btrim(a.ai_insight_id) <> '' then
    begin select * into ins from public.ai_insights where id = a.ai_insight_id::uuid; exception when others then ins := null; end;
    if ins.id is not null then
      select count(*) into v_op from public.ai_insight_sources s where s.ai_insight_id = ins.id and s.source_type = 'opinion';
    end if;
  end if;
  return jsonb_build_object('ok', true,
    'ai_insight_id', a.ai_insight_id, 'report_id', a.report_id,
    'insight_period', ins.period, 'linked_source_count', v_op);
end $$;

-- ── 4) 권한 ──
revoke all on function public.fan_club_feedback_detail(bigint, text) from public;
revoke all on function public.club_action_provenance(bigint) from public;
grant execute on function public.fan_club_feedback_detail(bigint, text) to anon, authenticated;
grant execute on function public.club_action_provenance(bigint) to authenticated;
