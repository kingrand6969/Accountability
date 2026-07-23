-- 0070: Business Tracker (Pro) — v1 core loop.
--   Item (price + derived cost) → Sale (one left) → Payment (cash back?)
--   → Fixed costs (runs regardless) → Loss (left with no cash attached)
-- See docs/business-tracker-spec.md. Business data is STRICTLY separate from
-- the member's personal money module — different tables, never mixed.
-- Pro is enforced in the app + by the same profiles.is_pro check used elsewhere;
-- RLS here is per-user ownership.

-- ── the business (RLS anchor + personality switch) ───────────────────────────
create table if not exists public.biz_business (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  preset text not null default 'retail'
    check (preset in ('food','retail','service','project','rental','online','transport')),
  currency_symbol text not null default '',      -- chosen at setup; no locale assumptions
  days_open_per_month int not null default 26,
  open_time time, close_time time,
  stations int not null default 1,               -- chairs / rooms / vehicles → capacity
  billable_hours_per_month int not null default 80,
  owner_draw_target numeric not null default 0,  -- the owner eating is a COST
  tax_setaside_pct numeric not null default 0,
  default_target_margin_pct numeric not null default 0.3,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── the sellable unit ────────────────────────────────────────────────────────
create table if not exists public.biz_item (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  business_id uuid not null references public.biz_business (id) on delete cascade,
  name text not null,
  photo_url text,
  unit_label text not null default 'unit',       -- portion | pc | appointment | job | day | order | shift
  kind text not null default 'good' check (kind in ('good','service','job','asset')),
  price numeric not null default 0,
  cost_source text not null default 'manual' check (cost_source in ('recipe','purchase','manual')),
  direct_cost numeric not null default 0,        -- manual estimate, or moving average from restocks
  recipe_yield numeric not null default 1,       -- portions a recipe makes → cost per serving
  extra_cost numeric not null default 0,         -- packaging + shipping per unit
  fee_pct numeric not null default 0,            -- platform / card commission
  duration_minutes int,                          -- service + job presets → capacity
  target_margin_pct numeric,
  track_stock boolean not null default false,
  stock_qty numeric not null default 0,
  purchase_price numeric, purchase_date date, useful_life_months int,
  expected_life_units numeric, salvage_value numeric,   -- kind='asset'
  is_tile boolean not null default true,
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── inputs (ingredients / materials / consumables) ───────────────────────────
create table if not exists public.biz_supply (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  business_id uuid not null references public.biz_business (id) on delete cascade,
  name text not null,
  pack_price numeric not null default 0,
  pack_qty numeric not null default 1,
  unit text not null default 'pc',
  yield_pct numeric not null default 100,        -- trim/waste: meat & fish really cost more
  stock_qty numeric not null default 0,
  previous_unit_cost numeric,
  last_price_at timestamptz,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  -- normalised so kg/g and L/ml mix freely in recipes
  pack_qty_base numeric generated always as (
    pack_qty * case lower(unit) when 'kg' then 1000 when 'l' then 1000 else 1 end
  ) stored,
  unit_cost numeric generated always as (
    case
      when pack_qty = 0 or yield_pct = 0 then 0
      else (pack_price
            / (pack_qty * case lower(unit) when 'kg' then 1000 when 'l' then 1000 else 1 end))
           / (yield_pct / 100.0)
    end
  ) stored
);

-- ── bill of materials (a line points at a supply OR a costed sub-item) ───────
create table if not exists public.biz_recipe_line (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null references public.biz_item (id) on delete cascade,
  supply_id uuid references public.biz_supply (id) on delete cascade,
  component_item_id uuid references public.biz_item (id) on delete cascade,
  qty numeric not null default 0,
  unit text not null default 'pc',
  qty_base numeric generated always as (
    qty * case lower(unit) when 'kg' then 1000 when 'l' then 1000 else 1 end
  ) stored,
  constraint recipe_line_target check ((supply_id is null) <> (component_item_id is null))
);

-- ── one row every time something leaves ──────────────────────────────────────
create table if not exists public.biz_sale (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  business_id uuid not null references public.biz_business (id) on delete cascade,
  item_id uuid references public.biz_item (id) on delete set null,   -- null = quick daily total
  customer_id uuid,
  qty numeric not null default 1,
  unit_price numeric not null default 0,
  amount numeric not null default 0,             -- stored; editable for discounts
  unit_cost_snapshot numeric not null default 0, -- frozen at save — history stays honest
  extra_cost_snapshot numeric not null default 0,
  fee_amount numeric not null default 0,
  sale_date date not null default current_date,
  occurred_at timestamptz not null default now(),
  status text not null default 'done'
    check (status in ('pending','done','delivered','returned','cancelled','no_show')),
  start_at timestamptz, due_at timestamptz, returned_at timestamptz,  -- rentals/bookings
  delivered_at timestamptz,                     -- starts the receivables clock
  est_minutes int,                              -- quoted hours → scope creep
  count_value numeric,                          -- trips / covers
  meter_value numeric,                          -- odometer at close → km without typing
  payment_method text check (payment_method in ('cash','ewallet','card','cod','platform')),
  note text,
  photo_url text
);

-- ── cash actually received (utang, deposits, milestones, bonds) ──────────────
create table if not exists public.biz_payment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  business_id uuid not null references public.biz_business (id) on delete cascade,
  sale_id uuid references public.biz_sale (id) on delete cascade,
  customer_id uuid,
  amount numeric not null default 0,
  paid_at date not null default current_date,
  kind text not null default 'balance'
    check (kind in ('deposit','balance','utang_payment','refund','deposit_held','deposit_returned')),
  method text,
  note text
);

-- ── every peso out (doubles as a restock when it carries a supply) ───────────
create table if not exists public.biz_cost (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  business_id uuid not null references public.biz_business (id) on delete cascade,
  cost_date date not null default current_date,
  amount numeric not null default 0,
  type text not null default 'operating'
    check (type in ('supply','operating','ads','labour','asset_purchase','loan','owner_draw')),
  category_key text,                            -- one-tap chip: fuel, rent, repair…
  supply_id uuid references public.biz_supply (id) on delete set null,
  qty numeric, unit text,
  item_id uuid references public.biz_item (id) on delete set null,
  sale_id uuid references public.biz_sale (id) on delete set null,
  freight_amount numeric not null default 0,    -- allocated across the batch → landed cost
  litres numeric,
  photo_url text,
  note text
);

-- ── the monthly commitments (the entire input to break-even) ─────────────────
create table if not exists public.biz_fixed_cost (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  business_id uuid not null references public.biz_business (id) on delete cascade,
  name text not null,
  amount numeric not null default 0,
  active_from date not null default current_date,
  active_to date,
  due_day int
);

-- ── THE LEAK — everything that left without cash coming back ─────────────────
create table if not exists public.biz_loss (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  business_id uuid not null references public.biz_business (id) on delete cascade,
  loss_date date not null default current_date,
  item_id uuid references public.biz_item (id) on delete set null,
  supply_id uuid references public.biz_supply (id) on delete set null,
  sale_id uuid references public.biz_sale (id) on delete set null,
  qty numeric not null default 1,
  reason text not null check (reason in
    ('spoiled','broken','expired','free','staff','remake','taken_home',
     'no_show','cancelled','return','damage','theft','discount')),
  cost_value numeric not null default 0,
  note text
);

-- ── who owes me, and since when ──────────────────────────────────────────────
create table if not exists public.biz_customer (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  business_id uuid not null references public.biz_business (id) on delete cascade,
  name text not null,
  phone text,
  note text,
  credit_limit numeric,
  first_seen_at date default current_date,
  last_seen_at date,
  risk_flag boolean not null default false
);

-- ── RLS: strictly per-user on every table ────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['biz_business','biz_item','biz_supply','biz_recipe_line','biz_sale',
                           'biz_payment','biz_cost','biz_fixed_cost','biz_loss','biz_customer'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t);
  end loop;
end $$;

create index if not exists biz_item_biz_idx on public.biz_item (user_id, business_id) where not archived;
create index if not exists biz_sale_biz_date_idx on public.biz_sale (user_id, business_id, sale_date desc);
create index if not exists biz_sale_open_idx on public.biz_sale (user_id, status)
  where status in ('pending','delivered');
create index if not exists biz_cost_biz_date_idx on public.biz_cost (user_id, business_id, cost_date desc);
create index if not exists biz_loss_biz_date_idx on public.biz_loss (user_id, business_id, loss_date desc);
create index if not exists biz_recipe_item_idx on public.biz_recipe_line (item_id);
create index if not exists biz_payment_sale_idx on public.biz_payment (sale_id);

-- ── THE ENGINE: resolve recipe → sub-recipe → supply into a unit cost ────────
-- This is what makes "cost per serving" fall out of ingredient prices instead
-- of being a food-specific feature. Depth-capped at 3 to stay cheap and to make
-- an accidental recipe cycle impossible.
create or replace function public.biz_item_unit_cost(p_item uuid, p_depth int default 0)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_item public.biz_item%rowtype;
  v_total numeric := 0;
  r record;
begin
  if p_depth > 3 then return 0; end if;
  select * into v_item from public.biz_item where id = p_item;
  if not found then return 0; end if;
  if v_item.cost_source <> 'recipe' then
    return coalesce(v_item.direct_cost, 0);
  end if;
  for r in
    select l.qty_base, l.supply_id, l.component_item_id, s.unit_cost
    from public.biz_recipe_line l
    left join public.biz_supply s on s.id = l.supply_id
    where l.item_id = p_item
  loop
    if r.supply_id is not null then
      v_total := v_total + coalesce(r.qty_base, 0) * coalesce(r.unit_cost, 0);
    else
      v_total := v_total + coalesce(r.qty_base, 0)
                 * public.biz_item_unit_cost(r.component_item_id, p_depth + 1);
    end if;
  end loop;
  return case when coalesce(v_item.recipe_yield, 0) = 0 then v_total
              else v_total / v_item.recipe_yield end;
end $$;

/** Every item with its true cost, what you keep, and the price that hits target. */
create or replace function public.biz_items_costed(p_business uuid)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.sort_order, t.name), '[]'::json)
  from (
    select i.id, i.name, i.unit_label, i.kind, i.price, i.photo_url, i.is_tile,
           i.sort_order, i.track_stock, i.stock_qty, i.extra_cost, i.fee_pct,
           public.biz_item_unit_cost(i.id) as unit_cost,
           (i.price - public.biz_item_unit_cost(i.id) - i.extra_cost - i.price * i.fee_pct) as keep,
           case when i.price > 0
                then (i.price - public.biz_item_unit_cost(i.id) - i.extra_cost - i.price * i.fee_pct) / i.price
                else 0 end as keep_pct,
           coalesce(i.target_margin_pct, b.default_target_margin_pct) as target_margin_pct,
           case when (1 - coalesce(i.target_margin_pct, b.default_target_margin_pct) - i.fee_pct) > 0
                then (public.biz_item_unit_cost(i.id) + i.extra_cost)
                     / (1 - coalesce(i.target_margin_pct, b.default_target_margin_pct) - i.fee_pct)
                else null end as suggested_price
    from public.biz_item i
    join public.biz_business b on b.id = i.business_id
    where i.business_id = p_business and i.user_id = auth.uid() and not i.archived
  ) t;
$$;

/** The whole home screen in one call: today vs break-even, month, leak, money owed. */
create or replace function public.biz_dashboard(p_business uuid, p_from date, p_to date)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  b public.biz_business%rowtype;
  v_fixed numeric; v_daily_target numeric;
  v_today_keep numeric; v_contribution numeric; v_costs numeric; v_leak numeric;
  v_collected numeric; v_owed numeric; v_days int;
begin
  select * into b from public.biz_business where id = p_business and user_id = auth.uid();
  if not found then return json_build_object('error', 'not found'); end if;

  select coalesce(sum(amount), 0) into v_fixed from public.biz_fixed_cost
   where business_id = p_business and user_id = auth.uid()
     and active_from <= current_date and (active_to is null or active_to >= current_date);
  v_daily_target := case when b.days_open_per_month > 0
                         then (v_fixed + b.owner_draw_target) / b.days_open_per_month else 0 end;

  select coalesce(sum(s.amount - s.fee_amount
                      - s.qty * s.unit_cost_snapshot - s.qty * s.extra_cost_snapshot), 0)
    into v_today_keep
    from public.biz_sale s
   where s.business_id = p_business and s.user_id = auth.uid()
     and s.sale_date = current_date and s.status in ('done','delivered');

  select coalesce(sum(s.amount - s.fee_amount
                      - s.qty * s.unit_cost_snapshot - s.qty * s.extra_cost_snapshot), 0)
    into v_contribution
    from public.biz_sale s
   where s.business_id = p_business and s.user_id = auth.uid()
     and s.sale_date between p_from and p_to and s.status in ('done','delivered');

  select coalesce(sum(amount), 0) into v_costs from public.biz_cost
   where business_id = p_business and user_id = auth.uid()
     and cost_date between p_from and p_to and type <> 'owner_draw';

  select coalesce(sum(cost_value), 0) into v_leak from public.biz_loss
   where business_id = p_business and user_id = auth.uid()
     and loss_date between p_from and p_to;

  select coalesce(sum(amount), 0) into v_collected from public.biz_payment
   where business_id = p_business and user_id = auth.uid()
     and paid_at between p_from and p_to
     and kind in ('deposit','balance','utang_payment');

  select coalesce(sum(s.amount), 0) - coalesce((
      select sum(p.amount) from public.biz_payment p
       where p.business_id = p_business and p.user_id = auth.uid()
         and p.kind in ('deposit','balance','utang_payment')), 0)
    into v_owed
    from public.biz_sale s
   where s.business_id = p_business and s.user_id = auth.uid()
     and s.status in ('done','delivered','pending');

  v_days := greatest(1, (p_to - p_from) + 1);

  return json_build_object(
    'currency_symbol', b.currency_symbol,
    'preset', b.preset,
    'daily_target', round(v_daily_target, 2),
    'today_keep', round(v_today_keep, 2),
    'today_progress', case when v_daily_target > 0
                           then round(v_today_keep / v_daily_target, 4) else null end,
    'contribution', round(v_contribution, 2),
    'costs', round(v_costs, 2),
    'leak', round(v_leak, 2),
    'fixed_prorated', round(v_fixed * v_days / 30.0, 2),
    'net', round(v_contribution - v_costs - v_leak - (v_fixed * v_days / 30.0), 2),
    'cash_collected', round(v_collected, 2),
    'money_owed', round(greatest(v_owed, 0), 2),
    'leak_share', case when v_contribution > 0
                       then round(v_leak / v_contribution, 4) else 0 end
  );
end $$;

grant execute on function
  public.biz_item_unit_cost(uuid, int),
  public.biz_items_costed(uuid),
  public.biz_dashboard(uuid, date, date)
  to authenticated;
