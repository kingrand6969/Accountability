import { supabase } from '../lib/supabase';
import { getHomeStats } from '../home/api';
import type { Metrics } from './catalog';

async function me(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Gather everything the medals score against, from data we already store. */
export async function getMetrics(): Promise<Metrics> {
  const uid = await me();
  const [stats, km, workouts, challenges] = await Promise.all([
    getHomeStats().catch(() => ({ streak: 0, buddyCount: 0 }) as { streak: number; buddyCount: number }),
    totalKm(),
    countWorkouts(),
    countChallenges(uid),
  ]);
  return {
    streak: stats.streak ?? 0,
    buddies: stats.buddyCount ?? 0,
    totalKm: km,
    workouts,
    challenges,
  };
}

async function totalKm(): Promise<number> {
  // activities are owner-only (RLS), so this sums just my distance
  const { data, error } = await supabase.from('activities').select('distance_m');
  if (error || !data) return 0;
  return data.reduce((s: number, a: { distance_m: number | null }) => s + Number(a.distance_m || 0), 0) / 1000;
}

async function countWorkouts(): Promise<number> {
  const { count } = await supabase
    .from('timeline_items')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'workout');
  return count ?? 0;
}

async function countChallenges(uid: string | null): Promise<number> {
  if (!uid) return 0;
  const { count } = await supabase
    .from('challenge_participants')
    .select('challenge_id', { count: 'exact', head: true })
    .eq('user_id', uid);
  return count ?? 0;
}
