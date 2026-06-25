-- Accountability App — Phase 0 Part 2: profiles table
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  bio text,
  birthday date,
  birthday_private boolean not null default true,
  relationship_status text
    check (relationship_status in ('single', 'in_relationship', 'prefer_not_to_say')),
  area text,
  show_last_active boolean not null default true,
  last_active_at timestamptz,
  created_at timestamptz not null default now()
);

-- Row Level Security: logged-in users can read any profile (social app),
-- but can only create/update their OWN profile.
alter table public.profiles enable row level security;

drop policy if exists "Profiles readable by authenticated users" on public.profiles;
create policy "Profiles readable by authenticated users"
  on public.profiles for select
  using (auth.role() = 'authenticated');

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
