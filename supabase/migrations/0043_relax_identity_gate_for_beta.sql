-- ============================================================================
-- FANCLUV — 0043_relax_identity_gate_for_beta.sql
--
-- 문제: 설문 제출 시 `new row violates row-level security policy for table
--       "survey_responses"` (42501). 의견/댓글도 동일.
--
-- 원인: 0026 이 핵심 활동(의견/댓글/설문) INSERT 정책에
--         with check (auth.uid() = <owner> AND public.is_identity_verified())
--       를 걸었는데, is_identity_verified() 는 profiles.identity_verified=true
--       (또는 admin/club)만 통과한다. 베타는 본인인증(PASS/NICE/KCB, CI/DI)을
--       도입하지 않아 일반 팬은 identity_verified=false → is_identity_verified()=false
--       → auth.uid()=user_id 를 만족해도 INSERT 가 거부된다.
--       프론트는 베타에서 본인인증을 요구하지 않으므로(requiresIdentityVerification=false)
--       팬이 제출 버튼까지 도달 → DB 정책과 불일치로 항상 실패.
--
-- 수정: 베타는 "이메일 인증" 기준으로 운영한다. 이메일 인증은 Supabase Auth 의
--       Confirm email(ON) 로 이미 강제되어, 로그인 세션을 가진 사용자는 모두 이메일
--       인증 완료 상태다. 따라서 INSERT 는 소유자 확인(auth.uid()=<owner>)만으로 충분.
--       is_identity_verified() 함수는 보존하며, 추후 실 본인인증 도입 시 이 게이트를
--       다시 추가하면 된다.
-- ============================================================================

-- 설문 응답: 본인 응답만 작성(중복은 surveys 스키마의 unique(survey_id,user_id) 로 차단).
drop policy if exists "insert own response" on public.survey_responses;
create policy "insert own response"
  on public.survey_responses for insert
  with check (auth.uid() = user_id);

-- 의견: 본인 글만 작성.
drop policy if exists "insert own opinion" on public.opinions;
create policy "insert own opinion"
  on public.opinions for insert
  with check (auth.uid() = author_id);

-- 댓글: 본인 댓글만 작성.
drop policy if exists "insert own comment" on public.comments;
create policy "insert own comment"
  on public.comments for insert
  with check (auth.uid() = author_id);
