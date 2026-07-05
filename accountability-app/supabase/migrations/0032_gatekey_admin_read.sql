-- Group admins can read back their own group's gatekey (to share invites).
-- Clients still can't select the column directly (0029 column-scoped grant).

create or replace function public.get_group_gatekey(p_group uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare k text;
begin
  if not exists (
    select 1 from public.group_members m
    where m.group_id = p_group and m.user_id = auth.uid() and m.role = 'admin'
  ) then
    return null;
  end if;
  select g.gatekey into k from public.groups g where g.id = p_group;
  return k;
end;
$$;

grant execute on function public.get_group_gatekey(uuid) to authenticated;
