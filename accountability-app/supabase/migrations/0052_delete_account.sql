-- Delete account: deleting a member wipes EVERYTHING about them (profile,
-- posts, activity, money, buddies, groups, medals-source data …) via the FK
-- cascade from auth.users, but the other person's conversation survives.
--
-- To preserve chats, buddy_messages must NOT cascade when a profile is deleted —
-- the message keeps the (now-orphaned) uuid, and the UI renders that partner as
-- "Deleted Account".

alter table public.buddy_messages drop constraint if exists buddy_messages_sender_fkey;
alter table public.buddy_messages drop constraint if exists buddy_messages_recipient_fkey;

-- Hard-delete the caller's account. Removing the auth user cascades the profile
-- and every content row (all their FKs are ON DELETE CASCADE); buddy_messages
-- survive because their FK was dropped above.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = v;
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Inbox must still list conversations with deleted partners → LEFT JOIN and
-- label a missing profile "Deleted Account".
create or replace function public.list_conversations()
returns table(
  other_id uuid, display_name text, avatar_url text,
  last_body text, last_at timestamptz, last_from_me boolean, unread bigint
)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as uid),
  msgs as (
    select
      case when m.sender = (select uid from me) then m.recipient else m.sender end as other_id,
      m.body, m.created_at, m.sender, m.recipient, m.read_at
    from public.buddy_messages m
    where m.sender = (select uid from me) or m.recipient = (select uid from me)
  ),
  latest as (
    select distinct on (other_id) other_id, body, created_at, sender
    from msgs order by other_id, created_at desc
  ),
  counts as (
    select other_id, count(*) filter (
      where recipient = (select uid from me) and read_at is null
    ) as unread
    from msgs group by other_id
  )
  select l.other_id,
         coalesce(p.display_name, 'Deleted Account') as display_name,
         p.avatar_url,
         l.body, l.created_at, (l.sender = (select uid from me)) as last_from_me,
         coalesce(c.unread, 0) as unread
  from latest l
  left join public.profiles p on p.id = l.other_id
  left join counts c on c.other_id = l.other_id
  order by l.created_at desc;
$$;
revoke execute on function public.list_conversations() from public, anon;
grant execute on function public.list_conversations() to authenticated;
