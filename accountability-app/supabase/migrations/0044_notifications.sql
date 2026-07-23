-- In-app notifications: likes, comments, tags, buddy requests/accepts.
-- Rows are created ONLY by database triggers (security definer) so they can't
-- be forged; clients may read + mark-read their own. Realtime publication
-- makes them land instantly in the app.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade, -- recipient
  actor_id uuid references public.profiles (id) on delete cascade,
  type text not null check (type in ('like', 'comment', 'tag', 'buddy_request', 'buddy_accept')),
  post_id uuid references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.notifications enable row level security;
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (auth.uid() = user_id);

-- mark-read only; triggers do the inserts
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

--------------------------------------------------------------------------------
-- Triggers
--------------------------------------------------------------------------------
create or replace function public.notify_on_like() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, actor_id, type, post_id)
  select p.user_id, new.user_id, 'like', new.post_id
  from public.posts p
  where p.id = new.post_id and p.user_id <> new.user_id;
  return new;
end $$;
drop trigger if exists trg_notify_like on public.post_likes;
create trigger trg_notify_like after insert on public.post_likes
  for each row execute function public.notify_on_like();

create or replace function public.notify_on_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, actor_id, type, post_id)
  select p.user_id, new.user_id, 'comment', new.post_id
  from public.posts p
  where p.id = new.post_id and p.user_id <> new.user_id;
  return new;
end $$;
drop trigger if exists trg_notify_comment on public.post_comments;
create trigger trg_notify_comment after insert on public.post_comments
  for each row execute function public.notify_on_comment();

-- the tagged member is notified; the actor is the post's author
create or replace function public.notify_on_tag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, actor_id, type, post_id)
  select new.user_id, p.user_id, 'tag', new.post_id
  from public.posts p
  where p.id = new.post_id and p.user_id <> new.user_id;
  return new;
end $$;
drop trigger if exists trg_notify_tag on public.post_tags;
create trigger trg_notify_tag after insert on public.post_tags
  for each row execute function public.notify_on_tag();

create or replace function public.notify_on_buddy_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, actor_id, type)
  values (new.to_user, new.from_user, 'buddy_request');
  return new;
end $$;
drop trigger if exists trg_notify_buddy_request on public.buddy_requests;
create trigger trg_notify_buddy_request after insert on public.buddy_requests
  for each row execute function public.notify_on_buddy_request();

create or replace function public.notify_on_buddy_accept() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    insert into public.notifications (user_id, actor_id, type)
    values (new.from_user, new.to_user, 'buddy_accept');
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_buddy_accept on public.buddy_requests;
create trigger trg_notify_buddy_accept after update on public.buddy_requests
  for each row execute function public.notify_on_buddy_accept();

-- instant delivery to the app
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;
