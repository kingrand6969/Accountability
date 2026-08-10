import { supabase } from '../lib/supabase';
import { toLocalDateString } from '../timeline/datetime';
import { computeStreak } from './streak';

export type HomeStats = {
  streak: number;
  todayCount: number;
  weekWorkouts: number;
  weekActivities: number;
  buddyRequests: number;
  buddyCount: number;
};

const ZERO: HomeStats = {
  streak: 0,
  todayCount: 0,
  weekWorkouts: 0,
  weekActivities: 0,
  buddyRequests: 0,
  buddyCount: 0,
};

export async function getHomeStats(): Promise<HomeStats> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return ZERO;

  const now = new Date();
  const todayStr = toLocalDateString(now);
  const since = new Date(now);
  since.setDate(since.getDate() - 400);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  const [itemsRes, reqRes, linkRes] = await Promise.all([
    // Newest-first + explicit limit: PostgREST caps at 1000 rows, so without
    // an order the *recent* days could be the ones silently dropped and the
    // streak would collapse for very active users.
    supabase
      .from('timeline_items')
      .select('type,starts_at')
      .eq('user_id', uid)
      .gte('starts_at', since.toISOString())
      .order('starts_at', { ascending: false })
      .limit(1000),
    supabase
      .from('buddy_requests')
      // count only — we just need the number, not the rows
      .select('id', { count: 'exact', head: true })
      .eq('to_user', uid)
      .eq('status', 'pending'),
    supabase
      .from('buddy_links')
      .select('user_a', { count: 'exact', head: true })
      .or(`user_a.eq.${uid},user_b.eq.${uid}`),
  ]);

  // Surface failures instead of rendering zeroed stats (a false "streak lost"
  // signal is the worst thing an accountability app can show).
  const failed = [itemsRes, reqRes, linkRes].find((r) => r.error);
  if (failed?.error) throw failed.error;

  const items = itemsRes.data ?? [];
  const daySet = new Set(items.map((r: any) => toLocalDateString(new Date(r.starts_at))));
  const streak = computeStreak(daySet, todayStr);
  const todayCount = items.filter(
    (r: any) => toLocalDateString(new Date(r.starts_at)) === todayStr,
  ).length;
  const weekItems = items.filter((r: any) => new Date(r.starts_at) >= weekStart);
  const weekWorkouts = weekItems.filter((r: any) => r.type === 'workout').length;
  const weekActivities = weekItems.filter((r: any) => r.type === 'activity').length;

  return {
    streak,
    todayCount,
    weekWorkouts,
    weekActivities,
    buddyRequests: reqRes.count ?? 0,
    buddyCount: linkRes.count ?? 0,
  };
}
