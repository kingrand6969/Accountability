begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Keep the active two-argument rendered-card flow from 0096 while refreshing
-- its public fallback metadata, rejecting null references and hardening name
-- resolution. Ownership, moderation and private-media checks remain unchanged.
create or replace function public.create_public_post_share(p_post uuid, p_preview_ref text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p record; share_id uuid;
begin
  if p_preview_ref is null
    or p_preview_ref !~ '^r2://share-cards/'
    or split_part(p_preview_ref, '/', 4) <> auth.uid()::text
  then
    raise exception 'Invalid share-card reference.' using errcode = '22023';
  end if;
  select id, user_id, body into p from public.posts
   where id = p_post and user_id = auth.uid() and moderation_state = 'visible';
  if not found then
    raise exception 'That post cannot be shared by this account.' using errcode = '42501';
  end if;
  insert into public.public_shares(owner_id, post_id, title, description, preview_image_url, preview_image_ref)
  values (auth.uid(), p.id, left(coalesce(nullif(trim(p.body), ''), 'A win from Mantle'), 160),
          'A progress update shared with permission from Mantle.', null, p_preview_ref)
  returning id into share_id;
  return share_id;
end;
$$;

revoke execute on function public.create_public_post_share(uuid, text) from public, anon;
grant execute on function public.create_public_post_share(uuid, text) to authenticated, service_role;

commit;
