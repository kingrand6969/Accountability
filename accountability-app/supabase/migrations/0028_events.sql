-- Events: announcing one auto-creates a group; "Attend" = join that group.
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  starts_at timestamptz not null,
  location text,
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select to authenticated using (true);

drop policy if exists events_insert on public.events;
create policy events_insert on public.events
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists events_delete on public.events;
create policy events_delete on public.events
  for delete to authenticated using (created_by = auth.uid());

alter table public.posts
  add column if not exists event_id uuid references public.events (id) on delete cascade;
