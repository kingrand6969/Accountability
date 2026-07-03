-- Stars (like FB follows) + public stats for buddy cards.
create table if not exists public.buddy_stars (
  target uuid not null references public.profiles (id) on delete cascade,
  starrer uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (target, starrer),
  check (target <> starrer)
);

alter table public.buddy_stars enable row level security;

drop policy if exists buddy_stars_select on public.buddy_stars;
create policy buddy_stars_select on public.buddy_stars
  for select to authenticated using (true);

drop policy if exists buddy_stars_insert on public.buddy_stars;
create policy buddy_stars_insert on public.buddy_stars
  for insert to authenticated with check (starrer = auth.uid());

drop policy if exists buddy_stars_delete on public.buddy_stars;
create policy buddy_stars_delete on public.buddy_stars
  for delete to authenticated using (starrer = auth.uid());

-- Aggregates only (no raw rows leak): buddies, total km, stars.
create or replace function public.buddy_public_stats(p_target uuid)
returns table (buddies bigint, km numeric, stars bigint)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*) from buddy_links l
      where l.user_a = p_target or l.user_b = p_target),
    round(coalesce(
      (select sum(a.distance_m) from activities a where a.user_id = p_target),
      0) / 1000.0, 1),
    (select count(*) from buddy_stars s where s.target = p_target);
$$;

grant execute on function public.buddy_public_stats(uuid) to authenticated;
