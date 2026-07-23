-- Buddy card: a member's live leaderboard standing (this week's consistency)
-- within THEIR OWN city and country. Only returns data when the member has
-- opted into location sharing — otherwise every field is null, so a card can
-- never leak a position the owner didn't put on a public board.

create or replace function public.member_board_rank(p_user uuid)
returns table(
  city text, country text,
  city_rank bigint, city_total bigint,
  country_rank bigint, country_total bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_city text; v_country text; v_share boolean;
  v_start timestamptz := now() - interval '7 days';
  v_score numeric;
begin
  select p.city, p.country, p.share_location into v_city, v_country, v_share
  from public.profiles p where p.id = p_user;
  if not coalesce(v_share, false) or v_country is null then
    return query select null::text, null::text, null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  v_score := public.compete_score(p_user, 'consistency', v_start, now());

  return query
  with elig as (
    select p.id, p.city as member_city
    from public.profiles p
    where p.share_location = true and p.country = v_country
  ),
  scored as (
    select e.id, e.member_city,
           public.compete_score(e.id, 'consistency', v_start, now()) as score
    from elig e
  ),
  in_country as (select * from scored where scored.score > 0),
  in_city as (
    select * from in_country
    where v_city is not null and in_country.member_city = v_city
  )
  select
    v_city, v_country,
    case when v_city is null or v_score <= 0 then null
         else (select count(*) + 1 from in_city c where c.score > v_score) end,
    case when v_city is null then null else (select count(*) from in_city) end,
    case when v_score <= 0 then null
         else (select count(*) + 1 from in_country c where c.score > v_score) end,
    (select count(*) from in_country);
end;
$$;

revoke execute on function public.member_board_rank(uuid) from public, anon;
grant execute on function public.member_board_rank(uuid) to authenticated;
