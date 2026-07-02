-- Stories (24h ephemeral photo posts) + Groups (communities with member-only feeds).

-- ============ STORIES ============
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  image_url text not null,
  caption text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

create index if not exists stories_active_idx
  on public.stories (expires_at, created_at);

alter table public.stories enable row level security;

drop policy if exists stories_select on public.stories;
create policy stories_select on public.stories
  for select to authenticated
  using (expires_at > now() or user_id = auth.uid());

drop policy if exists stories_insert on public.stories;
create policy stories_insert on public.stories
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists stories_delete on public.stories;
create policy stories_delete on public.stories
  for delete to authenticated
  using (user_id = auth.uid());

-- ============ GROUPS ============
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 80),
  description text,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_idx on public.group_members (user_id);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- groups are discoverable by any signed-in user (public groups MVP)
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated using (true);

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups
  for delete to authenticated using (created_by = auth.uid());

drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members
  for select to authenticated using (true);

-- join yourself only
drop policy if exists group_members_insert on public.group_members;
create policy group_members_insert on public.group_members
  for insert to authenticated with check (user_id = auth.uid());

-- leave yourself; group creator can remove anyone
drop policy if exists group_members_delete on public.group_members;
create policy group_members_delete on public.group_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );

-- creator automatically becomes admin member
create or replace function public.add_group_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'admin')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists groups_add_creator on public.groups;
create trigger groups_add_creator
  after insert on public.groups
  for each row execute function public.add_group_creator();

-- ============ POSTS GAIN AN OPTIONAL GROUP ============
alter table public.posts
  add column if not exists group_id uuid references public.groups (id) on delete cascade;

create index if not exists posts_group_idx on public.posts (group_id, created_at desc);

-- Rebuild posts SELECT policy: public posts for everyone signed-in,
-- group posts for members only.
drop policy if exists "Posts readable by authenticated" on public.posts;
create policy "Posts readable by authenticated" on public.posts
  for select to authenticated
  using (
    group_id is null
    or exists (
      select 1 from public.group_members m
      where m.group_id = posts.group_id and m.user_id = auth.uid()
    )
  );

-- Rebuild posts INSERT policy: own posts; into a group only if a member.
drop policy if exists "Users insert own posts" on public.posts;
create policy "Users insert own posts" on public.posts
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      group_id is null
      or exists (
        select 1 from public.group_members m
        where m.group_id = posts.group_id and m.user_id = auth.uid()
      )
    )
  );
