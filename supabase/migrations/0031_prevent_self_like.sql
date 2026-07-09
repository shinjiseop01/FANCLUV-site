-- ============================================================================
-- FANCLUV — 0031_prevent_self_like.sql
-- 본인이 작성한 의견에는 공감(like)할 수 없도록 차단.
--
-- 기존 insert 정책은 auth.uid() = user_id 만 확인했다. 여기에 "대상 의견의
-- 작성자가 본인이 아닐 것" 조건을 추가한다. UI 도 본인 의견의 공감 버튼을
-- 비활성화하지만, DB 레벨에서도 차단해 신뢰 경계를 일치시킨다.
--
-- 이미 테스트 중 생성된 자기 공감 데이터가 있으면 먼저 정리한다.
-- ============================================================================

-- (1) 기존 자기 공감 데이터 정리
delete from public.likes l
using public.opinions o
where l.opinion_id = o.id
  and l.user_id = o.author_id;

-- (2) insert 정책 재정의: 본인 && 본인 의견이 아님
drop policy if exists "insert own like" on public.likes;
create policy "insert own like"
  on public.likes for insert
  with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.opinions o
      where o.id = opinion_id and o.author_id = auth.uid()
    )
  );
