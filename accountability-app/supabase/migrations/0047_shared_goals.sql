-- Saving Buddies (Pro): shared savings goals — e.g. "Travel to Vietnam" —
-- tracked as a combined pot with itemized per-member contributions.
--  * Creating a shared goal is Pro-gated server-side (like challenges).
--  * Members must be the creator's accepted buddies (safety: no strangers).
--  * Every read is member-scoped; contributions are insert-own only.

create table if not exists public.shared_goals (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  target numeric not null check (target > 0),
  created_at timestamptz not null default now()
);
alter table public.shared_goals enable row level security;

create table if not exists public.shared_goal_members (
  goal_id uuid not null references public.shared_goals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (goal_id, user_id)
);
alter table public.shared_goal_members enable row level security;

create table if not exists public.shared_goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.shared_goals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric not null check (amount > 0),
  note text check (note is null or length(note) <= 120),
  created_at timestamptz not null default now()
);
alter table public.shared_goal_contributions enable row level security;
create index if not exists sgc_goal_idx on public.shared_goal_contributions (goal_id, created_at desc);

-- membership check as SECURITY DEFINER so policies don't recurse
create or replace function public.is_goal_member(p_goal uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shared_goal_members m
    where m.goal_id = p_goal and m.user_id = p_user
  );
$$;
revoke execute on function public.is_goal_member(uuid, uuid) from public, anon;
grant execute on function public.is_goal_member(uuid, uuid) to authenticated;

-- goals
drop policy if exists sg_select on public.shared_goals;
create policy sg_select on public.shared_goals
  for select using (public.is_goal_member(id, auth.uid()));

drop policy if exists sg_insert on public.shared_goals;
create policy sg_insert on public.shared_goals
  for insert with check (
    auth.uid() = creator_id
    and exists (select 1 from public.profiles where id = auth.uid() and is_pro = true)
  );

drop policy if exists sg_update on public.shared_goals;
create policy sg_update on public.shared_goals
  for update using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

drop policy if exists sg_delete on public.shared_goals;
create policy sg_delete on public.shared_goals
  for delete using (auth.uid() = creator_id);

-- members: creator adds self or their accepted buddies; anyone can leave
drop policy if exists sgm_select on public.shared_goal_members;
create policy sgm_select on public.shared_goal_members
  for select using (public.is_goal_member(goal_id, auth.uid()));

drop policy if exists sgm_insert on public.shared_goal_members;
create policy sgm_insert on public.shared_goal_members
  for insert with check (
    exists (select 1 from public.shared_goals g where g.id = goal_id and g.creator_id = auth.uid())
    and (user_id = auth.uid() or public.are_buddies(auth.uid(), user_id))
  );

drop policy if exists sgm_delete on public.shared_goal_members;
create policy sgm_delete on public.shared_goal_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.shared_goals g where g.id = goal_id and g.creator_id = auth.uid())
  );

-- contributions: members read all, write their own
drop policy if exists sgc_select on public.shared_goal_contributions;
create policy sgc_select on public.shared_goal_contributions
  for select using (public.is_goal_member(goal_id, auth.uid()));

drop policy if exists sgc_insert on public.shared_goal_contributions;
create policy sgc_insert on public.shared_goal_contributions
  for insert with check (
    auth.uid() = user_id and public.is_goal_member(goal_id, auth.uid())
  );

drop policy if exists sgc_delete on public.shared_goal_contributions;
create policy sgc_delete on public.shared_goal_contributions
  for delete using (auth.uid() = user_id);
