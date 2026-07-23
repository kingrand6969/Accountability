-- 0077: total Cheers received (sum of post reactions on a member's posts) for
-- the buddy card. "Cheers" is our one appreciation currency (the feed "like"),
-- so the card's social-proof number is how many cheers a member has earned.
-- (buddy_stars stays for now; the card just no longer surfaces it.)

drop function if exists public.buddy_public_stats(uuid);
create or replace function public.buddy_public_stats(p_target uuid)
returns table (buddies bigint, km numeric, stars bigint, cheers bigint)
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
    (select count(*) from buddy_stars s where s.target = p_target),
    (select count(*) from post_likes pl
       join posts p on p.id = pl.post_id
      where p.user_id = p_target);
$$;

grant execute on function public.buddy_public_stats(uuid) to authenticated;
