-- 0057: rate-limit presigned R2 upload URLs.
-- The r2-sign Edge Function mints presigned PUT URLs. Without a cap, one account
-- could loop it and write unbounded objects into R2 (billed to the owner). We
-- log each sign into this table (rate-limited by the 0056 primitive), so a user
-- who exceeds the cap gets a 429 from the function instead of a free upload URL.

create table if not exists public.r2_sign_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text,
  created_at timestamptz not null default now()
);
alter table public.r2_sign_log enable row level security;

create index if not exists r2_sign_log_user_created_idx
  on public.r2_sign_log (user_id, created_at desc);

-- the caller may only log their own signs (no select — it's write-only telemetry)
drop policy if exists r2_sign_log_insert on public.r2_sign_log;
create policy r2_sign_log_insert on public.r2_sign_log
  for insert to authenticated with check (user_id = auth.uid());

insert into public.rate_limits (tbl, owner_col, max_rows, window_secs)
  values ('r2_sign_log', 'user_id', 60, 3600)  -- generous human use; blocks scripted storage floods
  on conflict (tbl) do update
    set owner_col = excluded.owner_col,
        max_rows = excluded.max_rows,
        window_secs = excluded.window_secs;

drop trigger if exists rl_enforce on public.r2_sign_log;
create trigger rl_enforce before insert on public.r2_sign_log
  for each row execute function public.enforce_rate_limit();

-- keep the log tiny — only the rolling window matters
create or replace function public.prune_r2_sign_log()
returns void language sql security definer set search_path = public as $$
  delete from public.r2_sign_log where created_at < now() - interval '2 days';
$$;
