-- Accountability App — Accountability Buddy (workout-partner matching).
-- Safety by design: chat is only possible AFTER a mutual (double opt-in) link.
-- Run in Supabase dashboard: SQL Editor -> New query -> paste -> Run.

alter table public.profiles
  add column if not exists buddy_opt_in boolean not null default false;

-- REQUESTS: one user asks another to be buddies.
create table if not exists public.buddy_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (from_user, to_user),
  check (from_user <> to_user)
);
alter table public.buddy_requests enable row level security;
drop policy if exists "See own requests" on public.buddy_requests;
create policy "See own requests" on public.buddy_requests
  for select using (auth.uid() = from_user or auth.uid() = to_user);
drop policy if exists "Send requests" on public.buddy_requests;
create policy "Send requests" on public.buddy_requests
  for insert with check (auth.uid() = from_user);
drop policy if exists "Respond to requests" on public.buddy_requests;
create policy "Respond to requests" on public.buddy_requests
  for update using (auth.uid() = to_user);

-- LINKS: the confirmed mutual buddy relationship (normalized user_a < user_b).
create table if not exists public.buddy_links (
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
alter table public.buddy_links enable row level security;
drop policy if exists "See own links" on public.buddy_links;
create policy "See own links" on public.buddy_links
  for select using (auth.uid() = user_a or auth.uid() = user_b);
drop policy if exists "Leave a link" on public.buddy_links;
create policy "Leave a link" on public.buddy_links
  for delete using (auth.uid() = user_a or auth.uid() = user_b);

-- MESSAGES: 1:1 chat, only between linked buddies.
create table if not exists public.buddy_messages (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null references public.profiles (id) on delete cascade,
  recipient uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists buddy_messages_pair_idx
  on public.buddy_messages (sender, recipient, created_at);
alter table public.buddy_messages enable row level security;

-- BLOCKS & REPORTS (safety).
create table if not exists public.buddy_blocks (
  blocker uuid not null references public.profiles (id) on delete cascade,
  blocked uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);
alter table public.buddy_blocks enable row level security;
drop policy if exists "Manage own blocks" on public.buddy_blocks;
create policy "Manage own blocks" on public.buddy_blocks
  for all using (auth.uid() = blocker) with check (auth.uid() = blocker);

create table if not exists public.buddy_reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references public.profiles (id) on delete cascade,
  reported uuid not null references public.profiles (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.buddy_reports enable row level security;
drop policy if exists "File own reports" on public.buddy_reports;
create policy "File own reports" on public.buddy_reports
  for insert with check (auth.uid() = reporter);

-- Helper: are two users linked buddies?
create or replace function public.are_buddies(u1 uuid, u2 uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.buddy_links
    where user_a = least(u1, u2) and user_b = greatest(u1, u2)
  );
$$;

-- Messages RLS depends on an existing link.
drop policy if exists "Read own messages" on public.buddy_messages;
create policy "Read own messages" on public.buddy_messages
  for select using (auth.uid() = sender or auth.uid() = recipient);
drop policy if exists "Send to buddies only" on public.buddy_messages;
create policy "Send to buddies only" on public.buddy_messages
  for insert with check (auth.uid() = sender and public.are_buddies(sender, recipient));

-- Accept a request: only the recipient, only if pending. Creates the link.
create or replace function public.accept_buddy_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.buddy_requests
    where id = p_request_id and to_user = auth.uid() and status = 'pending';
  if not found then raise exception 'No such pending request'; end if;
  update public.buddy_requests set status = 'accepted' where id = p_request_id;
  insert into public.buddy_links (user_a, user_b)
    values (least(r.from_user, r.to_user), greatest(r.from_user, r.to_user))
    on conflict do nothing;
end;
$$;
