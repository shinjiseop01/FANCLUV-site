-- FANCLUV — 0076: K리그 구단 공식 뉴스 수집 연동
--
-- 기존 team_news(0006 생성, 0060 CMS 확장)를 재사용해 "수집된 공식 뉴스"를 저장한다.
-- 새 테이블을 만들지 않고 수집 메타 컬럼만 추가한다(기존 관리자 뉴스와 공존).
--   origin='admin'     : 관리자 작성(기존 그대로)
--   origin='collected' : news-fetcher(Edge, service_role)가 수집한 공식 뉴스
--
-- 중복 방지(P0): UNIQUE (team_id, source_article_id)
--   - 수집 뉴스는 provider가 안정 ID(seq/wr_id/document_srl)를 부여 → 원자적 upsert.
--   - 관리자 뉴스는 source_article_id IS NULL → PostgreSQL NULLS DISTINCT 기본
--     동작으로 UNIQUE 영향 없음(기존 데이터/기능 무영향).
--   - collector 동시 실행/retry/스케줄 중복 호출에도 DB 제약이 중복을 차단한다.
begin;

-- 1) 수집 메타 컬럼 (모두 additive, 기존 행은 NULL/기본값)
alter table public.team_news add column if not exists source_name       text;         -- 출처(구단명)
alter table public.team_news add column if not exists source_url        text;         -- 원문 기사 URL
alter table public.team_news add column if not exists source_article_id text;         -- 원문 안정 ID(seq/wr_id/document_srl)
alter table public.team_news add column if not exists excerpt           text;         -- 목록용 짧은 설명
alter table public.team_news add column if not exists published_at      timestamptz;  -- 원문 게시일(수집일과 구분)
alter table public.team_news add column if not exists content_hash      text;         -- 제목+본문 해시(변경 감지)
alter table public.team_news add column if not exists origin            text not null default 'admin';

-- origin 체크(기존 행은 default 'admin'으로 채워짐)
do $$ begin
  alter table public.team_news add constraint team_news_origin_chk
    check (origin in ('admin','collected'));
exception when duplicate_object then null; end $$;

-- 2) 중복 방지 UNIQUE (원자적 upsert의 arbiter)
do $$ begin
  alter table public.team_news add constraint team_news_source_article_uk
    unique (team_id, source_article_id);
exception when duplicate_object then null; end $$;

-- 3) 목록 질의 인덱스: 팀+상태+게시일 (published_at 없으면 created_at 폴백 정렬은 쿼리에서)
create index if not exists team_news_team_pub_idx
  on public.team_news (team_id, status, published_at desc nulls last, created_at desc);

-- 4) AI 요약 확장 — 핵심 키워드 + 동시 생성 락 상태
--    status='processing' placeholder 를 INSERT ... ON CONFLICT DO NOTHING 으로 선점한
--    요청만 OpenAI 를 호출한다(동시 100 요청 → AI 호출 1회).
alter table public.news_ai_summary add column if not exists keywords jsonb not null default '[]'::jsonb;
alter table public.news_ai_summary add column if not exists status   text  not null default 'ready';
do $$ begin
  alter table public.news_ai_summary add constraint news_ai_summary_status_chk
    check (status in ('processing','ready','failed'));
exception when duplicate_object then null; end $$;

-- 5) news_sources health 보강(0021 기존 필드 재사용) — 연속 실패/수집 건수만 추가
alter table public.news_sources add column if not exists consecutive_failures integer not null default 0;
alter table public.news_sources add column if not exists last_collected_count integer;

commit;
