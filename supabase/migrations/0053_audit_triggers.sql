-- ============================================================================
-- FANCLUV — 0053_audit_triggers.sql  (운영 감사 로그 실제 연결)
--
-- 0052 의 audit_logs 를 실제 관리자 행위에 트리거로 연결한다. 트리거는 클라이언트
-- 코드 경로와 무관하게 DB 변경 시 자동 기록하며, actor 는 auth.uid()(관리자 JWT)로 캡처한다.
--   - 회원 역할 변경:  profiles.role 변경        → 'member.role_change'
--   - 회원 정지/해제:  profiles.deactivated_at   → 'member.suspend' / 'member.unsuspend'
--   - 의견 삭제:       opinions  DELETE          → 'opinion.delete'
--   - 설문 삭제:       surveys   DELETE          → 'survey.delete'
--   - 뉴스 삭제:       team_news DELETE          → 'news.delete'
-- actor 가 없는(서비스/시스템) 변경은 기록하지 않는다(그 경로는 클라이언트 RPC 로 별도 기록).
-- ============================================================================
create or replace function public.tg_audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_role  text;
  v_action text;
  v_ttype text;
  v_tid   text;
  v_detail jsonb := '{}'::jsonb;
begin
  -- 시스템/서비스(actor 없음) 작업은 트리거로 기록하지 않는다.
  if v_actor is null then return coalesce(NEW, OLD); end if;

  if TG_TABLE_NAME = 'profiles' and TG_OP = 'UPDATE' then
    if NEW.role is distinct from OLD.role then
      v_action := 'member.role_change';
      v_detail := jsonb_build_object('from', OLD.role, 'to', NEW.role);
    elsif OLD.deactivated_at is null and NEW.deactivated_at is not null then
      v_action := 'member.suspend';
    elsif OLD.deactivated_at is not null and NEW.deactivated_at is null then
      v_action := 'member.unsuspend';
    else
      return NEW; -- 감사 대상이 아닌 프로필 변경(닉네임 등)
    end if;
    v_ttype := 'member';
    v_tid := NEW.id::text;
  elsif TG_OP = 'DELETE' then
    v_action := TG_ARGV[0];
    v_ttype  := TG_ARGV[1];
    v_tid    := OLD.id::text;
    v_detail := jsonb_build_object('title', to_jsonb(OLD) ->> 'title');
  end if;

  if v_action is null then return coalesce(NEW, OLD); end if;
  select role into v_role from public.profiles where id = v_actor;
  insert into public.audit_logs (actor_id, actor_role, action, target_type, target_id, detail)
  values (v_actor, v_role, v_action, v_ttype, v_tid, v_detail);
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists audit_profiles     on public.profiles;
drop trigger if exists audit_opinions_del on public.opinions;
drop trigger if exists audit_surveys_del  on public.surveys;
drop trigger if exists audit_news_del     on public.team_news;

create trigger audit_profiles     after update on public.profiles  for each row execute function public.tg_audit_row();
create trigger audit_opinions_del after delete on public.opinions  for each row execute function public.tg_audit_row('opinion.delete', 'opinion');
create trigger audit_surveys_del  after delete on public.surveys   for each row execute function public.tg_audit_row('survey.delete', 'survey');
create trigger audit_news_del     after delete on public.team_news for each row execute function public.tg_audit_row('news.delete', 'news');
