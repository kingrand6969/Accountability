-- 0059: in-app support / contact / "report a problem" messages. These are
-- written by members from Help & Support and read by the team (no client read).

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'support' check (kind in ('support', 'report', 'feedback')),
  subject text check (subject is null or char_length(subject) <= 140),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
alter table public.support_messages enable row level security;

create index if not exists support_messages_user_idx
  on public.support_messages (user_id, created_at desc);

-- members may file their own; reading is team-only (no select policy)
drop policy if exists support_insert on public.support_messages;
create policy support_insert on public.support_messages
  for insert to authenticated with check (user_id = auth.uid());

-- rate-limit via the 0056 primitive (stop a flood of support spam)
insert into public.rate_limits (tbl, owner_col, max_rows, window_secs)
  values ('support_messages', 'user_id', 20, 3600)
  on conflict (tbl) do update
    set owner_col = excluded.owner_col, max_rows = excluded.max_rows, window_secs = excluded.window_secs;

drop trigger if exists rl_enforce on public.support_messages;
create trigger rl_enforce before insert on public.support_messages
  for each row execute function public.enforce_rate_limit();
