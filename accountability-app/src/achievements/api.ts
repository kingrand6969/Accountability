import { supabase } from '../lib/supabase';
import { getHomeStats } from '../home/api';
import { getCardMetrics } from '../buddy/card';
import { myReferralCount } from '../profiles/referrals';
import { createPost } from '../feed/api';
import { MEDALS, flexPoints, medalState, rankFor, type Metrics } from './catalog';
import { MISSIONS, missionState, missionPoints, type MissionState } from './missions';

async function me(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Gather everything the medals and missions score against, from data we already
 *  store. Fitness fields feed the medals; social fields feed the missions. */
export async function getMetrics(): Promise<Metrics> {
  const uid = await me();
  const [stats, act, card, counts, invites] = await Promise.all([
    getHomeStats().catch(() => ({ streak: 0, buddyCount: 0 }) as { streak: number; buddyCount: number }),
    activityStats(),
    uid
      ? getCardMetrics(uid).catch(() => ({ consistency: 0, chwin: 0 }))
      : Promise.resolve({ consistency: 0, chwin: 0 }),
    metricCounts(),
    myReferralCount().catch(() => 0),
  ]);
  return {
    streak: stats.streak ?? 0,
    buddies: stats.buddyCount ?? 0,
    totalKm: act.km,
    workouts: counts.workouts,
    challenges: counts.challenges,
    activities: act.count,
    longestKm: act.longest,
    activeDays: Number(card.consistency ?? 0),
    challengeWins: Number(card.chwin ?? 0),
    memories: counts.memories,
    goalsHit: counts.goals_hit,
    totalHours: act.hours,
    places: counts.places,
    invitesAccepted: invites,
    postsShared: counts.posts,
    likesGiven: counts.likes,
    groupsJoined: counts.groups,
    buddyMessages: counts.messages,
    profileFields: counts.profile_fields,
  };
}

type MetricCounts = {
  workouts: number;
  challenges: number;
  memories: number;
  places: number;
  posts: number;
  likes: number;
  groups: number;
  messages: number;
  goals_hit: number;
  profile_fields: number;
};

const ZERO_COUNTS: MetricCounts = {
  workouts: 0, challenges: 0, memories: 0, places: 0, posts: 0,
  likes: 0, groups: 0, messages: 0, goals_hit: 0, profile_fields: 0,
};

/** Every medal/mission tally in ONE round trip (my_metric_counts RPC) —
 *  replaces the old ~10-query count fan-out per Trophy Case open. */
async function metricCounts(): Promise<MetricCounts> {
  const { data, error } = await supabase.rpc('my_metric_counts');
  if (error || !data) return ZERO_COUNTS;
  const d = data as Partial<Record<keyof MetricCounts, number | null>>;
  const out = { ...ZERO_COUNTS };
  (Object.keys(ZERO_COUNTS) as (keyof MetricCounts)[]).forEach((k) => {
    out[k] = Number(d[k] ?? 0);
  });
  return out;
}

/** Per-user progress for action missions (flex, run selfie), keyed by mission id. */
export async function getMissionProgress(): Promise<Map<string, number>> {
  const uid = await me();
  if (!uid) return new Map();
  const { data, error } = await supabase
    .from('mission_progress')
    .select('mission_id,value')
    .eq('user_id', uid);
  if (error || !data) return new Map();
  return new Map(data.map((r: { mission_id: string; value: number }) => [r.mission_id, Number(r.value)]));
}

/** Combine metric-derived and action missions into their current state. */
export function buildMissionStates(m: Metrics, progress: Map<string, number>): MissionState[] {
  return MISSIONS.map((def) =>
    missionState(def, def.source === 'metric' && def.metric ? m[def.metric] : progress.get(def.id) ?? 0),
  );
}

export async function getMissionStates(): Promise<MissionState[]> {
  const [m, progress] = await Promise.all([getMetrics(), getMissionProgress()]);
  return buildMissionStates(m, progress);
}

/** Lightweight rank summary for badges shown outside the Trophy Case. Rank
 *  points = medal tiers + completed missions. */
export type MedalTier = { id: string; tier: number };

export type GetRankOptions = {
  /** Bind rank computation to the account that initiated the containing view. */
  expectedOwnerId?: string;
  /** Editors use a read-only rank so rendering a preview can never mutate data. */
  snapshot?: boolean;
};

const RANK_ACCOUNT_CHANGED = 'Account changed. Rank was not saved.';

async function assertRankOwner(expectedOwnerId: string): Promise<void> {
  if ((await me()) !== expectedOwnerId) throw new Error(RANK_ACCOUNT_CHANGED);
}

export async function getRank(options: GetRankOptions = {}): Promise<{
  name: string;
  points: number;
  earned: number;
  medalList: MedalTier[];
}> {
  const ownerId = options.expectedOwnerId ?? await me();
  if (options.expectedOwnerId) await assertRankOwner(options.expectedOwnerId);
  const [m, progress] = await Promise.all([getMetrics(), getMissionProgress()]);
  const medalStates = MEDALS.map((def) => medalState(def, m[def.metric]));
  const points = flexPoints(medalStates) + missionPoints(buildMissionStates(m, progress));
  const unlocked = medalStates.filter((s) => s.unlocked);
  const earned = unlocked.length;
  // highest tiers first, so the card shows a member's best medals up front
  const medalList: MedalTier[] = unlocked
    .sort((a, b) => b.tierIndex - a.tierIndex)
    .map((s) => ({ id: s.def.id, tier: s.tierIndex }));
  const name = rankFor(points).name;
  // Keep the buddy card's badge + medals current for visitors (these can only be
  // computed with the owner's own data, so we snapshot them here).
  if (ownerId && options.snapshot !== false) {
    snapshotRankToCardForOwner(ownerId, name, earned, medalList).catch(() => {});
  }
  return { name, points, earned, medalList };
}

/** Persist the owner's current rank + medals onto their buddy card so visitors
 *  always see an up-to-date badge and medal shelf. No-op when nothing changed. */
export async function snapshotRankToCardForOwner(
  expectedOwnerId: string,
  rankName: string,
  medals: number,
  medalList: MedalTier[],
): Promise<void> {
  await assertRankOwner(expectedOwnerId);
  const { data: updated, error } = await supabase.rpc('patch_my_buddy_card', {
    p_expected_owner: expectedOwnerId,
    p_patch: { rank_name: rankName, medals, medals_list: medalList },
    p_patch_kind: 'rank',
  });
  if (error) throw new Error(error.message ?? 'Rank could not be saved.');
  if (!updated || typeof updated !== 'object' || Array.isArray(updated)) {
    throw new Error('Rank could not be saved for this account.');
  }
  await assertRankOwner(expectedOwnerId);
}

/** Post the member's rank to the feed (buddies see it) and count the flex. */
export async function flexRank(rankName: string): Promise<void> {
  const brag = `Just hit ${rankName} rank 💪 Flex Points and climbing — come compete with me!`;
  await createPost(brag);
  await supabase.rpc('mission_bump', { p_mission: 'flex-rank', p_value: 1, p_max: false });
}

/** Flex a leaderboard placing (e.g. "#2 in Lisbon · Avg km/day") to the feed.
 *  Counts toward the Show Off mission like any other flex. */
export async function flexStanding(
  place: number,
  boardLabel: string,
  metricLabel: string,
  scoreLabel: string,
): Promise<void> {
  const brag = `Ranked #${place} in ${boardLabel} for ${metricLabel} — ${scoreLabel} 🏆 Think you can beat me?`;
  await createPost(brag);
  await supabase.rpc('mission_bump', { p_mission: 'flex-rank', p_value: 1, p_max: false });
}

/** Record that the member shared a run selfie at `km` (keeps the high-water mark). */
export async function recordRunSelfie(km: number): Promise<void> {
  if (!(km > 0)) return;
  await supabase.rpc('mission_bump', { p_mission: 'selfie-club', p_value: km, p_max: true });
}

/** Sum, count, longest and hours over the caller's activities — one aggregate
 *  row from the my_activity_stats RPC. (The old client-side sum downloaded
 *  every activity row and silently understated totals past PostgREST's
 *  1000-row response cap.) */
async function activityStats(): Promise<{ km: number; count: number; longest: number; hours: number }> {
  const { data, error } = await supabase.rpc('my_activity_stats');
  if (error || !data) return { km: 0, count: 0, longest: 0, hours: 0 };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    km: Number(row?.km ?? 0),
    count: Number(row?.cnt ?? 0),
    longest: Number(row?.longest_km ?? 0),
    hours: Number(row?.hours ?? 0),
  };
}
