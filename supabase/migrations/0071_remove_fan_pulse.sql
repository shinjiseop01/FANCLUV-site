-- FANCLUV — Fan Pulse(0062/0063) 완전 제거(0071)
--
-- 0062/0063 을 과거 수정으로 되돌리지 않고 이후 migration 으로 안전 제거한다.
-- 스테이징 실데이터 없음(사전 확인: pulse_topics=0, pulse_votes=0, pulse_daily_stats=0).
-- Phase 19 실시간 통계(0069)가 pulse 에 결합돼 있으므로 함께 정리한다:
--   - 트리거 trg_rt_pulse + 함수 _rt_trg_pulse 제거(집계 결합 해제)
--   - pulse_votes/pulse_topics 를 조인하던 rebuild/verify 를 pulse 없는 버전으로 교체
-- team_realtime_stats.pulse_votes_total 컬럼은 값 유입이 완전히 끊겨 항상 0 이며 UI 에서도
-- 노출되지 않으므로(관리자 대시보드 카드 제거됨) 이번엔 컬럼을 남겨둔다(get_team_realtime_stats/
-- get_admin_realtime_dashboard/_rt_bump 4개 함수 재작성으로 인한 회귀 위험 회피 — 무데이터·비노출).
-- 의견/설문/Quick Poll/audit_logs/activity_events 영향 없음.
begin;

-- 1) 실시간 통계 결합 해제(트리거 → 트리거 함수)
drop trigger if exists trg_rt_pulse on public.pulse_votes;
drop function if exists public._rt_trg_pulse();

-- 2) rebuild/verify 를 pulse 없는 버전으로 교체(pulse_votes/pulse_topics 조인 제거).
--    pulse_votes_total 은 항상 0 으로 기록/검증한다.
create or replace function public.rebuild_team_realtime_stats(p_team_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_op bigint; v_li bigint; v_co bigint; v_sr bigint; v_qp bigint; v_rs bigint; v_rc bigint; v_t0 timestamptz := clock_timestamp();
begin
  if not public._rt_can_admin_team(p_team_id) then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select count(*), coalesce(sum(rating),0), count(rating) into v_op, v_rs, v_rc
    from public.opinions where team_id=p_team_id and status='visible';
  select count(*) into v_li from public.likes l join public.opinions o on o.id=l.opinion_id where o.team_id=p_team_id;
  select count(*) into v_co from public.comments c join public.opinions o on o.id=c.opinion_id where o.team_id=p_team_id and c.status='visible';
  select count(*) into v_sr from public.survey_responses where team_id=p_team_id;
  select count(*) into v_qp from public.quick_poll_votes qv join public.quick_polls p on p.id=qv.poll_id where p.team_id=p_team_id;
  insert into public.team_realtime_stats(team_id, opinions_total, likes_total, comments_total,
      survey_responses_total, pulse_votes_total, quick_poll_votes_total, rating_sum, rating_count, updated_at)
    values (p_team_id, v_op, v_li, v_co, v_sr, 0, v_qp, v_rs, v_rc, now())
    on conflict (team_id) do update set opinions_total=excluded.opinions_total, likes_total=excluded.likes_total,
      comments_total=excluded.comments_total, survey_responses_total=excluded.survey_responses_total,
      pulse_votes_total=0, quick_poll_votes_total=excluded.quick_poll_votes_total,
      rating_sum=excluded.rating_sum, rating_count=excluded.rating_count, updated_at=now();
  update public.realtime_stats_settings set last_rebuild_at=now(), last_success_at=now(),
     last_rebuild_ms=extract(milliseconds from clock_timestamp()-v_t0)::int where id=1;
  perform public._rt_audit(auth.uid(), 'realtime_stats.rebuild', jsonb_build_object('team', p_team_id));
  return jsonb_build_object('ok', true, 'team_id', p_team_id, 'opinions', v_op, 'likes', v_li, 'comments', v_co);
end $$;

create or replace function public.verify_team_stats_consistency(p_team_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.team_realtime_stats%rowtype; e_op bigint; e_li bigint; e_co bigint; e_sr bigint; e_qp bigint; e_rs bigint; e_rc bigint; v_drift jsonb := '[]'::jsonb;
begin
  if not public._rt_can_admin_team(p_team_id) then return jsonb_build_object('ok', false, 'code', 'forbidden'); end if;
  select * into r from public.team_realtime_stats where team_id=p_team_id;
  select count(*), coalesce(sum(rating),0), count(rating) into e_op, e_rs, e_rc from public.opinions where team_id=p_team_id and status='visible';
  select count(*) into e_li from public.likes l join public.opinions o on o.id=l.opinion_id where o.team_id=p_team_id;
  select count(*) into e_co from public.comments c join public.opinions o on o.id=c.opinion_id where o.team_id=p_team_id and c.status='visible';
  select count(*) into e_sr from public.survey_responses where team_id=p_team_id;
  select count(*) into e_qp from public.quick_poll_votes qv join public.quick_polls p on p.id=qv.poll_id where p.team_id=p_team_id;
  if coalesce(r.opinions_total,0) <> e_op then v_drift := v_drift || jsonb_build_object('metric','opinions','stored',coalesce(r.opinions_total,0),'expected',e_op); end if;
  if coalesce(r.likes_total,0) <> e_li then v_drift := v_drift || jsonb_build_object('metric','likes','stored',coalesce(r.likes_total,0),'expected',e_li); end if;
  if coalesce(r.comments_total,0) <> e_co then v_drift := v_drift || jsonb_build_object('metric','comments','stored',coalesce(r.comments_total,0),'expected',e_co); end if;
  if coalesce(r.survey_responses_total,0) <> e_sr then v_drift := v_drift || jsonb_build_object('metric','survey_responses','stored',coalesce(r.survey_responses_total,0),'expected',e_sr); end if;
  if coalesce(r.quick_poll_votes_total,0) <> e_qp then v_drift := v_drift || jsonb_build_object('metric','quick_poll_votes','stored',coalesce(r.quick_poll_votes_total,0),'expected',e_qp); end if;
  if coalesce(r.rating_sum,0) <> e_rs or coalesce(r.rating_count,0) <> e_rc then v_drift := v_drift || jsonb_build_object('metric','rating','stored_sum',coalesce(r.rating_sum,0),'expected_sum',e_rs,'stored_count',coalesce(r.rating_count,0),'expected_count',e_rc); end if;
  return jsonb_build_object('ok', true, 'team_id', p_team_id, 'consistent', (jsonb_array_length(v_drift)=0), 'drift', v_drift);
end $$;

-- 3) 실시간 통계 timeseries 의 pulse 데이터 정리(과거 집계 흔적 제거)
delete from public.team_stats_timeseries where metric = 'pulse_votes';
update public.team_realtime_stats set pulse_votes_total = 0 where pulse_votes_total <> 0;

-- 4) Fan Pulse 기능 RPC 제거
drop function if exists public.pulse_create(p_question text, p_options jsonb, p_team text, p_ends_at timestamptz, p_visibility text);
drop function if exists public.pulse_vote(p_topic uuid, p_option text);
drop function if exists public.pulse_set_status(p_topic uuid, p_to text);
drop function if exists public.pulse_delete(p_topic uuid);
drop function if exists public.pulse_dashboard(p_limit integer);
drop function if exists public.pulse_stats(p_topic uuid);
drop function if exists public.pulse_rollup_daily(p_topic uuid);
drop function if exists public._pulse_audit(p_actor uuid, p_action text, p_topic uuid, p_extra jsonb);

-- 5) Fan Pulse 뷰/테이블 제거(정책·인덱스·FK 동반 제거). 의존 뷰 → 자식 → 부모 순서.
drop view if exists public.pulse_trending;
drop table if exists public.pulse_daily_stats;
drop table if exists public.pulse_votes;
drop table if exists public.pulse_topics;

commit;
