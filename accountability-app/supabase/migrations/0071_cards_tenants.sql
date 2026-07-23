-- 0071: (a) credit-card debt tracker — monthly due day, planned payment,
--       one-tap payments that DEDUCT from the balance (auditable log);
--       (b) business renters — long-term tenants with monthly rent + due day,
--       rent collections flow into biz_sale so the dashboard stays one truth.

-- ── credit cards ride on the existing debts table ────────────────────────────
alter table public.debts add column if not exists due_day int;
alter table public.debts add column if not exists monthly_payment numeric;
alter table public.debts add column if not exists is_card boolean not null default false;
alter table public.debts add column if not exists last_paid_at date;

create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  debt_id uuid not null references public.debts (id) on delete cascade,
  amount numeric not null,
  paid_at date not null default current_date
);
alter table public.debt_payments enable row level security;
drop policy if exists "own rows" on public.debt_payments;
create policy "own rows" on public.debt_payments for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists debt_payments_debt_idx on public.debt_payments (debt_id, paid_at desc);

-- ── business renters (rental preset) ─────────────────────────────────────────
create table if not exists public.biz_tenant (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  business_id uuid not null references public.biz_business (id) on delete cascade,
  renter_name text not null,
  property text not null,          -- "Unit 2A", "Blue apartment", "Speaker set"
  monthly_rent numeric not null default 0,
  due_day int not null default 1,
  phone text,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.biz_tenant enable row level security;
drop policy if exists "own rows" on public.biz_tenant;
create policy "own rows" on public.biz_tenant for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists biz_tenant_biz_idx on public.biz_tenant (user_id, business_id) where active;

-- rent collections are sales — one row per month per renter
alter table public.biz_sale add column if not exists tenant_id uuid references public.biz_tenant (id) on delete set null;
create index if not exists biz_sale_tenant_idx on public.biz_sale (tenant_id, sale_date desc) where tenant_id is not null;
