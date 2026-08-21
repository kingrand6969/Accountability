begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recorded_at timestamptz not null default now(),
  weight_kg numeric(6,2) not null check (weight_kg between 20 and 500),
  height_cm numeric(5,2) not null check (height_cm between 80 and 250),
  created_at timestamptz not null default now()
);

create index if not exists body_measurements_owner_recorded_at_idx
  on public.body_measurements (user_id, recorded_at desc);

alter table public.body_measurements enable row level security;

revoke all on table public.body_measurements from public, anon, authenticated;
grant select, insert, update, delete on table public.body_measurements to authenticated;

drop policy if exists body_measurements_select on public.body_measurements;
create policy body_measurements_select
  on public.body_measurements
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists body_measurements_insert on public.body_measurements;
create policy body_measurements_insert
  on public.body_measurements
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists body_measurements_update on public.body_measurements;
create policy body_measurements_update
  on public.body_measurements
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists body_measurements_delete on public.body_measurements;
create policy body_measurements_delete
  on public.body_measurements
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null check (char_length(storage_path) between 1 and 220),
  check (
    storage_path = btrim(storage_path)
    and split_part(storage_path, '/', 1) = user_id::text
    and storage_path like user_id::text || '/%'
    and substring(storage_path from char_length(user_id::text) + 2) <> ''
    and storage_path not like '%//%'
    and storage_path not like '%/'
  ),
  captured_at timestamptz not null default now(),
  weight_kg numeric(6,2) check (weight_kg between 20 and 500),
  created_at timestamptz not null default now(),
  unique (user_id, storage_path)
);

create index if not exists progress_photos_owner_captured_at_idx
  on public.progress_photos (user_id, captured_at desc);

alter table public.progress_photos enable row level security;

revoke all on table public.progress_photos from public, anon, authenticated;
grant select, insert, update, delete on table public.progress_photos to authenticated;

drop policy if exists progress_photos_select on public.progress_photos;
create policy progress_photos_select
  on public.progress_photos
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists progress_photos_insert on public.progress_photos;
create policy progress_photos_insert
  on public.progress_photos
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists progress_photos_update on public.progress_photos;
create policy progress_photos_update
  on public.progress_photos
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists progress_photos_delete on public.progress_photos;
create policy progress_photos_delete
  on public.progress_photos
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do update
set name = excluded.name,
    public = false;

drop policy if exists progress_photos_storage_select on storage.objects;
create policy progress_photos_storage_select
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists progress_photos_storage_insert on storage.objects;
create policy progress_photos_storage_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists progress_photos_storage_delete on storage.objects;
create policy progress_photos_storage_delete
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
