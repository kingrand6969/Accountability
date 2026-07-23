-- 0076: close the like-toggle abuse (audit MEDIUM).
-- A like can be un-liked, which DELETES the row, so the row-count rate limiter
-- never accumulates — a script can like/unlike the same post forever, and each
-- re-like fired a fresh "X liked your post" notification, flooding the victim.
-- Fix: (a) dedupe like notifications (never notify twice for the same actor+post)
-- and (b) rate-limit against an append-only ledger that DELETEs can't shrink.

-- append-only record of every like EVENT (never deleted)
create table if not exists public.post_like_log (
  id bigserial primary key,
  user_id uuid not null,
  post_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.post_like_log enable row level security;  -- server-only: no policy = deny to clients
create index if not exists post_like_log_user_idx on public.post_like_log (user_id, created_at desc);

-- like notification: dedupe + log the event to the append-only ledger
create or replace function public.notify_on_like() returns trigger
language plpgsql security definer set search_path = public as $$
declare author uuid;
begin
  insert into public.post_like_log (user_id, post_id) values (new.user_id, new.post_id);
  select p.user_id into author from public.posts p
    where p.id = new.post_id and p.user_id <> new.user_id;
  if author is not null and not exists (
    select 1 from public.notifications
    where user_id = author and actor_id = new.user_id and type = 'like' and post_id = new.post_id
  ) then
    insert into public.notifications (user_id, actor_id, type, post_id)
    values (author, new.user_id, 'like', new.post_id);
  end if;
  return new;
end $$;

-- rate-limit like EVENTS from the ledger, so un-liking can't reset the counter
create or replace function public.limit_like_events() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then return new; end if;                     -- server tasks
  select count(*) into n from public.post_like_log
    where user_id = uid and created_at > now() - interval '10 minutes';
  if n >= 300 then
    raise exception 'Too many likes in a short time — please slow down and try again shortly.'
      using errcode = '54000';
  end if;
  return new;
end $$;

drop trigger if exists limit_like_events on public.post_likes;
create trigger limit_like_events before insert on public.post_likes
  for each row execute function public.limit_like_events();
