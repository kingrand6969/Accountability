import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** What we can measure about a member — every medal reads from one of these. */
export type Metrics = {
  streak: number;
  totalKm: number;
  workouts: number;
  challenges: number;
  buddies: number;
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
  /** exactly five tiers, ascending; the flavour name shows under the medal */
  tiers: { name: string; at: number }[];
};

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

/** Flex Points: tiers earned across all medals, weighted by tier. */
export function flexPoints(states: MedalState[]): number {
  return states.reduce((sum, s) => sum + (s.tierIndex + 1) * 20, 0);
}

export const RANKS = [
  { name: 'Rookie', at: 0 },
  { name: 'Regular', at: 60 },
  { name: 'Committed', at: 140 },
  { name: 'Elite', at: 260 },
  { name: 'Legend', at: 420 },
  { name: 'Mythical', at: 600 },
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
