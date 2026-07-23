-- Buddy card: a member's public performance line — the same five metrics the
-- Compete leaderboards use (consistency, points, avg km/day, distance, challenge
-- wins), all-time, plus where they place among their OWN buddies by consistency.
--
-- Reuses compete_score() (security-definer, internal) so this returns only
-- aggregate scores — never raw activity rows — exactly like every other board.
-- Any authenticated member may read another member's card line; the numbers are
-- the same ones already shown on the public leaderboards they compete on.

create or replace function public.member_card_stats(p_target uuid)
returns table(
  consistency numeric,
  points numeric,
  avgkm numeric,
  distance numeric,
  chwin numeric,
  buddies_rank bigint,
  buddies_total bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_all timestamptz := '2000-01-01'::timestamptz;
  v_cons numeric := public.compete_score(p_target, 'consistency', '2000-01-01'::timestamptz, now());
begin
  return query
  with people as (
    -- the target plus each of their accepted buddies
    select p_target as uid
    union
    select case when bl.user_a = p_target then bl.user_b else bl.user_a end
    from public.buddy_links bl
    where bl.user_a = p_target or bl.user_b = p_target
  ),
  scored as (
    select pe.uid, public.compete_score(pe.uid, 'consistency', v_all, now()) as score
    from people pe
  ),
  active as (select uid, score from scored where score > 0)
  select
    v_cons,
    public.compete_score(p_target, 'points', v_all, now()),
    public.compete_score(p_target, 'avgkm', v_all, now()),
    public.compete_score(p_target, 'distance', v_all, now()),
    public.compete_score(p_target, 'chwin', v_all, now()),
    -- rank among their buddy group by all-time consistency (null until they've
    -- logged at least one active day)
    case when v_cons <= 0 then null::bigint
         else (select count(*) + 1 from active a where a.score > v_cons) end,
    (select count(*) from active);
end;
$$;

revoke execute on function public.member_card_stats(uuid) from public, anon;
grant execute on function public.member_card_stats(uuid) to authenticated;
