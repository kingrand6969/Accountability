import type { BoardRank, BuddyCard, BuddyStats, CardMetrics } from './card';
import { MAX_FEATURED_MEDALS, normalizeFeaturedMedalIds } from './featuredMedals';
import { BUDDY_CARD_PALETTE_KEYS, type BuddyCardPaletteKey } from './palette';
import { presentationTraits, storageTraits } from './presentation';

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

export type BuddyCardRankingConsentKey = 'show_country_rank' | 'show_city_rank';

/** Legacy cards may not contain ranking consent fields. Treat absence and all
 * non-true values as an explicit opt-out before building the editor baseline. */
export function normalizeBuddyCardEditorDraft(card: BuddyCard): BuddyCard {
  return {
    ...card,
    traits: presentationTraits(card.traits),
    show_country_rank: card.show_country_rank === true,
    show_city_rank: card.show_city_rank === true,
  };
}

export function setBuddyCardRankingConsent(
  card: BuddyCard,
  key: BuddyCardRankingConsentKey,
  value: boolean,
): BuddyCard {
  return { ...card, [key]: value };
}

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
  const normalizedCard = normalizeBuddyCardEditorDraft(card);
  return {
    ...pickBuddyCardEditorChanges(normalizedCard),
    traits: storageTraits(normalizedCard.traits),
    palette_key: validPaletteKey(normalizedCard.palette_key),
    featured_medal_ids: normalizeFeaturedMedalIds(normalizedCard.featured_medal_ids, earnedIds),
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

export type BuddyCardEditorLoadToken = Readonly<{ generation: number }>;
type BuddyCardEditorAuthTransition =
  | { action: 'ignore' }
  | { action: 'error'; token: BuddyCardEditorLoadToken }
  | { action: 'reload'; token: BuddyCardEditorLoadToken };

/** Coordinates auth resolution, auth events, retries, and StrictMode effect
 * replays. An auth event always invalidates an unbound load, so its late
 * getUser result can neither bind stale ownership nor strand the loading UI. */
export function createBuddyCardEditorLoadLifecycle() {
  let mounted = false;
  let generation = 0;
  let ownerId: string | null = null;

  const token = (): BuddyCardEditorLoadToken => Object.freeze({ generation });
  const isCurrent = (candidate: BuddyCardEditorLoadToken) => (
    mounted && candidate.generation === generation
  );

  return {
    mount() {
      mounted = true;
    },
    begin() {
      ownerId = null;
      generation += 1;
      return token();
    },
    currentToken() {
      return token();
    },
    expectedOwner() {
      return ownerId;
    },
    isCurrent,
    bindOwner(candidate: BuddyCardEditorLoadToken, candidateOwnerId: string) {
      if (!isCurrent(candidate)) return false;
      ownerId = candidateOwnerId;
      return true;
    },
    complete(candidate: BuddyCardEditorLoadToken, actualOwnerId: string | null) {
      if (!isCurrent(candidate)) return 'stale' as const;
      if (!ownerId || ownerId !== actualOwnerId) {
        ownerId = null;
        generation += 1;
        return 'account-changed' as const;
      }
      return 'current' as const;
    },
    authEvent(eventOwnerId: string | null): BuddyCardEditorAuthTransition {
      if (!mounted) return { action: 'ignore' };
      if (ownerId && eventOwnerId === ownerId) return { action: 'ignore' };
      ownerId = null;
      generation += 1;
      const nextToken = token();
      return eventOwnerId
        ? { action: 'reload', token: nextToken }
        : { action: 'error', token: nextToken };
    },
    unmount() {
      mounted = false;
      ownerId = null;
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

type BuddyCardEditorProfile = {
  display_name?: string | null;
  avatar_url?: string | null;
  area?: string | null;
  created_at?: string | null;
  last_active_at?: string | null;
};

type BuddyCardEditorRank = {
  name: string;
  earned: number;
  medalList: { id: string; tier: number }[];
};

type BuddyCardEditorDataDependencies = {
  card: (ownerId: string) => Promise<BuddyCard>;
  profile: () => Promise<BuddyCardEditorProfile | null>;
  rank: (ownerId: string) => Promise<BuddyCardEditorRank>;
  metrics: (ownerId: string) => Promise<CardMetrics>;
  stats: (ownerId: string) => Promise<BuddyStats>;
  boardRank: (ownerId: string) => Promise<BoardRank>;
};

/** Load the editor's account-bound source data as one snapshot. The card,
 * profile, rank, and earned medals are required; supplementary preview metrics
 * are independently optional so a transient leaderboard/stat failure cannot
 * prevent the owner from editing their card. */
export async function loadBuddyCardEditorData(
  ownerId: string,
  dependencies: BuddyCardEditorDataDependencies,
) {
  const [card, profile, rank, metrics, stats, boardRank] = await Promise.all([
    dependencies.card(ownerId),
    dependencies.profile(),
    dependencies.rank(ownerId),
    dependencies.metrics(ownerId).catch(() => null),
    dependencies.stats(ownerId).catch(() => null),
    dependencies.boardRank(ownerId).catch(() => null),
  ]);

  return { card, profile, rank, metrics, stats, boardRank };
}
