-- 0056: server-side rate limiting + write-path hardening.
--
-- RLS controls WHO may write a row, never HOW OFTEN. With the anon key (shipped
-- in every app bundle) + a valid JWT, a script could POST directly to
-- /rest/v1/<table> thousands of times a minute — flooding the feed/chat, filling
-- the disk, and spamming notifications. This adds one generic Postgres
-- rate-limiter (pure DB, zero infra) and attaches it to every hot write path,
-- plus a few cheap integrity fixes. Limits are set well above any real human
-- pace, so legitimate users never hit them; a scripted flood hits them at once.

-- ── generic rate limiter ─────────────────────────────────────────────────────
create table if not exists public.rate_limits (
  tbl         text primary key,   -- table the limit applies to
  owner_col   text not null,      -- the "this row belongs to me" column
  max_rows    int  not null,      -- allowed inserts…
  window_secs int  not null       -- …within this rolling window
);
alter table public.rate_limits enable row level security;  -- config: no client access

create or replace function public.enforce_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.rate_limits%rowtype;
  n   int;
  uid uuid := auth.uid();
begin
  -- service-role / SECURITY DEFINER inserts (auth.uid() null) are never limited
  if uid is null then
    return new;
  end if;
  select * into cfg from public.rate_limits where tbl = tg_table_name;
  if not found then
    return new;
  end if;
  execute format(
    'select count(*) from public.%I where %I = $1 and created_at > now() - make_interval(secs => $2)',
    tg_table_name, cfg.owner_col
  ) into n using uid, cfg.window_secs;
  if n >= cfg.max_rows then
    raise exception 'Too many actions in a short time — please slow down and try again shortly.'
      using errcode = '54000'; -- program_limit_exceeded
  end if;
  return new;
end;
$$;

-- Limits (generous — a person never reaches these; a flood loop hits instantly).
insert into public.rate_limits (tbl, owner_col, max_rows, window_secs) values
  ('posts',           'user_id',   30, 3600),   -- 30 posts / hour
  ('post_comments',   'user_id',   60, 600),    -- 60 comments / 10 min
  ('post_likes',      'user_id',  150, 600),    -- 150 likes / 10 min
  ('buddy_messages',  'sender',    90, 60),     -- 90 messages / min (1.5/s — no human types that)
  ('buddy_requests',  'from_user', 30, 3600),   -- 30 requests / hour
  ('stories',         'user_id',   30, 86400),  -- 30 stories / day
  ('buddy_reports',   'reporter',  20, 86400),  -- 20 reports / day
  ('memories',        'user_id',  120, 3600),   -- 120 saves / hour (bulk import headroom)
  ('search_history',  'user_id',  200, 600)     -- 200 searches / 10 min
on conflict (tbl) do update
  set owner_col = excluded.owner_col,
      max_rows = excluded.max_rows,
      window_secs = excluded.window_secs;

-- Supporting indexes so the window count is a cheap index scan.
create index if not exists posts_user_created_idx          on public.posts (user_id, created_at desc);
create index if not exists post_comments_user_created_idx  on public.post_comments (user_id, created_at desc);
create index if not exists post_likes_user_created_idx     on public.post_likes (user_id, created_at desc);
create index if not exists buddy_requests_from_created_idx on public.buddy_requests (from_user, created_at desc);
create index if not exists stories_user_created_idx        on public.stories (user_id, created_at desc);
create index if not exists buddy_reports_reporter_idx      on public.buddy_reports (reporter, created_at desc);
create index if not exists search_history_user_created_idx on public.search_history (user_id, created_at desc);
-- buddy_messages(sender, recipient, created_at) and memories(user_id, created_at) already exist.

do $$
declare t text;
begin
  foreach t in array array[
    'posts','post_comments','post_likes','buddy_messages',
    'buddy_requests','stories','buddy_reports','memories','search_history'
  ] loop
    execute format('drop trigger if exists rl_enforce on public.%I', t);
    execute format(
      'create trigger rl_enforce before insert on public.%I for each row execute function public.enforce_rate_limit()',
      t
    );
  end loop;
end $$;

-- ── text-length caps (stop giant-payload abuse) ──────────────────────────────
-- NOT VALID: enforced on all new inserts immediately, without scanning/locking
-- existing rows (which are already short).
alter table public.posts          add constraint posts_body_len   check (char_length(body) <= 5000) not valid;
alter table public.post_comments  add constraint comments_body_len check (char_length(body) <= 2000) not valid;
alter table public.buddy_messages add constraint messages_body_len check (char_length(body) <= 2000) not valid;
alter table public.stories        add constraint stories_caption_len check (caption is null or char_length(caption) <= 300) not valid;

-- ── block-aware chat: a blocked user can no longer message you ────────────────
drop policy if exists "Send to buddies only" on public.buddy_messages;
create policy "Send to buddies only" on public.buddy_messages
  for insert with check (
    auth.uid() = sender
    and public.are_buddies(sender, recipient)
    and not exists (
      select 1 from public.buddy_blocks b
      where b.blocker = recipient and b.blocked = sender
    )
  );

-- ── memories quota: trust the real object size, not the client's claim ────────
-- The old check summed the client-supplied `bytes`. Read the true size from the
-- uploaded object so a member can't understate file sizes to blow past 1 GB of
-- actual (billable) storage. Fake rows with no object cost nothing, so they fall
-- back to the client value harmlessly.
create or replace function public.memories_quota_check()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  used bigint;
  real_size bigint;
begin
  select (metadata->>'size')::bigint into real_size
    from storage.objects
    where bucket_id = 'memories' and name = new.path;
  if real_size is not null then
    new.bytes := real_size; -- the object is the source of truth
  end if;
  select coalesce(sum(bytes), 0) into used
    from public.memories where user_id = new.user_id;
  if used + new.bytes > 1073741824 then
    raise exception 'Memories storage is full (1 GB). Delete some memories to save more.';
  end if;
  return new;
end;
$$;
