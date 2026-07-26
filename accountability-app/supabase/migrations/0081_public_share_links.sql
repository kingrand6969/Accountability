-- Revocable, opaque HTTPS shares. A member must explicitly create each share.

create table if not exists public.public_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  title text not null check (length(title) between 1 and 160),
  description text not null default '' check (length(description) <= 500),
  preview_image_url text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  revoked_at timestamptz,
  check (expires_at > created_at)
);

alter table public.public_shares enable row level security;
create index if not exists public_shares_owner_idx
  on public.public_shares(owner_id, created_at desc);

drop policy if exists public_shares_owner_select on public.public_shares;
create policy public_shares_owner_select on public.public_shares
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists public_shares_owner_revoke on public.public_shares;
create policy public_shares_owner_revoke on public.public_shares
  for update to authenticated using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create or replace function public.create_public_post_share(p_post uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  share_id uuid;
begin
  select id, user_id, body, image_url into p
    from public.posts where id = p_post and user_id = auth.uid();
  if not found then
    raise exception 'That post cannot be shared by this account.'
      using errcode = '42501';
  end if;
  insert into public.public_shares
    (owner_id, post_id, title, description, preview_image_url)
  values (
    auth.uid(),
    p.id,
    left(coalesce(nullif(trim(p.body), ''), 'A win from AccountAbility'), 160),
    'Shared from AccountAbility',
    p.image_url
  )
  returning id into share_id;
  return share_id;
end;
$$;

create or replace function public.get_public_share(p_share uuid)
returns table(title text, description text, preview_image_url text, sender_name text)
language sql
stable
security definer
set search_path = public
as $$
  select s.title, s.description, s.preview_image_url, p.display_name
  from public.public_shares s
  join public.public_profiles p on p.id = s.owner_id
  where s.id = p_share and s.revoked_at is null and s.expires_at > now();
$$;

revoke all on function public.create_public_post_share(uuid) from public, anon;
grant execute on function public.create_public_post_share(uuid) to authenticated;
revoke all on function public.get_public_share(uuid) from public;
grant execute on function public.get_public_share(uuid) to anon, authenticated;
