import { supabase } from '../lib/supabase';
import { toLocalDateString } from '../timeline/datetime';
import {
  periodRange,
  chartBuckets,
  sumInBucket,
  distinctDays,
  type Period,
  type Bucket,
} from './compute';

export type Insights = {
  period: Period;
  km: number;
  activeSeconds: number;
  activitiesCount: number;
  workouts: number;
  meals: number;
  kcal: number;
  tasksDone: number;
  daysActive: number;
  daysInPeriod: number;
  spend: number;
  income: number;
  chart: { label: string; km: number; items: number }[];
};

async function me(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function getInsights(period: Period): Promise<Insights> {
  const uid = await me();
  const now = new Date();
  const { start, end } = periodRange(period, now);
  const buckets: Bucket[] = period === 'day' ? [] : chartBuckets(period, now);
  const daysInPeriod = period === 'day' ? 1 : period === 'week' ? 7 : 30;
  const empty: Insights = {
    period,
    km: 0,
    activeSeconds: 0,
    activitiesCount: 0,
    workouts: 0,
    meals: 0,
    kcal: 0,
    tasksDone: 0,
    daysActive: 0,
    daysInPeriod,
    spend: 0,
    income: 0,
    chart: buckets.map((b) => ({ label: b.label, km: 0, items: 0 })),
  };
  if (!uid) return empty;

  const [actRes, itemsRes, foodRes, txRes] = await Promise.all([
    supabase
      .from('activities')
      .select('distance_m,duration_s,started_at')
      .eq('user_id', uid)
      .gte('started_at', start.toISOString())
      .order('started_at', { ascending: false })
      .limit(1000),
    supabase
      .from('timeline_items')
      .select('type,starts_at')
      .eq('user_id', uid)
      .gte('starts_at', start.toISOString())
      .lte('starts_at', end.toISOString())
      .order('starts_at', { ascending: false })
      .limit(1000),
    supabase
      .from('food_logs')
      .select('calories,log_date')
      .eq('user_id', uid)
      .gte('log_date', toLocalDateString(start))
      .limit(1000),
    supabase
      .from('money_transactions')
      .select('kind,amount,tx_date')
      .eq('user_id', uid)
      .gte('tx_date', toLocalDateString(start))
      .limit(1000),
  ]);
  const failed = [actRes, itemsRes, foodRes, txRes].find((r) => r.error);
  if (failed?.error) throw failed.error;

  const acts = (actRes.data ?? []) as { distance_m: number; duration_s: number; started_at: string }[];
  const items = (itemsRes.data ?? []) as { type: string; starts_at: string }[];
  const foods = (foodRes.data ?? []) as { calories: number; log_date: string }[];
  const txs = (txRes.data ?? []) as { kind: string; amount: number; tx_date: string }[];

  const km = acts.reduce((s, a) => s + Number(a.distance_m || 0), 0) / 1000;
  const activeSeconds = acts.reduce((s, a) => s + Number(a.duration_s || 0), 0);

  const chart = buckets.map((b) => ({
    label: b.label,
    km:
      sumInBucket(acts, b, (a) => new Date(a.started_at), (a) => Number(a.distance_m || 0)) /
      1000,
    items: sumInBucket(items, b, (i) => new Date(i.starts_at), () => 1),
  }));

  return {
    period,
    km,
    activeSeconds,
    activitiesCount: acts.length,
    workouts: items.filter((i) => i.type === 'workout').length,
    meals: items.filter((i) => i.type === 'meal').length,
    kcal: foods.reduce((s, f) => s + Number(f.calories || 0), 0),
    tasksDone: items.filter((i) => i.type === 'task' || i.type === 'event').length,
    daysActive: distinctDays(items.map((i) => new Date(i.starts_at))),
    daysInPeriod,
    spend: txs.filter((t) => t.kind === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0),
    income: txs.filter((t) => t.kind === 'income').reduce((s, t) => s + Number(t.amount || 0), 0),
    chart,
  };
}
