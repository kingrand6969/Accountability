-- 0069: AI photo scans (food macros + receipts) — Pro only, 20 per kind per month.
--
-- COST CONTROL: unlike moderation (which is free), vision scans are billed per
-- image on the founder's OpenAI account. The quota is therefore enforced
-- SERVER-SIDE in the ai-scan Edge Function against this table — a client can
-- claim to be Pro or claim a low count, and it changes nothing.

create table if not exists public.ai_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('food', 'receipt')),
  created_at timestamptz not null default now()
);
alter table public.ai_scans enable row level security;

-- members may READ their own usage (to show "14 of 20 left"), never write it
drop policy if exists "read own scans" on public.ai_scans;
create policy "read own scans" on public.ai_scans
  for select using (user_id = auth.uid());

create index if not exists ai_scans_user_month_idx
  on public.ai_scans (user_id, kind, created_at desc);

/** What's left this calendar month, for the UI. Server enforces the real cap. */
create or replace function public.my_scan_quota()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'limit', 20,
    'food_used', (
      select count(*) from public.ai_scans
      where user_id = auth.uid() and kind = 'food'
        and created_at >= date_trunc('month', now())
    ),
    'receipt_used', (
      select count(*) from public.ai_scans
      where user_id = auth.uid() and kind = 'receipt'
        and created_at >= date_trunc('month', now())
    )
  );
$$;

grant execute on function public.my_scan_quota() to authenticated;
