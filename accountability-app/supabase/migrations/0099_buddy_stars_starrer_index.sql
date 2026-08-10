create index if not exists buddy_stars_starrer_target_idx on public.buddy_stars (starrer, target);

create or replace function public.personal_feed_post_ids(
  p_mode text,
  p_before timestamptz,
  p_limit integer
)
returns table(id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select p.id
  from public.posts p
  where p_mode in ('buddies', 'discover')
    and p.group_id is null
    and p.page_id is null
    and (p_before is null or p.created_at < p_before)
    and not exists (
      select 1
      from public.post_hides h
      where h.post_id = p.id
        and h.user_id = auth.uid()
    )
    and (
      (
        p_mode = 'buddies'
        and (
          p.user_id = auth.uid()
          or public.are_buddies(auth.uid(), p.user_id)
          or exists (
            select 1
            from public.buddy_stars s
            where s.starrer = auth.uid()
              and s.target = p.user_id
          )
        )
      )
      or (
        p_mode = 'discover'
        and p.audience = 'public'
        and p.user_id <> auth.uid()
        and not public.are_buddies(auth.uid(), p.user_id)
        and not exists (
          select 1
          from public.buddy_stars s
          where s.starrer = auth.uid()
            and s.target = p.user_id
        )
      )
    )
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 0), 100)
$$;

revoke execute on function public.personal_feed_post_ids(text, timestamptz, integer) from public, anon;
grant execute on function public.personal_feed_post_ids(text, timestamptz, integer) to authenticated;
