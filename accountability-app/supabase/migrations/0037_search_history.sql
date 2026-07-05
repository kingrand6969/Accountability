-- Search history: free users keep 30 days, Pro keeps it for life.
-- Retention is enforced at read/cleanup time in the client API (Pro status
-- lives client-side until RevenueCat) — rows older than 30 days are deleted
-- for free users on load.

create table if not exists public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  query text not null check (length(trim(query)) between 1 and 120),
  created_at timestamptz not null default now()
);

create index if not exists search_history_user_idx
  on public.search_history (user_id, created_at desc);

alter table public.search_history enable row level security;

create policy search_history_select on public.search_history
  for select to authenticated using (user_id = auth.uid());
create policy search_history_insert on public.search_history
  for insert to authenticated with check (user_id = auth.uid());
create policy search_history_delete on public.search_history
  for delete to authenticated using (user_id = auth.uid());
