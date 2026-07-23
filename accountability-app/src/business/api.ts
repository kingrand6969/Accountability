import { supabase } from '../lib/supabase';

// Business Tracker (Pro) — the one loop:
//   Item (price + derived cost) → Sale (one left) → Payment (cash back)
//   → Fixed costs (runs regardless) − Loss (left with no cash attached).
// Strictly separate from personal money (biz_* tables, migration 0070).

export type BizPreset =
  | 'food' | 'retail' | 'service' | 'project' | 'rental' | 'online' | 'transport';

export type Business = {
  id: string;
  name: string;
  preset: BizPreset;
  currency_symbol: string;
  days_open_per_month: number;
  owner_draw_target: number;
  default_target_margin_pct: number;
};

export type BizItem = {
  id: string;
  name: string;
  unit_label: string;
  kind: 'good' | 'service' | 'job' | 'asset';
  price: number;
  cost_source: 'recipe' | 'purchase' | 'manual';
  direct_cost: number;
  recipe_yield: number;
  extra_cost: number;
  fee_pct: number;
  is_tile: boolean;
  sort_order: number;
  track_stock: boolean;
  stock_qty: number;
  // from biz_items_costed
  unit_cost?: number;
  keep?: number;
  keep_pct?: number;
  target_margin_pct?: number;
  suggested_price?: number | null;
};

export type BizSupply = {
  id: string;
  name: string;
  pack_price: number;
  pack_qty: number;
  unit: string;
  yield_pct: number;
  unit_cost: number;
};

export type RecipeLine = {
  id: string;
  supply_id: string | null;
  component_item_id: string | null;
  qty: number;
  unit: string;
};

export type FixedCost = { id: string; name: string; amount: number; due_day: number | null };

export type BizDashboard = {
  currency_symbol: string;
  preset: BizPreset;
  daily_target: number;
  today_keep: number;
  today_progress: number | null;
  contribution: number;
  costs: number;
  leak: number;
  fixed_prorated: number;
  net: number;
  cash_collected: number;
  money_owed: number;
  leak_share: number;
};

export const LOSS_REASONS = [
  { key: 'spoiled', label: 'Spoiled' },
  { key: 'broken', label: 'Broken' },
  { key: 'expired', label: 'Expired' },
  { key: 'free', label: 'Given free' },
  { key: 'staff', label: 'Staff use' },
  { key: 'remake', label: 'Remake' },
  { key: 'no_show', label: 'No-show' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'return', label: 'Returned' },
  { key: 'damage', label: 'Damage' },
  { key: 'theft', label: 'Theft' },
] as const;

export const COST_CHIPS = [
  { key: 'supply', label: 'Supplies', type: 'supply' },
  { key: 'rent', label: 'Rent', type: 'operating' },
  { key: 'utilities', label: 'Utilities', type: 'operating' },
  { key: 'fuel', label: 'Fuel', type: 'operating' },
  { key: 'transport', label: 'Transport', type: 'operating' },
  { key: 'repair', label: 'Repair', type: 'operating' },
  { key: 'ads', label: 'Ads', type: 'ads' },
  { key: 'labour', label: 'Employee', type: 'labour' },
  { key: 'other', label: 'Other', type: 'operating' },
] as const;

/** Common recurring business bills — one tap fills the name. */
export const BILL_PRESETS = [
  'Rent', 'Mortgage', 'Electricity', 'Water', 'Internet', 'Employee pay',
  'Transportation', 'Permits', 'Loan payment',
] as const;

// ── renters (rental preset): long-term tenants, monthly rent, due day ────────

export type Tenant = {
  id: string;
  renter_name: string;
  property: string;
  monthly_rent: number;
  due_day: number;
  phone: string | null;
  /** biz_sale id for this month's rent, when collected */
  paid_sale_id: string | null;
};

export async function listTenants(businessId: string): Promise<Tenant[]> {
  const monthStart = new Date();
  const from = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}-01`;
  const [{ data, error }, { data: paid, error: pe }] = await Promise.all([
    supabase
      .from('biz_tenant')
      .select('id,renter_name,property,monthly_rent,due_day,phone')
      .eq('business_id', businessId)
      .eq('active', true)
      .order('due_day'),
    supabase
      .from('biz_sale')
      .select('id,tenant_id')
      .eq('business_id', businessId)
      .not('tenant_id', 'is', null)
      .gte('sale_date', from),
  ]);
  if (error) throw error;
  if (pe) throw pe;
  const paidBy = new Map((paid ?? []).map((s: any) => [s.tenant_id, s.id]));
  return ((data ?? []) as any[]).map((t) => ({
    ...t,
    monthly_rent: Number(t.monthly_rent),
    due_day: Number(t.due_day),
    paid_sale_id: paidBy.get(t.id) ?? null,
  })) as Tenant[];
}

export async function addTenant(input: {
  business_id: string;
  renter_name: string;
  property: string;
  monthly_rent: number;
  due_day: number;
  phone?: string;
}): Promise<void> {
  const { error } = await supabase.from('biz_tenant').insert(input);
  if (error) throw error;
}

export async function endTenant(id: string): Promise<void> {
  const { error } = await supabase.from('biz_tenant').update({ active: false }).eq('id', id);
  if (error) throw error;
}

/** One tap: this month's rent arrived. It is a sale, so the dashboard,
 *  break-even and month totals all pick it up with no extra bookkeeping. */
export async function markRentPaid(tenant: Tenant, businessId: string): Promise<void> {
  const { error } = await supabase.from('biz_sale').insert({
    business_id: businessId,
    tenant_id: tenant.id,
    qty: 1,
    unit_price: tenant.monthly_rent,
    amount: tenant.monthly_rent,
    note: `Rent — ${tenant.renter_name} (${tenant.property})`,
  });
  if (error) throw error;
}

export async function undoRentPaid(saleId: string): Promise<void> {
  const { error } = await supabase.from('biz_sale').delete().eq('id', saleId);
  if (error) throw error;
}

/** Due / overdue status for the reminder chips. */
export function rentStatus(t: Tenant): { kind: 'paid' | 'due' | 'overdue'; days: number } {
  if (t.paid_sale_id) return { kind: 'paid', days: 0 };
  const today = new Date().getDate();
  if (today > t.due_day) return { kind: 'overdue', days: today - t.due_day };
  return { kind: 'due', days: t.due_day - today };
}

/** Preset vocabulary — same loop, different words on the buttons. */
export const PRESETS: Record<
  BizPreset,
  { title: string; example: string; itemLabel: string; unitLabel: string; icon: string }
> = {
  food: { title: 'Food & drinks', example: 'Eatery, café, home baking, food stall', itemLabel: 'Dish', unitLabel: 'portion', icon: 'restaurant' },
  retail: { title: 'Store & reselling', example: 'Corner store, boutique, thrift, market stall', itemLabel: 'Product', unitLabel: 'pc', icon: 'storefront' },
  service: { title: 'Services', example: 'Salon, barber, massage, tutoring, cleaning', itemLabel: 'Service', unitLabel: 'session', icon: 'cut' },
  project: { title: 'Freelance & projects', example: 'Photography, design, events, builds', itemLabel: 'Project', unitLabel: 'job', icon: 'briefcase' },
  rental: { title: 'Rentals', example: 'Motorbike, equipment, rooms, party supplies', itemLabel: 'Unit', unitLabel: 'day', icon: 'key' },
  online: { title: 'Online selling', example: 'Marketplace shops, live selling, dropship', itemLabel: 'Product', unitLabel: 'order', icon: 'cart' },
  transport: { title: 'Transport & delivery', example: 'Ride-hailing, deliveries, small trucking', itemLabel: 'Shift', unitLabel: 'shift', icon: 'bicycle' },
};

function mapBusiness(data: any): Business {
  return {
    ...data,
    days_open_per_month: Number(data.days_open_per_month),
    owner_draw_target: Number(data.owner_draw_target),
    default_target_margin_pct: Number(data.default_target_margin_pct),
  } as Business;
}

const BUSINESS_SELECT =
  'id,name,preset,currency_symbol,days_open_per_month,owner_draw_target,default_target_margin_pct';

/** Every business the member runs (a member may keep several — e.g. a food
 *  stall AND a rental bike), oldest first. */
export async function listBusinesses(): Promise<Business[]> {
  const { data, error } = await supabase
    .from('biz_business')
    .select(BUSINESS_SELECT)
    .eq('archived', false)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).map(mapBusiness);
}

/** First business only — kept for callers that just need "do I have one". */
export async function myBusiness(): Promise<Business | null> {
  const list = await listBusinesses();
  return list[0] ?? null;
}

export async function archiveBusiness(id: string): Promise<void> {
  const { error } = await supabase.from('biz_business').update({ archived: true }).eq('id', id);
  if (error) throw error;
}

export async function createBusiness(input: {
  name: string;
  preset: BizPreset;
  currency_symbol: string;
  days_open_per_month: number;
}): Promise<Business> {
  const { data, error } = await supabase
    .from('biz_business')
    .insert(input)
    .select('id,name,preset,currency_symbol,days_open_per_month,owner_draw_target,default_target_margin_pct')
    .single();
  if (error) throw error;
  return data as Business;
}

/** Items with true cost + keep + suggested price, computed in the DB. */
export async function listItemsCosted(businessId: string): Promise<BizItem[]> {
  const { data, error } = await supabase.rpc('biz_items_costed', { p_business: businessId });
  if (error) throw error;
  return ((data ?? []) as any[]).map((i) => ({
    ...i,
    price: Number(i.price),
    unit_cost: Number(i.unit_cost ?? 0),
    keep: Number(i.keep ?? 0),
    keep_pct: Number(i.keep_pct ?? 0),
    suggested_price: i.suggested_price == null ? null : Number(i.suggested_price),
  })) as BizItem[];
}

export async function createItem(input: {
  business_id: string;
  name: string;
  unit_label: string;
  price: number;
  cost_source: 'recipe' | 'purchase' | 'manual';
  direct_cost?: number;
  recipe_yield?: number;
  extra_cost?: number;
  fee_pct?: number;
}): Promise<string> {
  const { data, error } = await supabase.from('biz_item').insert(input).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function updateItem(
  id: string,
  patch: Partial<Pick<BizItem, 'name' | 'price' | 'direct_cost' | 'recipe_yield' | 'extra_cost' | 'fee_pct'>>,
): Promise<void> {
  const { error } = await supabase.from('biz_item').update(patch).eq('id', id);
  if (error) throw error;
}

export async function archiveItem(id: string): Promise<void> {
  const { error } = await supabase.from('biz_item').update({ archived: true }).eq('id', id);
  if (error) throw error;
}

// ── supplies + recipe (food-style costing) ───────────────────────────────────

export async function listSupplies(businessId: string): Promise<BizSupply[]> {
  const { data, error } = await supabase
    .from('biz_supply')
    .select('id,name,pack_price,pack_qty,unit,yield_pct,unit_cost')
    .eq('business_id', businessId)
    .eq('archived', false)
    .order('name');
  if (error) throw error;
  return ((data ?? []) as any[]).map((s) => ({
    ...s,
    pack_price: Number(s.pack_price),
    pack_qty: Number(s.pack_qty),
    yield_pct: Number(s.yield_pct),
    unit_cost: Number(s.unit_cost),
  })) as BizSupply[];
}

export async function createSupply(input: {
  business_id: string;
  name: string;
  pack_price: number;
  pack_qty: number;
  unit: string;
  yield_pct?: number;
}): Promise<void> {
  const { error } = await supabase.from('biz_supply').insert(input);
  if (error) throw error;
}

export async function listRecipe(itemId: string): Promise<RecipeLine[]> {
  const { data, error } = await supabase
    .from('biz_recipe_line')
    .select('id,supply_id,component_item_id,qty,unit')
    .eq('item_id', itemId);
  if (error) throw error;
  return ((data ?? []) as any[]).map((l) => ({ ...l, qty: Number(l.qty) })) as RecipeLine[];
}

export async function addRecipeLine(input: {
  item_id: string;
  supply_id: string;
  qty: number;
  unit: string;
}): Promise<void> {
  const { error } = await supabase.from('biz_recipe_line').insert(input);
  if (error) throw error;
}

export async function removeRecipeLine(id: string): Promise<void> {
  const { error } = await supabase.from('biz_recipe_line').delete().eq('id', id);
  if (error) throw error;
}

// ── the hot path: sales, losses, costs ───────────────────────────────────────

/** One tap = one sale. Cost is snapshotted NOW so history stays honest. */
export async function recordSale(item: BizItem, businessId: string, qty = 1): Promise<string> {
  const amount = qty * item.price;
  const { data, error } = await supabase
    .from('biz_sale')
    .insert({
      business_id: businessId,
      item_id: item.id,
      qty,
      unit_price: item.price,
      amount,
      unit_cost_snapshot: item.unit_cost ?? 0,
      extra_cost_snapshot: item.extra_cost ?? 0,
      fee_amount: amount * (item.fee_pct ?? 0),
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function undoSale(saleId: string): Promise<void> {
  const { error } = await supabase.from('biz_sale').delete().eq('id', saleId);
  if (error) throw error;
}

/** The leak — one row every time something leaves with no cash attached. */
export async function recordLoss(input: {
  business_id: string;
  item: BizItem | null;
  qty: number;
  reason: string;
}): Promise<void> {
  const unitCost = input.item ? (input.item.unit_cost ?? 0) + (input.item.extra_cost ?? 0) : 0;
  const { error } = await supabase.from('biz_loss').insert({
    business_id: input.business_id,
    item_id: input.item?.id ?? null,
    qty: input.qty,
    reason: input.reason,
    cost_value: input.qty * unitCost,
  });
  if (error) throw error;
}

export async function recordCost(input: {
  business_id: string;
  amount: number;
  type: string;
  category_key: string;
  note?: string;
}): Promise<void> {
  const { error } = await supabase.from('biz_cost').insert(input);
  if (error) throw error;
}

// ── fixed costs (the entire input to break-even) ─────────────────────────────

export async function listFixedCosts(businessId: string): Promise<FixedCost[]> {
  const { data, error } = await supabase
    .from('biz_fixed_cost')
    .select('id,name,amount,due_day')
    .eq('business_id', businessId)
    .is('active_to', null)
    .order('amount', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((f) => ({ ...f, amount: Number(f.amount) })) as FixedCost[];
}

export async function addFixedCost(input: {
  business_id: string;
  name: string;
  amount: number;
  due_day?: number | null;
}): Promise<void> {
  const { error } = await supabase.from('biz_fixed_cost').insert(input);
  if (error) throw error;
}

export async function endFixedCost(id: string): Promise<void> {
  const { error } = await supabase
    .from('biz_fixed_cost')
    .update({ active_to: new Date().toISOString().slice(0, 10) })
    .eq('id', id);
  if (error) throw error;
}

// ── the home screen in one call ──────────────────────────────────────────────

export async function getDashboard(businessId: string, from: Date, to: Date): Promise<BizDashboard> {
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc('biz_dashboard', {
    p_business: businessId,
    p_from: d(from),
    p_to: d(to),
  });
  if (error) throw error;
  const row = data as any;
  return {
    ...row,
    daily_target: Number(row.daily_target ?? 0),
    today_keep: Number(row.today_keep ?? 0),
    today_progress: row.today_progress == null ? null : Number(row.today_progress),
    contribution: Number(row.contribution ?? 0),
    costs: Number(row.costs ?? 0),
    leak: Number(row.leak ?? 0),
    fixed_prorated: Number(row.fixed_prorated ?? 0),
    net: Number(row.net ?? 0),
    cash_collected: Number(row.cash_collected ?? 0),
    money_owed: Number(row.money_owed ?? 0),
    leak_share: Number(row.leak_share ?? 0),
  } as BizDashboard;
}
