-- Accountability App — photo posts in the feed.
-- Adds an image to posts + a public 'post-images' bucket (own-folder writes).
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.

alter table public.posts add column if not exists image_url text;

insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

drop policy if exists "Post images are publicly readable" on storage.objects;
create policy "Post images are publicly readable" on storage.objects
  for select using (bucket_id = 'post-images');

drop policy if exists "Users upload own post images" on storage.objects;
create policy "Users upload own post images" on storage.objects
  for insert with check (
    bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own post images" on storage.objects;
create policy "Users delete own post images" on storage.objects
  for delete using (
    bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text
  );
