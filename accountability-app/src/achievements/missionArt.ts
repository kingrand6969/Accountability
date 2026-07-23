// Registry for the mission & challenge icons (Batch 8A PNG pack). These are a
// SEPARATE system from the medal art (medalArt.ts): missions/challenges are the
// social/action quests, medals are the fitness grind. The artwork is used
// EXACTLY as delivered — never redrawn or recoloured; MissionIcon layers subtle
// premium motion over it. Assets live in assets/images/missions/*.webp.

import type { ImageSourcePropType } from 'react-native';
import type { Metric } from '../compete/api';

/** Mission id (matches MissionDef.id) → its icon artwork. */
export const MISSION_ART: Record<string, ImageSourcePropType> = {
  'flex-rank': require('../../assets/images/missions/mission-flex-rank.webp'),
  'selfie-club': require('../../assets/images/missions/mission-selfie-club.webp'),
  storyteller: require('../../assets/images/missions/mission-storyteller.webp'),
  cheerleader: require('../../assets/images/missions/mission-cheerleader.webp'),
  'all-set': require('../../assets/images/missions/mission-all-set.webp'),
  'find-tribe': require('../../assets/images/missions/mission-find-tribe.webp'),
  'good-company': require('../../assets/images/missions/mission-good-company.webp'),
};

/** Challenge metric → its icon artwork (only the three with dedicated art). */
export const CHALLENGE_ART: Partial<Record<Metric, ImageSourcePropType>> = {
  consistency: require('../../assets/images/missions/challenge-consistency.webp'),
  distance: require('../../assets/images/missions/challenge-distance.webp'),
  points: require('../../assets/images/missions/challenge-points.webp'),
};

/** Artwork for a mission id, or null (falls back to the Ionicon). */
export function missionArtFor(id: string): ImageSourcePropType | null {
  return MISSION_ART[id] ?? null;
}

/** Artwork for a challenge metric, or null (avgkm/chwin fall back to Ionicon). */
export function challengeArtFor(metric: Metric): ImageSourcePropType | null {
  return CHALLENGE_ART[metric] ?? null;
}
