import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';
import type { Metrics } from './catalog';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Missions are action quests on top of the medals. Two kinds:
 *  - `metric`  — progress read straight from data we already store (getMetrics)
 *  - `action`  — progress stored per-user in mission_progress (flex, run selfie)
 * Completing a mission awards Flex Points, so missions push your rank too.
 */
export type MissionDef = {
  id: string;
  title: string;
  desc: string;
  icon: IoniconName;
  goal: number;
  /** Flex Points for finishing (split evenly across milestones, if any). */
  points: number;
  source: 'metric' | 'action';
  metric?: keyof Metrics;
  unit: string;
  /** for milestone missions (e.g. selfies at 2/5/10/25 km) — value is the best km */
  milestones?: number[];
  /** call to action shown on the row: 'flex' opens the flex flow, 'run' hints */
  cta?: 'flex' | 'run';
};

// Missions are deliberately *distinct from medals*: medals track your fitness
// grind (streak, distance, workouts, challenges, buddies), missions reward the
// social & sharing actions medals don't measure — so the two never show the
// same metric with competing numbers.
export const MISSIONS: MissionDef[] = [
  {
    id: 'flex-rank', // kept: mission_bump('flex-rank') writes this row
    title: 'Show Off',
    desc: 'Flex your rank to your buddies 5 times',
    icon: 'sparkles',
    goal: 5,
    points: 40,
    source: 'action',
    unit: 'flexes',
    cta: 'flex',
  },
  {
    id: 'selfie-club', // kept: recordRunSelfie writes this row
    title: 'Selfie Club',
    desc: 'Share a run selfie at 2, 5, 10 & 25 km',
    icon: 'camera',
    goal: 25,
    points: 40,
    source: 'action',
    unit: 'km',
    milestones: [2, 5, 10, 25],
    cta: 'run',
  },
  {
    id: 'storyteller',
    title: 'Storyteller',
    desc: 'Share 3 wins to your feed',
    icon: 'megaphone',
    goal: 3,
    points: 30,
    source: 'metric',
    metric: 'postsShared',
    unit: 'posts',
  },
  {
    id: 'cheerleader',
    title: 'Encourager',
    desc: 'Encourage 10 posts from your feed',
    icon: 'heart',
    goal: 10,
    points: 30,
    source: 'metric',
    metric: 'likesGiven',
    unit: 'encouragements',
  },
  {
    id: 'all-set',
    title: 'All Set',
    desc: 'Add a photo, name & bio to your profile',
    icon: 'person-circle',
    goal: 3,
    points: 20,
    source: 'metric',
    metric: 'profileFields',
    unit: 'fields',
  },
  {
    id: 'find-tribe',
    title: 'Find Your Tribe',
    desc: 'Join your first group',
    icon: 'people-circle',
    goal: 1,
    points: 20,
    source: 'metric',
    metric: 'groupsJoined',
    unit: 'group',
  },
  {
    id: 'good-company',
    title: 'Good Company',
    desc: 'Send your first message to a buddy',
    icon: 'chatbubble-ellipses',
    goal: 1,
    points: 15,
    source: 'metric',
    metric: 'buddyMessages',
    unit: 'message',
  },
];

export type MissionState = {
  def: MissionDef;
  value: number;
  /** 0..1 toward the goal (or across milestones) */
  progress: number;
  completed: boolean;
  /** Flex Points earned so far on this mission */
  points: number;
  /** how many milestones are reached (milestone missions only) */
  milestonesHit: number;
  /** short status line, e.g. "3 / 3 buddies" */
  label: string;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function missionState(def: MissionDef, value: number): MissionState {
  if (def.milestones && def.milestones.length) {
    const hit = def.milestones.filter((m) => value >= m).length;
    const total = def.milestones.length;
    const completed = hit >= total;
    return {
      def,
      value,
      progress: hit / total,
      completed,
      points: Math.round((def.points / total) * hit),
      milestonesHit: hit,
      label: completed ? 'All milestones ✓' : `${hit} of ${total} milestones`,
    };
  }
  const completed = value >= def.goal;
  const shown = Math.min(value, def.goal);
  return {
    def,
    value,
    progress: clamp01(value / def.goal),
    completed,
    points: completed ? def.points : 0,
    milestonesHit: 0,
    label: completed ? 'Done ✓' : `${fmt(shown)} / ${def.goal} ${def.unit}`,
  };
}

/** Flex Points earned across all missions. */
export function missionPoints(states: MissionState[]): number {
  return states.reduce((sum, s) => sum + s.points, 0);
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toString() : (Math.round(n * 10) / 10).toString();
}
