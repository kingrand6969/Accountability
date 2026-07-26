import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** What we can measure about a member. Medals read the fitness fields; missions
 *  read the social fields (posts shared, likes given) so the two never overlap. */
export type Metrics = {
  streak: number;
  totalKm: number;
  workouts: number;
  challenges: number;
  buddies: number;
  // more fitness / personal fields — medals only
  activities: number; // GPS runs / walks / rides logged
  longestKm: number; // longest single distance
  activeDays: number; // distinct days with any activity (all-time)
  challengeWins: number; // challenges won
  memories: number; // photos / videos saved
  goalsHit: number; // savings goals reached
  totalHours: number; // total time spent on GPS activities
  places: number; // memories saved with a location
  invitesAccepted: number; // friends who joined the app from your invite
  // social fields — missions only
  postsShared: number;
  likesGiven: number;
  groupsJoined: number;
  buddyMessages: number;
  profileFields: number; // filled fields out of 3 (photo, name, bio)
};

/** The five metal tiers. Index maps to TIER_META (Bronze…Diamond). */
export const TIER_META = [
  { name: 'Bronze', base: '#C77B3C', light: '#EDB07B', dark: '#8A5122', glow: '#E89A55' },
  { name: 'Silver', base: '#9AA6B4', light: '#DCE3EA', dark: '#69737F', glow: '#C2CCD6' },
  { name: 'Gold', base: '#F2B33D', light: '#FFDD84', dark: '#C08214', glow: '#FFC94D' },
  { name: 'Platinum', base: '#57B6C7', light: '#AEE6EF', dark: '#357E8D', glow: '#7FD6E3' },
  { name: 'Diamond', base: '#8E9CF5', light: '#CBD4FF', dark: '#5A67CE', glow: '#AEB9FF' },
] as const;

export const LOCKED_META = {
  name: 'Locked',
  base: '#AEB6C2',
  light: '#D4DAE2',
  dark: '#828B98',
  glow: '#C2C9D2',
} as const;

export type MedalDef = {
  id: string;
  title: string;
  icon: IoniconName;
  blurb: string;
  unit: string;
  metric: keyof Metrics;
  /**
   * Which metal the first tier is cast in (0 = Bronze … 4 = Diamond). Easy medals
   * start at Bronze; hard ones start higher (e.g. Gold) because even step one is a
   * big ask. Defaults to Bronze.
   */
  startTier?: number;
  /** 1–5 tiers, ascending; the flavour name shows under the medal. The metal of
   *  tier i is TIER_META[startTier + i], capped at Diamond. */
  tiers: { name: string; at: number }[];
};

/** The metal (0–4 → Bronze…Diamond) a medal's tier is cast in, honouring its
 *  difficulty start-tier. */
export function medalMetal(def: MedalDef, tierIndex: number): number {
  return Math.min((def.startTier ?? 0) + Math.max(tierIndex, 0), TIER_META.length - 1);
}

export const MEDALS: MedalDef[] = [
  {
    id: 'streak',
    title: 'Streak Flame',
    icon: 'flame',
    blurb: 'Show up day after day. Your flame grows the longer you keep going.',
    unit: 'day streak',
    metric: 'streak',
    tiers: [
      { name: 'Spark', at: 3 },
      { name: 'Ember', at: 7 },
      { name: 'Blaze', at: 30 },
      { name: 'Inferno', at: 100 },
      { name: 'Eternal', at: 365 },
    ],
  },
  {
    id: 'distance',
    title: 'Distance Club',
    icon: 'walk',
    blurb: 'Total kilometres from your GPS runs, walks and rides.',
    unit: 'km',
    metric: 'totalKm',
    tiers: [
      { name: '10K Club', at: 10 },
      { name: '50K Club', at: 50 },
      { name: 'Century', at: 100 },
      { name: '250 Club', at: 250 },
      { name: '500 Club', at: 500 },
    ],
  },
  {
    id: 'iron',
    title: 'Iron',
    icon: 'barbell',
    blurb: 'Workouts logged. Consistency in the gym pays off.',
    unit: 'workouts',
    metric: 'workouts',
    tiers: [
      { name: 'Rookie', at: 10 },
      { name: 'Lifter', at: 50 },
      { name: 'Strong', at: 100 },
      { name: 'Beast', at: 250 },
      { name: 'Titan', at: 500 },
    ],
  },
  {
    id: 'competitor',
    title: 'Competitor',
    icon: 'trophy',
    blurb: 'Challenges you have entered. The arena rewards the bold.',
    unit: 'challenges',
    metric: 'challenges',
    tiers: [
      { name: 'Challenger', at: 1 },
      { name: 'Regular', at: 3 },
      { name: 'Contender', at: 5 },
      { name: 'Veteran', at: 10 },
      { name: 'Legend', at: 25 },
    ],
  },
  {
    id: 'squad',
    title: 'Squad',
    icon: 'people',
    blurb: 'Accountability buddies keep you honest. Build your crew.',
    unit: 'buddies',
    metric: 'buddies',
    tiers: [
      { name: 'Matched', at: 1 },
      { name: 'Duo', at: 2 },
      { name: 'Crew', at: 5 },
      { name: 'Squad', at: 10 },
      { name: 'Team', at: 20 },
    ],
  },
  {
    id: 'trailblazer',
    title: 'Trailblazer',
    icon: 'compass',
    blurb: 'Every run, walk and ride you log adds to your trail.',
    unit: 'activities',
    metric: 'activities',
    tiers: [
      { name: 'Explorer', at: 1 },
      { name: 'Wanderer', at: 10 },
      { name: 'Roamer', at: 50 },
      { name: 'Trailblazer', at: 150 },
      { name: 'Nomad', at: 500 },
    ],
  },
  {
    id: 'longhaul',
    title: 'Long Haul',
    icon: 'map',
    blurb: 'Your longest single distance. How far can you go in one go?',
    unit: 'km',
    metric: 'longestKm',
    tiers: [
      { name: '5K', at: 5 },
      { name: '10K', at: 10 },
      { name: 'Half', at: 21 },
      { name: 'Marathon', at: 42 },
      { name: 'Ultra', at: 100 },
    ],
  },
  {
    id: 'devotion',
    title: 'Devotion',
    icon: 'calendar',
    blurb: 'Total days you showed up for any pillar. Consistency is king.',
    unit: 'active days',
    metric: 'activeDays',
    tiers: [
      { name: 'Starter', at: 5 },
      { name: 'Steady', at: 30 },
      { name: 'Devoted', at: 100 },
      { name: 'Relentless', at: 250 },
      { name: 'Unstoppable', at: 365 },
    ],
  },
  {
    id: 'champion',
    title: 'Champion',
    icon: 'medal',
    blurb: 'Challenges you have won. Beat your buddies to earn them.',
    unit: 'wins',
    metric: 'challengeWins',
    tiers: [
      { name: 'Winner', at: 1 },
      { name: 'Rival', at: 3 },
      { name: 'Victor', at: 5 },
      { name: 'Dominator', at: 15 },
      { name: 'Champion', at: 30 },
    ],
  },
  {
    id: 'archivist',
    title: 'Archivist',
    icon: 'images',
    blurb: 'Photos and videos you have saved to your memories.',
    unit: 'memories',
    metric: 'memories',
    tiers: [
      { name: 'First Frame', at: 1 },
      { name: 'Album', at: 25 },
      { name: 'Collection', at: 100 },
      { name: 'Archive', at: 250 },
      { name: 'Vault', at: 500 },
    ],
  },
  {
    id: 'goalcrusher',
    title: 'Goal Crusher',
    icon: 'flag',
    blurb: 'Savings goals you have fully reached. Finish what you start.',
    unit: 'goals',
    metric: 'goalsHit',
    tiers: [
      { name: 'Finisher', at: 1 },
      { name: 'On a Roll', at: 3 },
      { name: 'Closer', at: 5 },
      { name: 'Machine', at: 10 },
      { name: 'Legend', at: 25 },
    ],
  },
  {
    id: 'endurance',
    title: 'Endurance',
    icon: 'stopwatch',
    blurb: 'Total time on the move across all your GPS activities.',
    unit: 'hours',
    metric: 'totalHours',
    tiers: [
      { name: 'Warmup', at: 1 },
      { name: 'Grinder', at: 10 },
      { name: 'Machine', at: 50 },
      { name: 'Ironclad', at: 100 },
      { name: 'Relentless', at: 500 },
    ],
  },
  {
    // EASY medal — starts Bronze and tops out at Gold.
    id: 'explorer',
    title: 'Explorer',
    icon: 'location',
    blurb: 'Places you have logged a memory from. Get out and see the world.',
    unit: 'places',
    metric: 'places',
    startTier: 0,
    tiers: [
      { name: 'Wanderer', at: 1 },
      { name: 'Tourist', at: 5 },
      { name: 'Globetrotter', at: 15 },
    ],
  },
  {
    // HARD medal — every tier is Gold or above, because getting people who
    // aren't on the app to actually join is a real feat.
    id: 'ambassador',
    title: 'Ambassador',
    icon: 'megaphone',
    blurb: 'Invite friends who are not on the app yet — you earn this when they join.',
    unit: 'joined',
    metric: 'invitesAccepted',
    startTier: 2, // Gold from the very first tier
    tiers: [
      { name: 'Ambassador', at: 10 },
      { name: 'Connector', at: 25 },
      { name: 'Kingmaker', at: 50 },
    ],
  },
];

export type MedalState = {
  def: MedalDef;
  value: number;
  /** -1 = locked, 0..4 = tier index */
  tierIndex: number;
  unlocked: boolean;
  /** the flavour name of the current tier, or null if locked */
  tierName: string | null;
  /** next tier's threshold + name, or null if maxed */
  next: { name: string; at: number } | null;
  /** 0..1 progress from the current tier's floor toward the next */
  progress: number;
};

export type PrestigeState = {
  rings: 0 | 1 | 2 | 3;
  next: { ring: 1 | 2 | 3; at: number } | null;
  progress: number;
};

/** Long-term progression after Diamond without reducing existing awards. */
export function prestigeState(def: MedalDef, value: number): PrestigeState {
  const top = def.tiers[def.tiers.length - 1]?.at ?? 0;
  const targets = [top * 2, top * 5, top * 10] as const;
  let rings: 0 | 1 | 2 | 3 = 0;
  targets.forEach((target, index) => {
    if (value >= target) rings = (index + 1) as 1 | 2 | 3;
  });
  const nextTarget = targets[rings];
  if (!nextTarget) return { rings, next: null, progress: 1 };
  const floor = rings === 0 ? top : targets[rings - 1];
  return {
    rings,
    next: { ring: (rings + 1) as 1 | 2 | 3, at: nextTarget },
    progress: clamp((value - floor) / (nextTarget - floor)),
  };
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function medalState(def: MedalDef, value: number): MedalState {
  let tierIndex = -1;
  def.tiers.forEach((t, i) => {
    if (value >= t.at) tierIndex = i;
  });
  const next = def.tiers[tierIndex + 1] ?? null;
  const floor = tierIndex >= 0 ? def.tiers[tierIndex].at : 0;
  const progress = next ? clamp((value - floor) / (next.at - floor)) : 1;
  return {
    def,
    value,
    tierIndex,
    unlocked: tierIndex >= 0,
    tierName: tierIndex >= 0 ? def.tiers[tierIndex].name : null,
    next,
    progress,
  };
}

/**
 * Flex Points awarded for a medal, by the METAL it has reached. Deliberately
 * steep — a Diamond is worth 20× a Bronze — so the late ranks demand real DEPTH
 * (pushing medals to Platinum/Diamond), not just a pile of shallow bronzes.
 * Bronze · Silver · Gold · Platinum · Diamond.
 */
export const METAL_POINTS = [15, 40, 90, 175, 300];

/** Total Flex Points across a member's unlocked medals. */
export function flexPoints(states: MedalState[]): number {
  return states.reduce(
    (sum, s) => sum + (s.unlocked ? METAL_POINTS[medalMetal(s.def, s.tierIndex)] : 0),
    0,
  );
}

// A steep, back-loaded curve: the ceiling is ~4,185 Flex Points (every medal at
// Diamond + all missions). Early ranks come at a fair pace; the late badges
// (Master → Mythical) are a serious grind — each jump is 600+ points, i.e. you
// must be taking several medals to their top metals. Mythical ≈ 90% of the max.
export const RANKS = [
  { name: 'Rookie', at: 0 },
  { name: 'Regular', at: 150 },
  { name: 'Committed', at: 380 },
  { name: 'Dedicated', at: 700 },
  { name: 'Proven', at: 1120 },
  { name: 'Elite', at: 1650 },
  { name: 'Master', at: 2250 },
  { name: 'Apex', at: 2850 },
  { name: 'Legend', at: 3350 },
  { name: 'Mythical', at: 3750 },
];

export function rankFor(points: number): { name: string; next: { name: string; at: number } | null; progress: number } {
  let i = 0;
  RANKS.forEach((r, idx) => {
    if (points >= r.at) i = idx;
  });
  const next = RANKS[i + 1] ?? null;
  const floor = RANKS[i].at;
  const progress = next ? clamp((points - floor) / (next.at - floor)) : 1;
  return { name: RANKS[i].name, next, progress };
}
