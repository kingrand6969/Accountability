import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { getPublicProfiles } from '../profiles/publicProfiles';

/**
 * Compete layer — opt-in location, buddy live-location, Pro-created challenges,
 * and city/country leaderboards. Scores come from security-definer RPCs on the
 * server (see 0040_compete.sql), so no raw activity data is ever exposed.
 */

export type Metric = 'consistency' | 'distance' | 'points' | 'avgkm' | 'chwin';
export type Period = 'week' | 'month' | 'all';
export type Scope = 'city' | 'country';

export const METRICS: { value: Metric; label: string; icon: string; unit: string }[] = [
  { value: 'consistency', label: 'Consistency', icon: 'flame', unit: 'days' },
  { value: 'distance', label: 'Distance', icon: 'walk', unit: 'km' },
  { value: 'points', label: 'Points', icon: 'trophy', unit: 'pts' },
  // lifetime average — computed since join date, so the period chips don't apply
  { value: 'avgkm', label: 'Avg km/day', icon: 'speedometer', unit: 'km/day' },
  // net challenge record: wins − losses, floored at 0 — only wins are shown
  { value: 'chwin', label: 'Challenge wins', icon: 'medal', unit: 'wins' },
];

/** Time-boxed challenges can't run on the derived metrics. */
export const CHALLENGE_METRICS = METRICS.filter(
  (m) => m.value !== 'avgkm' && m.value !== 'chwin',
);

export const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
];

export function metricMeta(m: Metric) {
  return METRICS.find((x) => x.value === m) ?? METRICS[0];
}

/** Format a raw score for a metric (distance keeps 1 decimal, others whole). */
export function formatScore(score: number, metric: Metric): string {
  if (metric === 'distance') return `${score.toFixed(1)} km`;
  if (metric === 'avgkm') return `${score.toFixed(2)} km/day`;
  if (metric === 'chwin') return `${Math.round(score)} ${Math.round(score) === 1 ? 'win' : 'wins'}`;
  const meta = metricMeta(metric);
  return `${Math.round(score)} ${meta.unit}`;
}

export type LeaderRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
  score: number;
  rnk: number;
};

export type BuddyRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  score: number;
  rnk: number;
  is_me: boolean;
};

export type StandingRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  score: number;
  rnk: number;
};

export type Challenge = {
  id: string;
  creator_id: string | null;
  title: string;
  metric: Metric;
  starts_at: string;
  ends_at: string;
  created_at: string;
  is_official?: boolean;
  cadence?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | null;
  difficulty?: 'beginner' | 'intermediate' | 'advanced' | null;
  target?: number | null;
  rest_day_tokens?: number;
};

export type ChallengeCard = Challenge & { participants: number; joined: boolean };

export type BuddyLocation = {
  user_id: string;
  name: string | null;
  avatar: string | null;
  lat: number;
  lng: number;
  updated_at: string;
};

async function me(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ─── Location (opt-in) ───────────────────────────────────────────────────────

export type LocationSharing = {
  city: string | null;
  country: string | null;
  share_location: boolean;
};

export async function getLocationSharing(): Promise<LocationSharing> {
  const uid = await me();
  if (!uid) return { city: null, country: null, share_location: false };
  const { data, error } = await supabase
    .from('profiles')
    .select('city,country,share_location')
    .eq('id', uid)
    .maybeSingle();
  if (error) throw error;
  return {
    city: data?.city ?? null,
    country: data?.country ?? null,
    share_location: !!data?.share_location,
  };
}

/**
 * Ask for location permission and register the device's real position as this
 * member's leaderboard place. The COORDINATES are sent to the set-location
 * Edge Function, which reverse-geocodes them server-side and is the only writer
 * of city/country — the client cannot assert a place it isn't in.
 *
 * Returns null on web or if the member declines the permission prompt. THROWS
 * with a readable message when the server refuses (e.g. the 30-day change
 * cooldown, or a location under admin review) so the screen can show it.
 */
export async function enableLocationSharing(): Promise<{ city: string | null; country: string | null } | null> {
  const uid = await me();
  if (!uid) return null;
  if (Platform.OS === 'web') {
    // web can't geocode — null any stale place so we never re-publish a location
    // the user hasn't confirmed here; they'll geocode next time on their phone
    await supabase
      .from('profiles')
      .update({ city: null, country: null, share_location: true })
      .eq('id', uid);
    return { city: null, country: null };
  }
  try {
    const Location = await import('expo-location');
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const pos = await Location.getCurrentPositionAsync({});
    // Send RAW COORDINATES only. The server reverse-geocodes them and is the
    // sole writer of city/country (migration 0067) — so a client can never
    // claim a city it isn't in just to top that leaderboard.
    const { data, error } = await supabase.functions.invoke('set-location', {
      body: { lat: pos.coords.latitude, lng: pos.coords.longitude },
    });
    if (error) {
      let msg = 'Could not verify your location. Please try again.';
      try {
        const ctx = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.();
        if (ctx?.error) msg = ctx.error;
      } catch {
        /* keep the generic message */
      }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error as string);
    // timezone is not rank-affecting, so it stays a plain client write
    await supabase.from('profiles').update({ tz_offset: new Date().getTimezoneOffset() }).eq('id', uid);
    return { city: (data?.city as string) ?? null, country: (data?.country as string) ?? null };
  } catch (e) {
    throw e instanceof Error ? e : new Error('Could not verify your location.');
  }
}

export async function disableLocationSharing(): Promise<void> {
  const uid = await me();
  if (!uid) return;
  // opt-out forgets the coarse place too (data minimisation), not just the flag
  await supabase
    .from('profiles')
    .update({ city: null, country: null, share_location: false })
    .eq('id', uid);
  // also drop any live position we were sharing with buddies
  await supabase.from('buddy_locations').delete().eq('user_id', uid);
}

/**
 * Store the device's current UTC offset so leaderboards bucket "active days" by
 * the user's local day (matching the streak on Insights/Track). Cheap & safe to
 * call on mount; failures are non-critical.
 */
export async function syncTimezone(): Promise<void> {
  const uid = await me();
  if (!uid) return;
  try {
    await supabase.from('profiles').update({ tz_offset: new Date().getTimezoneOffset() }).eq('id', uid);
  } catch {
    // non-critical — leaderboards fall back to UTC bucketing
  }
}

// ─── Live buddy location ─────────────────────────────────────────────────────

/** Upsert my current coordinates — readable only by accepted buddies (RLS). */
export async function pushLiveLocation(lat: number, lng: number): Promise<void> {
  const uid = await me();
  if (!uid) return;
  const { error } = await supabase
    .from('buddy_locations')
    .upsert({ user_id: uid, lat, lng, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function stopLiveLocation(): Promise<void> {
  const uid = await me();
  if (!uid) return;
  await supabase.from('buddy_locations').delete().eq('user_id', uid);
}

/** Buddies (and me) who are currently sharing a live position. */
export async function getBuddyLocations(): Promise<BuddyLocation[]> {
  const { data, error } = await supabase
    .from('buddy_locations')
    .select('user_id,lat,lng,updated_at');
  if (error) throw error;
  const rows = data ?? [];
  // names/avatars come from public_profiles — the base profiles row only exposes
  // your own, so an embedded join would return null for every buddy
  const profs = await getPublicProfiles(rows.map((r: any) => r.user_id));
  return rows.map((r: any) => {
    const p = profs.get(r.user_id);
    return {
      user_id: r.user_id,
      lat: Number(r.lat),
      lng: Number(r.lng),
      updated_at: r.updated_at,
      name: p?.display_name ?? null,
      avatar: p?.avatar_url ?? null,
    };
  });
}

// ─── Leaderboards ────────────────────────────────────────────────────────────

export async function getLeaderboard(scope: Scope, metric: Metric, period: Period): Promise<LeaderRow[]> {
  const { data, error } = await supabase.rpc('leaderboard', {
    p_scope: scope,
    p_metric: metric,
    p_period: period,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, score: Number(r.score), rnk: Number(r.rnk) }));
}

// ─── Buddy head-to-head ──────────────────────────────────────────────────────

export async function getBuddyStandings(metric: Metric, period: Period): Promise<BuddyRow[]> {
  const { data, error } = await supabase.rpc('buddy_standings', {
    p_metric: metric,
    p_period: period,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, score: Number(r.score), rnk: Number(r.rnk) }));
}

// ─── Challenges ──────────────────────────────────────────────────────────────

export async function listChallenges(): Promise<ChallengeCard[]> {
  const uid = await me();
  const refreshed = await supabase.rpc('refresh_official_challenges');
  if (refreshed.error) throw refreshed.error;
  const [{ data: rows, error }, joinedRes] = await Promise.all([
    supabase
      .from('challenges')
      .select('id,creator_id,title,metric,starts_at,ends_at,created_at,is_official,cadence,difficulty,target,rest_day_tokens, challenge_participants(count)')
      .order('ends_at', { ascending: true })
      .limit(100),
    uid
      ? supabase.from('challenge_participants').select('challenge_id').eq('user_id', uid)
      : Promise.resolve({ data: [] as { challenge_id: string }[] }),
  ]);
  if (error) throw error;
  const joined = new Set((joinedRes.data ?? []).map((r: any) => r.challenge_id));
  return (rows ?? []).map((c: any) => ({
    id: c.id,
    creator_id: c.creator_id,
    title: c.title,
    metric: c.metric,
    starts_at: c.starts_at,
    ends_at: c.ends_at,
    created_at: c.created_at,
    is_official: !!c.is_official,
    cadence: c.cadence ?? null,
    difficulty: c.difficulty ?? null,
    target: c.target == null ? null : Number(c.target),
    rest_day_tokens: Number(c.rest_day_tokens ?? 0),
    participants: c.challenge_participants?.[0]?.count ?? 0,
    joined: joined.has(c.id),
  }));
}

export async function getChallenge(id: string): Promise<ChallengeCard | null> {
  const uid = await me();
  const { data, error } = await supabase
    .from('challenges')
    .select('id,creator_id,title,metric,starts_at,ends_at,created_at,is_official,cadence,difficulty,target,rest_day_tokens, challenge_participants(count)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  let joined = false;
  if (uid) {
    const { data: mine } = await supabase
      .from('challenge_participants')
      .select('user_id')
      .eq('challenge_id', id)
      .eq('user_id', uid)
      .maybeSingle();
    joined = !!mine;
  }
  return {
    id: data.id,
    creator_id: data.creator_id,
    title: data.title,
    metric: data.metric,
    starts_at: data.starts_at,
    ends_at: data.ends_at,
    created_at: data.created_at,
    is_official: !!(data as any).is_official,
    cadence: (data as any).cadence ?? null,
    difficulty: (data as any).difficulty ?? null,
    target: (data as any).target == null ? null : Number((data as any).target),
    rest_day_tokens: Number((data as any).rest_day_tokens ?? 0),
    participants: (data as any).challenge_participants?.[0]?.count ?? 0,
    joined,
  };
}

/** Create a challenge. The server RLS policy rejects this unless the caller is Pro. */
export async function createChallenge(input: {
  title: string;
  metric: Metric;
  days: number;
}): Promise<string> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in');
  const now = new Date();
  const ends = new Date(now.getTime() + input.days * 86400000);
  const { data, error } = await supabase
    .from('challenges')
    .insert({
      creator_id: uid,
      title: input.title.trim(),
      metric: input.metric,
      starts_at: now.toISOString(),
      ends_at: ends.toISOString(),
    })
    .select('id')
    .single();
  if (error) {
    // RLS check failure surfaces as a permissions error — make it human
    if (String(error.message).toLowerCase().includes('row-level security')) {
      throw new Error('Creating challenges is a Pro feature.');
    }
    throw error;
  }
  // creator auto-joins their own challenge
  await supabase.from('challenge_participants').insert({ challenge_id: data.id, user_id: uid });
  return data.id;
}

export async function joinChallenge(id: string): Promise<void> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in');
  const { error } = await supabase
    .from('challenge_participants')
    .insert({
      challenge_id: id,
      user_id: uid,
      timezone_offset: new Date().getTimezoneOffset(),
    });
  // 23505 = unique-violation (already joined) — treat as a no-op
  if (error && error.code !== '23505') throw error;
}

export async function leaveChallenge(id: string): Promise<void> {
  const uid = await me();
  if (!uid) return;
  const { error } = await supabase
    .from('challenge_participants')
    .delete()
    .eq('challenge_id', id)
    .eq('user_id', uid);
  if (error) throw error;
}

export async function getChallengeStandings(id: string): Promise<StandingRow[]> {
  const { data, error } = await supabase.rpc('challenge_standings', { p_challenge: id });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, score: Number(r.score), rnk: Number(r.rnk) }));
}
