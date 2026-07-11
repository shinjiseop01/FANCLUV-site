-- ============================================================================
-- FANCLUV — 0047_survey_submit_atomic.sql
-- 설문 제출 원자성 보장 RPC. 기존엔 클라이언트가 survey_responses insert 후
-- 별도 요청으로 survey_answers insert → 2단계 실패 시 answers 없는 orphan
-- response(partial data) 가능했다. 이 함수는 단일 트랜잭션(plpgsql)으로 처리해
-- 하나라도 실패하면 전체 rollback 한다.
--
-- 서버측 재검증: 로그인 사용자(auth.uid) · published · 종료시각 · 중복참여 ·
--   질문 유효성(설문 소속 + active) · 필수문항. user_id 는 임의 입력 불가.
-- ============================================================================
create or replace function public.submit_survey_response(
  p_survey_id uuid,
  p_team_id   text,
  p_answers   jsonb           -- { "<question_id>": <value>, ... }
) returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  s   record;
  new_response_id uuid;
  required_total  int;
  answered_required int;
  qid uuid;
  val jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false, 'code', 'unauthorized'); end if;

  -- 1) 설문 상태/기간 서버 재확인.
  select id, status, start_date, end_date into s from public.surveys where id = p_survey_id;
  if s.id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if s.status <> 'published' then return jsonb_build_object('ok', false, 'code', 'not_published'); end if;
  if s.start_date is not null and s.start_date > current_date then return jsonb_build_object('ok', false, 'code', 'not_started'); end if;
  if s.end_date   is not null and s.end_date   < current_date then return jsonb_build_object('ok', false, 'code', 'closed'); end if;

  -- 2) 중복 참여 차단(명시적 + unique 제약 이중 방어).
  if exists (select 1 from public.survey_responses r where r.survey_id = p_survey_id and r.user_id = uid) then
    return jsonb_build_object('ok', false, 'code', 'duplicate');
  end if;

  -- 3) response insert (user_id 는 서버가 auth.uid 로 강제 — 임의 입력 무시).
  insert into public.survey_responses (survey_id, user_id, team_id)
  values (p_survey_id, uid, p_team_id)
  returning id into new_response_id;

  -- 4) answers 일괄 insert — 이 설문 소속 + active 질문만, 빈 값 제외.
  for qid, val in
    select (kv.key)::uuid, kv.value
    from jsonb_each(coalesce(p_answers, '{}'::jsonb)) kv
  loop
    -- 유효 질문만(설문 소속 + active). 그 외 키는 무시(주입 방지).
    if exists (select 1 from public.survey_questions q
               where q.id = qid and q.survey_id = p_survey_id and q.active) then
      -- 빈 값 제외(null / 빈 문자열 / 빈 배열).
      if val is not null and val <> 'null'::jsonb and val <> '""'::jsonb and val <> '[]'::jsonb then
        insert into public.survey_answers (response_id, question_id, value)
        values (new_response_id, qid, val);
      end if;
    end if;
  end loop;

  -- 5) 필수 문항 검증 — 하나라도 미응답이면 전체 rollback.
  select count(*) into required_total
    from public.survey_questions q where q.survey_id = p_survey_id and q.active and q.required;
  select count(*) into answered_required
    from public.survey_answers a
    join public.survey_questions q on q.id = a.question_id
   where a.response_id = new_response_id and q.required and q.active;
  if answered_required < required_total then
    raise exception 'required_missing' using errcode = 'check_violation';
  end if;

  return jsonb_build_object('ok', true, 'response_id', new_response_id);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'duplicate');
  when check_violation then
    return jsonb_build_object('ok', false, 'code', 'required_missing');
end;
$$;

revoke all on function public.submit_survey_response(uuid, text, jsonb) from public, anon;
grant execute on function public.submit_survey_response(uuid, text, jsonb) to authenticated;
