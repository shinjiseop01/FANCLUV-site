-- ============================================================================
-- FANCLUV — 0012_avatars_storage.sql  (프로필 이미지 Storage)
-- Supabase 대시보드 → SQL Editor 에서 실행하세요. (0011 이후)
--
--  프로필 이미지를 저장할 public 버킷 `avatars` 를 만들고,
--  본인 폴더(`{auth.uid}/...`)에만 업로드/수정/삭제할 수 있도록 RLS 를 건다.
--  경로 규칙: avatars/{userId}/avatar.png  (avatarStorage.js 와 일치)
-- ============================================================================

-- public 읽기 버킷 생성(이미 있으면 무시)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 누구나 읽기(공개 프로필 이미지)
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- 본인 폴더에만 업로드
drop policy if exists "avatars owner insert" on storage.objects;
create policy "avatars owner insert"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 본인 폴더 파일만 수정(upsert)
drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 본인 폴더 파일만 삭제
drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
