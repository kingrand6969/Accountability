-- 0067: leaderboard location integrity.
--
-- THREAT: profiles.city / profiles.country decide city+country leaderboard rank,
-- and the app wrote them straight from the client. Anyone could bypass the app
-- and assert `city = 'Tiny Village'` to be #1 there, or hop between cities to
-- farm ranks. GPS was collected but never enforced.
--
-- FIX: the place a member RANKS in is now server-authoritative.
--   * clients may CLEAR their place (privacy / opt-out is always allowed)
--     but may never ASSERT one — that requires the set-location Edge Function,
--     which reverse-geocodes the device's raw GPS coordinates server-side.
--   * changes are rate-limited (cooldown) so nobody hops leaderboards.
--   * every change is logged for admin review.
--   * only verified places are eligible for the leaderboard.

alter table public.profiles
  add column if not exists location_verified boolean not null default false,
  add column if not exists city_set_at        timestamptz,
  add column if not exists location_lat       numeric,
  add column if not exists location_lng       numeric,
  add column if not exists location_flagged   boolean not null default false;

-- Existing city/country values were client-supplied and therefore untrusted:
-- keep them for display, but they must be re-verified from GPS before they can
-- rank again.
update public.profiles set location_verified = false where location_verified is distinct from false;

-- ── audit trail ──────────────────────────────────────────────────────────────
create table if not exists public.location_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  old_city text,
  old_country text,
  new_city text,
  new_country text,
  lat numeric,
  lng numeric,
  ip text,
  source text not null default 'gps',   -- gps | admin | cleared
  created_at timestamptz not null default now()
);
alter table public.location_changes enable row level security; -- server/admin only
create index if not exists location_changes_user_idx
  on public.location_changes (user_id, created_at desc);

-- ── the guard: clients can erase a place, never claim one ────────────────────
create or replace function public.guard_location_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- the Edge Function (service role) is the only writer allowed to assert a place
  if current_user = 'service_role' or coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  -- asserting / changing a place from the client is refused …
  if new.city is distinct from old.city and new.city is not null then
    raise exception 'Your leaderboard location is set from your device GPS, not typed.'
      using errcode = '42501';
  end if;
  if new.country is distinct from old.country and new.country is not null then
    raise exception 'Your leaderboard location is set from your device GPS, not typed.'
      using errcode = '42501';
  end if;

  -- … but clearing it (opt-out, data minimisation) is always allowed, and it
  -- drops the verification and coordinates with it.
  if new.city is null then
    new.location_verified := false;
    new.location_lat := null;
    new.location_lng := null;
  else
    -- unchanged place: server-owned fields keep their values, whatever the
    -- client tried to send
    new.location_verified := old.location_verified;
    new.location_lat := old.location_lat;
    new.location_lng := old.location_lng;
  end if;
  new.city_set_at      := old.city_set_at;
  new.location_flagged := old.location_flagged;
  return new;
end $$;

drop trigger if exists guard_location on public.profiles;
create trigger guard_location before update on public.profiles
  for each row execute function public.guard_location_columns();

-- ── leaderboard: only GPS-verified places may rank ───────────────────────────
create or replace function public.leaderboard(p_scope text, p_metric text, p_period text)
returns table(user_id uuid, display_name text, avatar_url text, city text, country text, score numeric, rnk bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  v_start timestamptz := public.compete_period_start(p_period);
  v_city text;
  v_country text;
begin
  select p.city, p.country into v_city, v_country from public.profiles p where p.id = auth.uid();
  return query
  with elig as (
    select p.id, p.display_name, p.avatar_url, p.city, p.country
    from public.profiles p
    where p.share_location = true
      and p.country is not null
      and p.location_verified = true      -- ← spoofed / legacy places can't rank
      and p.location_flagged = false      -- ← admin-flagged accounts sit out
      and (
        (p_scope = 'country' and p.country = v_country)
        or (p_scope = 'city' and p.country = v_country and p.city is not null and p.city = v_city)
      )
  ),
  scored as (
    select e.id, e.display_name, e.avatar_url, e.city, e.country,
           public.compete_score(e.id, p_metric, v_start, now()) as score
    from elig e
  )
  select s.id, s.display_name, s.avatar_url, s.city, s.country, s.score,
         rank() over (order by s.score desc) as rnk
  from scored s
  where s.score > 0
  order by s.score desc
  limit 100;
end $$;

-- ── admin tools ──────────────────────────────────────────────────────────────
create or replace function public.admin_list_location_changes(p_user uuid default null, p_limit int default 100)
returns json language plpgsql stable security definer set search_path = public as $$
declare result json;
begin
  perform admin_assert();
  select coalesce(json_agg(row_to_json(t)), '[]'::json) into result from (
    select c.id, c.user_id, p.display_name, u.email,
           c.old_city, c.old_country, c.new_city, c.new_country,
           c.lat, c.lng, c.ip, c.source, c.created_at
    from public.location_changes c
    left join public.profiles p on p.id = c.user_id
    left join auth.users u on u.id = c.user_id
    where p_user is null or c.user_id = p_user
    order by c.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 300))
  ) t;
  return result;
end $$;

/** Admin override: clear someone's place (and let them re-verify immediately). */
create or replace function public.admin_clear_location(p_user uuid, p_flag boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_assert();
  insert into public.location_changes (user_id, old_city, old_country, source)
    select p_user, p.city, p.country, 'admin' from public.profiles p where p.id = p_user;
  update public.profiles
     set city = null, country = null, location_verified = false,
         location_lat = null, location_lng = null, city_set_at = null,
         location_flagged = p_flag
   where id = p_user;
end $$;

grant execute on function
  public.admin_list_location_changes(uuid, int),
  public.admin_clear_location(uuid, boolean)
  to authenticated;
