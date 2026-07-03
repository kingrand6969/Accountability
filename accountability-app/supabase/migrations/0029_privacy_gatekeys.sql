-- Private groups/pages + gatekeys.
-- Private group: joining requires the admin's gatekey (checked server-side,
-- never exposed) or an invite link carrying it. Private page: same for follow.

alter table public.groups
  add column if not exists privacy text not null default 'public'
    check (privacy in ('public', 'private')),
  add column if not exists gatekey text;

alter table public.pages
  add column if not exists privacy text not null default 'public'
    check (privacy in ('public', 'private'));

-- Never let clients read gatekeys: rebuild column grants on groups.
revoke select on public.groups from authenticated;
grant select (id, name, description, created_by, created_at, privacy)
  on public.groups to authenticated;
revoke insert on public.groups from authenticated;
grant insert (name, description, created_by, privacy, gatekey)
  on public.groups to authenticated;
revoke update on public.groups from authenticated;
grant update (name, description, privacy, gatekey)
  on public.groups to authenticated;

-- direct self-join only allowed into PUBLIC groups now
drop policy if exists group_members_insert on public.group_members;
create policy group_members_insert on public.group_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.groups g
      where g.id = group_id and g.privacy = 'public'
    )
  );

-- private joins go through the key check (case-insensitive, trimmed)
create or replace function public.join_group_with_key(p_group uuid, p_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare ok boolean;
begin
  select (g.gatekey is not null and lower(trim(g.gatekey)) = lower(trim(p_key)))
    into ok
    from public.groups g where g.id = p_group;
  if coalesce(ok, false) then
    insert into public.group_members (group_id, user_id)
    values (p_group, auth.uid())
    on conflict do nothing;
    return true;
  end if;
  return false;
end;
$$;

grant execute on function public.join_group_with_key(uuid, text) to authenticated;
