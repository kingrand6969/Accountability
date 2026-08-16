-- Server-authorized completed challenge history for the Buddy Card gallery.
-- Applying this migration is a separately approved release action.

create or replace function public.buddy_completed_challenges(p_target uuid)
returns table(
  id uuid,
  title text,
  metric text,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with access as (
    select public.buddy_card_access_mode(p_target) as mode
  )
  select
    c.id,
    c.title,
    c.metric,
    c.ends_at
  from public.challenge_participants cp
  join public.challenges c on c.id = cp.challenge_id
  join public.profiles p on p.id = p_target
  cross join access
  where cp.user_id = p_target
    -- A retained participant record plus an ended challenge is the completion
    -- state available in the current schema. This deliberately does not claim
    -- a win; challenge wins remain a separate server-calculated metric.
    and c.ends_at <= now()
    and cp.joined_at <= c.ends_at
    and (
      access.mode in ('self', 'buddy')
      or (
        access.mode = 'public'
        and coalesce(p.buddy_card -> 'show_medals' = 'true'::jsonb, false)
      )
    )
  order by c.ends_at desc
  limit 100;
$$;

revoke execute on function public.buddy_completed_challenges(uuid) from public, anon;
grant execute on function public.buddy_completed_challenges(uuid) to authenticated;

comment on function public.buddy_completed_challenges(uuid) is
  'Returns ended challenges retained on the target participant record only when the caller may open that target Buddy Card achievement gallery.';

notify pgrst, 'reload schema';
