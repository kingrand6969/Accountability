-- Referrals: who invited whom. A member is "referred" at most once (PK on
-- referred_id), and only a brand-new member records their own referral at sign
-- up — so a referrer's count is genuinely people who WEREN'T on the app before.
-- Feeds the Ambassador medal.

create table if not exists public.referrals (
  referred_id uuid primary key references public.profiles (id) on delete cascade,
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (referrer_id <> referred_id)
);
alter table public.referrals enable row level security;
create index if not exists referrals_referrer_idx on public.referrals (referrer_id);

-- You can see referrals you made or the one that brought you in.
drop policy if exists "See own referrals" on public.referrals;
create policy "See own referrals" on public.referrals
  for select using (referrer_id = auth.uid() or referred_id = auth.uid());

-- Only the newcomer records their own referral, once, pointing at someone else.
drop policy if exists "Record my referral" on public.referrals;
create policy "Record my referral" on public.referrals
  for insert with check (referred_id = auth.uid() and referrer_id <> auth.uid());

-- Referral rows are immutable (no update/delete policies → denied).
