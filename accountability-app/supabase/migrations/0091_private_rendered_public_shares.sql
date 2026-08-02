-- Public shares expose only an explicitly rendered, sanitized derivative.
-- Original post media remains in the private R2 bucket and is never copied to
-- a public URL. Shares stay opaque, revocable, and time limited.

alter table public.public_shares
  add column if not exists preview_image_ref text;

alter table public.public_shares
  drop constraint if exists public_shares_preview_image_ref_check;
alter table public.public_shares
  add constraint public_shares_preview_image_ref_check check (
    preview_image_ref is null or
    preview_image_ref ~ '^r2://share-cards/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$'
  );

-- The old one-argument function copied posts.image_url into the public record.
-- Remove that path so an older client cannot accidentally publish a private
-- original-media address.
drop function if exists public.create_public_post_share(uuid);

create or replace function public.create_public_post_share(
  p_post uuid,
  p_preview_ref text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  share_id uuid;
begin
  if p_preview_ref !~ '^r2://share-cards/' || split_part(p_preview_ref, '/', 4) <> auth.uid()::text then
    raise exception 'Invalid share-card reference.' using errcode = '22023';
  end if;

  select id, user_id, body into p
    from public.posts
    where id = p_post and user_id = auth.uid();
  if not found then
    raise exception 'That post cannot be shared by this account.'
      using errcode = '42501';
  end if;

  insert into public.public_shares
    (owner_id, post_id, title, description, preview_image_url, preview_image_ref)
  values (
    auth.uid(),
    p.id,
    left(coalesce(nullif(trim(p.body), ''), 'A win from AccountAbility'), 160),
    'A progress update shared with permission from AccountAbility.',
    null,
    p_preview_ref
  )
  returning id into share_id;
  return share_id;
end;
$$;

revoke all on function public.create_public_post_share(uuid, text) from public, anon;
grant execute on function public.create_public_post_share(uuid, text) to authenticated;

-- The public page receives presentation copy only. The private object reference
-- is intentionally omitted and is resolved solely by the controlled image
-- endpoint after it re-checks expiry and revocation.
create or replace function public.get_public_share(p_share uuid)
returns table(title text, description text, preview_image_url text, sender_name text)
language sql
stable
security definer
set search_path = public
as $$
  select s.title, s.description, null::text, p.display_name
  from public.public_shares s
  join public.public_profiles p on p.id = s.owner_id
  where s.id = p_share and s.revoked_at is null and s.expires_at > now();
$$;

-- An installed app may open the underlying post only when normal post RLS says
-- that recipient can see it. A public web share never grants feed access.
create or replace function public.resolve_public_share_post(p_share uuid)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select s.post_id
  from public.public_shares s
  join public.posts p on p.id = s.post_id
  where s.id = p_share
    and s.revoked_at is null
    and s.expires_at > now()
    and public.can_view_post(p.id, auth.uid())
  limit 1;
$$;

revoke all on function public.resolve_public_share_post(uuid) from public, anon;
grant execute on function public.resolve_public_share_post(uuid) to authenticated;
