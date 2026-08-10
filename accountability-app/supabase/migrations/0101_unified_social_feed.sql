-- Unified social feed candidate selection. Posts RLS remains the final read boundary.
create or replace function public.unified_feed_post_ids(
  p_before timestamptz,
  p_before_id uuid,
  p_limit integer default 20
)
returns table (id uuid, source text, suggested boolean)
language sql
stable
security invoker
set search_path = public
as $$
  with bounded_limit(value) as (
    select least(greatest(coalesce(p_limit, 20), 1), 50)
  ),
  eligible_posts as (
    select p.id, p.user_id, p.group_id, p.page_id, p.audience, p.created_at,
           (select count(*) from public.post_likes pl where pl.post_id = p.id)
           + (select count(*) from public.post_comments pc where pc.post_id = p.id)
             as engagement_score
      from public.posts p
     where p.moderation_state = 'visible'
       and not public.users_blocked(auth.uid(), p.user_id)
       and not exists (
         select 1
           from public.post_hides h
          where h.post_id = p.id
            and h.user_id = auth.uid()
       )
  ),
  raw_connections as (
    select p.id, p.created_at, p.engagement_score,
           case
             when p.user_id = auth.uid() then 'self'
             when public.are_buddies(auth.uid(), p.user_id) then 'buddy'
             when exists (
               select 1
                 from public.buddy_stars s
                where s.starrer = auth.uid()
                  and s.target = p.user_id
             ) then 'followed_person'
             when p.group_id is not null and exists (
               select 1
                 from public.group_members gm
                where gm.group_id = p.group_id
                  and gm.user_id = auth.uid()
             ) then 'joined_group'
             when p.page_id is not null and exists (
               select 1
                 from public.page_follows pf
                where pf.page_id = p.page_id
                  and pf.user_id = auth.uid()
             ) then 'followed_page'
           end as source
      from eligible_posts p
  ),
  connection_candidates as (
    select c.id, c.created_at, c.engagement_score, c.source,
           row_number() over (
             partition by c.id
             order by case c.source when 'self' then 0 when 'buddy' then 1 when 'followed_person' then 2 when 'joined_group' then 3 when 'followed_page' then 4 end,
                      c.created_at desc, c.engagement_score desc, c.id asc
           ) as candidate_rank
      from raw_connections c
     where c.source is not null
  ),
  ranked_connections as (
    select c.id, c.source, c.created_at, c.engagement_score,
           row_number() over (
             order by case c.source when 'self' then 0 when 'buddy' then 1 when 'followed_person' then 2 when 'joined_group' then 3 when 'followed_page' then 4 end,
                      c.created_at desc, c.engagement_score desc, c.id asc
           ) as connection_rank
      from connection_candidates c
     where c.candidate_rank = 1
  ),
  raw_suggestions as (
    select p.id, p.created_at, p.engagement_score
      from eligible_posts p
     where p.audience = 'public'
       and p.user_id <> auth.uid()
       and not public.are_buddies(auth.uid(), p.user_id)
       and not exists (
         select 1 from public.buddy_stars s
          where s.starrer = auth.uid() and s.target = p.user_id
       )
       and not exists (
         select 1 from public.group_members gm
          where gm.group_id = p.group_id and gm.user_id = auth.uid()
       )
       and not exists (
         select 1 from public.page_follows pf
          where pf.page_id = p.page_id and pf.user_id = auth.uid()
       )
  ),
  suggestion_candidates as (
    select s.id, s.created_at, s.engagement_score,
           row_number() over (
             partition by s.id order by s.created_at desc, s.engagement_score desc, s.id asc
           ) as candidate_rank
      from raw_suggestions s
  ),
  ranked_suggestions as (
    select s.id, s.created_at, s.engagement_score,
           row_number() over (
             order by s.created_at desc, s.engagement_score desc, s.id asc
           ) as suggestion_rank
      from suggestion_candidates s
     where s.candidate_rank = 1
  ),
  connection_count as (
    select count(*) as connection_count from ranked_connections
  ),
  interleaved as (
    select c.id, c.source, false as suggested, c.created_at,
           c.connection_rank + floor((c.connection_rank - 1) / 4.0) as output_position
      from ranked_connections c
    union all
    select s.id, 'suggested'::text as source, true as suggested, s.created_at,
           s.suggestion_rank * 5 as output_position
      from ranked_suggestions s
      cross join connection_count cc
     where s.suggestion_rank <= floor(cc.connection_count / 4.0)
       and cc.connection_count > 0
  ),
  sequenced as (
    select i.id, i.source, i.suggested, i.created_at,
           row_number() over (order by i.output_position, i.id asc) as ordinal
      from interleaved i
  ),
  cursor_ordinal as (
    select 0::bigint as ordinal
     where p_before is null and p_before_id is null
    union all
    select c.ordinal
      from sequenced c
     where p_before is not null
       and p_before_id is not null
       and c.id = p_before_id and c.created_at = p_before
  )
  select s.id, s.source, s.suggested
    from sequenced s
    cross join cursor_ordinal co
   where (
     (p_before is null and p_before_id is null and s.ordinal > 0)
     or (
       p_before is not null and p_before_id is not null
       and co.ordinal is not null and s.ordinal > co.ordinal
     )
   )
   order by s.ordinal
   limit (select value from bounded_limit)
$$;

revoke all on function public.unified_feed_post_ids(timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.unified_feed_post_ids(timestamptz, uuid, integer)
  to authenticated;
