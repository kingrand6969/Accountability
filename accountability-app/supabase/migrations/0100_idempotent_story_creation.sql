-- Stable client operation keys make story creation safe to retry after a lost
-- response. Ownership is checked both by this RPC and the existing insert RLS.
alter table public.stories
  add column if not exists operation_id uuid;

create unique index if not exists stories_owner_operation_uidx
  on public.stories (user_id, operation_id)
  where operation_id is not null;

create or replace function public.create_story_idempotent(
  p_expected_owner uuid,
  p_operation_id uuid,
  p_image_url text,
  p_caption text default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_expected_owner then
    raise exception 'account changed' using errcode = '42501';
  end if;

  insert into public.stories (user_id, operation_id, image_url, caption)
  values (p_expected_owner, p_operation_id, p_image_url, nullif(btrim(p_caption), ''))
  on conflict (user_id, operation_id) where operation_id is not null
  do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.stories
    where user_id = p_expected_owner and operation_id = p_operation_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.create_story_idempotent(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.create_story_idempotent(uuid, uuid, text, text)
  to authenticated;
