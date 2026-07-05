-- Memories: personal photo/video vault. Free tier = 1 GiB per user,
-- enforced in the database (not just the client) so it can't be bypassed.

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path text not null unique,
  kind text not null check (kind in ('image', 'video')),
  bytes bigint not null check (bytes > 0 and bytes <= 62914560), -- 60 MB/file cap
  created_at timestamptz not null default now()
);

create index if not exists memories_user_idx on public.memories (user_id, created_at desc);

alter table public.memories enable row level security;

create policy memories_select on public.memories
  for select to authenticated using (user_id = auth.uid());
create policy memories_insert on public.memories
  for insert to authenticated with check (user_id = auth.uid());
create policy memories_delete on public.memories
  for delete to authenticated using (user_id = auth.uid());

-- 1 GiB quota, checked at insert time server-side.
create or replace function public.memories_quota_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare used bigint;
begin
  select coalesce(sum(bytes), 0) into used
    from public.memories where user_id = new.user_id;
  if used + new.bytes > 1073741824 then
    raise exception 'Memories storage is full (1 GB). Delete some memories to save more.';
  end if;
  return new;
end;
$$;

drop trigger if exists memories_quota on public.memories;
create trigger memories_quota
  before insert on public.memories
  for each row execute function public.memories_quota_check();

-- Usage meter for the client.
create or replace function public.memories_usage()
returns bigint
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(bytes), 0) from public.memories where user_id = auth.uid();
$$;

grant execute on function public.memories_usage() to authenticated;

-- Private bucket: only the owner can read/write their folder.
insert into storage.buckets (id, name, public)
  values ('memories', 'memories', false)
  on conflict (id) do nothing;

drop policy if exists memories_storage_insert on storage.objects;
create policy memories_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'memories'
    and (storage.foldername(name))[1] = auth.uid()::text
    -- belt & braces: refuse new files once the ledger says the quota is spent
    and (select coalesce(sum(bytes), 0) from public.memories
           where user_id = auth.uid()) < 1073741824
  );

drop policy if exists memories_storage_select on storage.objects;
create policy memories_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'memories' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists memories_storage_delete on storage.objects;
create policy memories_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'memories' and (storage.foldername(name))[1] = auth.uid()::text);
