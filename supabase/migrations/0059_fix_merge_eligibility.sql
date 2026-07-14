-- ============================================================================
-- FANCLUV — 0059_fix_merge_eligibility.sql  (Phase 12 검증 중 발견 버그 수정)
--
-- 버그(스테이징 실측): request_account_merge 의 동일인 판정이 source/target 의
--   profiles.identity_di_hash 동일성만 비교했다. 그러나 1 DI = 1 계정(0044 부분 UNIQUE
--   profiles_identity_di_hash_unique) 정책상, 중복 계정(source=loser)은 di_hash 를 대표
--   계정(canonical=target)에 양보하고 자신은 NULL 을 가진다(0057 'linked' 결과).
--   따라서 정상적인 병합 후보에서도 source.identity_di_hash 가 NULL → 항상 not_same_person
--   → 병합 요청 자체가 불가능했다.
--
-- 수정: source 의 "본인인증 이력"(identity_verifications.di_hash, status=verified)을 기준으로
--   target(canonical)의 di_hash 와 비교한다. source 프로필에 di_hash 가 남아있는 경우(아직
--   병합 전 canonical 끼리)는 그 값을 폴백으로 사용한다.
-- (기능 추가 아님 — 기존 요청 로직의 판정 결함만 교정.)
-- ============================================================================
create or replace function public.request_account_merge(
  p_target uuid, p_reason text default null, p_request_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_op public.merge_operations; v_src_di text; v_tgt_di text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'unauthorized'); end if;
  if p_target is null or p_target = v_uid then return jsonb_build_object('ok', false, 'code', 'self'); end if;

  -- 멱등: 동일 request_id 재호출 → 기존 행 반환.
  if p_request_id is not null then
    select * into v_op from public.merge_operations where request_id = p_request_id;
    if found then return jsonb_build_object('ok', true, 'code', v_op.status, 'operation_id', v_op.operation_id); end if;
  end if;

  -- 동일인 판정: source 의 검증완료 본인인증 di_hash 기준(중복계정은 프로필 di_hash 가 NULL).
  select di_hash into v_src_di from public.identity_verifications
    where user_id = v_uid and status = 'verified' and di_hash is not null
    order by verified_at desc nulls last limit 1;
  if v_src_di is null then
    select identity_di_hash into v_src_di from public.profiles where id = v_uid;  -- 폴백
  end if;
  select identity_di_hash into v_tgt_di from public.profiles where id = p_target;
  if v_src_di is null or v_tgt_di is null or v_src_di <> v_tgt_di then
    return jsonb_build_object('ok', false, 'code', 'not_same_person');
  end if;

  -- source 당 진행중 병합 1건만(partial unique). 충돌이면 기존 반환.
  insert into public.merge_operations(source_user_id, target_user_id, status, reason, requested_by, request_id)
  values (v_uid, p_target, 'pending', left(coalesce(p_reason, ''), 500), v_uid, p_request_id)
  on conflict (source_user_id) where (status in ('pending','approved')) do nothing
  returning * into v_op;

  if v_op.operation_id is null then
    select * into v_op from public.merge_operations
      where source_user_id = v_uid and status in ('pending','approved')
      order by created_at desc limit 1;
    return jsonb_build_object('ok', true, 'code', 'exists', 'operation_id', v_op.operation_id);
  end if;

  perform public._merge_audit(v_uid, 'merge.request', v_op);
  return jsonb_build_object('ok', true, 'code', 'pending', 'operation_id', v_op.operation_id);
end $$;
