-- Accountability App — add 'bisexual' orientation option and an avatars
-- storage bucket for profile photos.
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- Add 'bisexual' to the sexual orientation options.
alter table public.profiles
  drop constraint if exists profiles_sexual_orientation_check;
alter table public.profiles
  add constraint profiles_sexual_orientation_check
  check (sexual_orientation in (
    'male', 'female', 'gay', 'lesbian', 'bisexual', 'prefer_not_to_say'
  ));

-- Public "avatars" bucket: anyone can view, but a user may only write files
-- inside their own folder (named after their user id).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatar images are publicly readable" on storage.objects;
create policy "Avatar images are publicly readable" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own avatar" on storage.objects;
create policy "Users delete own avatar" on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
