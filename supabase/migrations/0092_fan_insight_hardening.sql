-- 0092_fan_insight_hardening.sql
-- Security P1: Fan 이 raw ai_insights 를 직접 SELECT 하지 못하도록 차단하고,
--   Fan 화면에는 sanitize 된 안전 집계 필드만 반환하는 RPC 를 제공한다.
--
-- 문제: 기존 RLS `is_admin() OR club_id = current_user_team()` 는 current_user_team() 이
--   Fan 에게도 자기 응원팀을 반환하므로 Fan 이 자기팀 raw insight(summary/recommendations/
--   details.staffMemo/향후 내부필드)를 직접 조회할 수 있었다.
--
-- 조치:
--   1) ai_insights RLS 를 admin OR 자기구단 Club 로 축소(Fan raw read 차단, Club/Admin 유지).
--   2) fan_team_insight() sanitize RPC — 명시적 화이트리스트만 반환(details 통째 반환 금지 →
--      staffMemo/future 필드 자동 제외). team 은 current_user_team() 로 서버 결정(§6).
-- Additive only. 데이터 삭제/변경 없음. 기존 migration 무수정.

-- ── 1) RLS hardening: Fan raw read 차단 ──
drop policy if exists "ai_insights tenant read" on public.ai_insights;
create policy "ai_insights tenant read" on public.ai_insights
  for select using (
    public.is_admin()
    or (public.is_club_account() and club_id = public.current_user_team())
  );

-- ── 2) Fan 전용 sanitize RPC ──
-- current_user_team() 의 최신 insight 1건을, 안전 집계 필드만 명시적으로 반환한다.
-- 반환 금지: summary, recommendations, details.staffMemo, topOpinions, categoryIssues,
--            임의의 future details 필드, source/opinion/user IDs, PII.
create or replace function public.fan_team_insight()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare team text; ins record; v_keywords jsonb; v_catsat jsonb; v_trend jsonb;
begin
  team := public.current_user_team();
  if team is null or btrim(team) = '' then
    return jsonb_build_object('ok', false, 'code', 'no_team');
  end if;

  select * into ins from public.ai_insights
   where club_id = team
   order by created_at desc
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'empty');
  end if;

  -- safe keywords: tag 문자열만(내부 weight/_n/source 제외), distinct, 최대 8.
  select coalesce(jsonb_agg(tag), '[]'::jsonb) into v_keywords from (
    select distinct case when (kw->>'tag') like '#%' then (kw->>'tag') else '#'||(kw->>'tag') end tag
      from jsonb_array_elements(coalesce(ins.keywords, '[]'::jsonb)) kw
     where coalesce(btrim(kw->>'tag'), '') <> ''
     limit 8
  ) k;

  -- category 만족도: name/score 만 재구성(future 하위필드 유입 차단), 최대 6.
  select coalesce(jsonb_agg(jsonb_build_object('name', e->>'name', 'score', (e->>'score'))), '[]'::jsonb)
    into v_catsat
    from (select e from jsonb_array_elements(coalesce(ins.details->'categorySat', '[]'::jsonb)) e limit 6) s(e)
   where (e->>'name') is not null;

  -- 만족도 추이: label/value 만 재구성, 최대 12.
  select coalesce(jsonb_agg(jsonb_build_object('label', e->>'label', 'value', (e->>'value'))), '[]'::jsonb)
    into v_trend
    from (select e from jsonb_array_elements(coalesce(ins.details->'trend', '[]'::jsonb)) e limit 12) s(e);

  return jsonb_build_object(
    'ok', true,
    'club_id', ins.club_id,
    'period', ins.period,
    'created_at', ins.created_at,
    'sentiment', jsonb_build_object(
      'positive', coalesce(ins.sentiment_positive, 0),
      'neutral',  coalesce(ins.sentiment_neutral, 0),
      'negative', coalesce(ins.sentiment_negative, 0)
    ),
    'keywords', v_keywords,
    'sample', jsonb_build_object(
      'opinions', coalesce((ins.details->>'opinionsCount')::int, 0),
      'surveys',  coalesce((ins.details->>'surveysCount')::int, 0)
    ),
    'category_sat', v_catsat,
    'trend', v_trend
  );
end $$;

revoke all on function public.fan_team_insight() from public;
grant execute on function public.fan_team_insight() to authenticated;
