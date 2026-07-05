-- Monthly bills: electricity, water, internet, cable, credit cards…
-- Credit cards carry a statement balance (amount) + required minimum payment.

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  category text not null check (category in (
    'electricity','water','internet','cable','phone','rent',
    'streaming','insurance','credit_card','other'
  )),
  amount numeric(12,2) not null check (amount >= 0),
  min_payment numeric(12,2) check (min_payment is null or min_payment >= 0),
  due_day int not null check (due_day between 1 and 31),
  last_paid_month text, -- 'YYYY-MM' once marked paid for that month
  created_at timestamptz not null default now()
);

create index if not exists bills_user_idx on public.bills (user_id, due_day);

alter table public.bills enable row level security;

create policy bills_select on public.bills
  for select to authenticated using (user_id = auth.uid());
create policy bills_insert on public.bills
  for insert to authenticated with check (user_id = auth.uid());
create policy bills_update on public.bills
  for update to authenticated using (user_id = auth.uid());
create policy bills_delete on public.bills
  for delete to authenticated using (user_id = auth.uid());
