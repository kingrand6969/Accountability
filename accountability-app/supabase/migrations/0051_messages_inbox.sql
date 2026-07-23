-- Messages inbox + retention.
--   read_at  : recipient marks a message read (drives unread badges)
--   retain   : true if EITHER participant was Pro when the message was sent —
--              those are kept forever. Free-only conversations are purged after
--              30 days. retain is stamped ONCE at insert time, so anything saved
--              while on Pro is grandfathered permanently even after Pro lapses.

alter table public.buddy_messages
  add column if not exists read_at timestamptz,
  add column if not exists retain boolean not null default false;

create index if not exists buddy_messages_convo_idx
  on public.buddy_messages (sender, recipient, created_at desc);
create index if not exists buddy_messages_purge_idx
  on public.buddy_messages (created_at) where not retain;

-- stamp retain from the Pro status of BOTH participants at send time
create or replace function public.buddy_message_set_retain() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.retain := exists (
    select 1 from public.profiles p
    where p.id in (new.sender, new.recipient) and p.is_pro = true
  );
  return new;
end $$;
drop trigger if exists trg_buddy_message_retain on public.buddy_messages;
create trigger trg_buddy_message_retain before insert on public.buddy_messages
  for each row execute function public.buddy_message_set_retain();

-- grandfather everything that already exists (never surprise-delete old chats)
update public.buddy_messages set retain = true where retain = false;

-- recipient may mark their received messages read
drop policy if exists "Read receipts" on public.buddy_messages;
create policy "Read receipts" on public.buddy_messages
  for update using (auth.uid() = recipient) with check (auth.uid() = recipient);

-- ── Inbox: latest message per conversation + unread count ────────────────────
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
  select l.other_id, p.display_name, p.avatar_url,
         l.body, l.created_at, (l.sender = (select uid from me)) as last_from_me,
         coalesce(c.unread, 0) as unread
  from latest l
  join public.profiles p on p.id = l.other_id
  left join counts c on c.other_id = l.other_id
  order by l.created_at desc;
$$;
revoke execute on function public.list_conversations() from public, anon;
grant execute on function public.list_conversations() to authenticated;

-- ── 30-day purge for non-retained (free-era) messages, daily via pg_cron ─────
create or replace function public.purge_old_messages() returns void
language sql security definer set search_path = public as $$
  delete from public.buddy_messages
  where retain = false and created_at < now() - interval '30 days';
$$;
revoke execute on function public.purge_old_messages() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('purge-old-messages', '17 3 * * *', 'select public.purge_old_messages()');
exception when others then
  null; -- scheduling is best-effort; the function still exists to call manually
end $$;
