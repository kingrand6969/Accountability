import type { BuddyCard } from './card';
import { MAX_FEATURED_MEDALS, normalizeFeaturedMedalIds } from './featuredMedals';
import { BUDDY_CARD_PALETTE_KEYS, type BuddyCardPaletteKey } from './palette';

export const BUDDY_CARD_EDITOR_KEYS = Object.freeze([
  'palette_key',
  'featured_medal_ids',
  'mode',
  'headline',
  'about',
  'traits',
  'show_headline',
  'show_traits',
  'show_rank',
  'show_medals',
  'show_area',
  'show_bio',
  'show_last_active',
  'show_consistency',
  'show_points',
  'show_distance',
  'show_challenge_wins',
  'show_city_rank',
  'show_country_rank',
  'show_posts',
] as const satisfies readonly (keyof BuddyCard)[]);

type EditorKey = (typeof BUDDY_CARD_EDITOR_KEYS)[number];
export type BuddyCardEditorPatch = Partial<Pick<BuddyCard, EditorKey>> & {
  palette_key: BuddyCardPaletteKey;
  featured_medal_ids: string[];
  mode: 'custom';
};

function validPaletteKey(value: unknown): BuddyCardPaletteKey {
  return BUDDY_CARD_PALETTE_KEYS.includes(value as BuddyCardPaletteKey)
    ? (value as BuddyCardPaletteKey)
    : 'polar_blue';
}

export function pickBuddyCardEditorChanges(card: BuddyCard): Partial<BuddyCardEditorPatch> {
  const patch: Partial<BuddyCardEditorPatch> = {};
  for (const key of BUDDY_CARD_EDITOR_KEYS) {
    if (Object.prototype.hasOwnProperty.call(card, key)) {
      Object.assign(patch, { [key]: card[key] });
    }
  }
  return patch;
}

export function buildBuddyCardEditorPatch(
  card: BuddyCard,
  earnedIds: readonly string[],
): BuddyCardEditorPatch {
  return {
    ...pickBuddyCardEditorChanges(card),
    palette_key: validPaletteKey(card.palette_key),
    featured_medal_ids: normalizeFeaturedMedalIds(card.featured_medal_ids, earnedIds),
    mode: 'custom',
  };
}

export function toggleFeaturedMedal(
  current: readonly string[],
  id: string,
  earnedIds: readonly string[],
): { ids: string[]; limitReached: boolean } {
  const normalized = normalizeFeaturedMedalIds(current, earnedIds);
  if (normalized.includes(id)) {
    return { ids: normalized.filter((candidate) => candidate !== id), limitReached: false };
  }
  if (!earnedIds.includes(id)) return { ids: normalized, limitReached: false };
  if (normalized.length >= MAX_FEATURED_MEDALS) {
    return { ids: normalized, limitReached: true };
  }
  return { ids: [...normalized, id], limitReached: false };
}

export function moveFeaturedMedal(
  current: readonly string[],
  id: string,
  direction: -1 | 1,
  earnedIds: readonly string[],
): string[] {
  const normalized = normalizeFeaturedMedalIds(current, earnedIds);
  const from = normalized.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= normalized.length) return normalized;
  const reordered = [...normalized];
  [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
  return reordered;
}

export function buddyCardEditorFingerprint(card: BuddyCard): string {
  return JSON.stringify(
    BUDDY_CARD_EDITOR_KEYS.map((key) => [key, card[key] ?? null]),
  );
}

export function shouldPreventBuddyCardEditorExit(
  baselineFingerprint: string | null,
  currentFingerprint: string,
  saving: boolean,
): boolean {
  return baselineFingerprint !== null && currentFingerprint !== baselineFingerprint && !saving;
}

export function createEditorGenerationGuard() {
  let generation = 0;
  let mounted = true;
  return {
    begin() {
      generation += 1;
      return generation;
    },
    isCurrent(candidate: number) {
      return mounted && candidate === generation;
    },
    unmount() {
      mounted = false;
      generation += 1;
    },
  };
}

export function createSynchronousSubmitLock() {
  let locked = false;
  return {
    tryAcquire() {
      if (locked) return false;
      locked = true;
      return true;
    },
    release() {
      locked = false;
    },
  };
}
