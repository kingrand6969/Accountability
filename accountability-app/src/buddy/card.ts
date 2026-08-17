import { supabase } from '../lib/supabase';
import type { BuddyCardPaletteKey } from './palette';
import { pickBuddyCardEditorChanges } from './editorModel';

/** Default card background — brand blue. Users can replace it with a photo. */
export const CARD_BLUE: [string, string] = ['#60a5fa', '#1d4ed8'];

export type BuddyCard = {
  bg_url?: string | null; // custom background photo (else the blue gradient)
  palette_key?: BuddyCardPaletteKey;
  featured_medal_ids?: string[];
  /** Explicit owner opt-in for a photo-led public card. The media reference is
   * stored in the card JSON only after the owner enables this in the editor. */
  show_hero?: boolean;
  hero_url?: string | null;
  show_headline?: boolean;
  show_traits?: boolean;
  mode?: 'profile' | 'custom';
  headline?: string;
  about?: string;
  /** Public, owner-selected signals that help a potential buddy judge fit. */
  traits?: string[];
  // what the owner chooses to display on their card
  show_rank?: boolean;
  show_medals?: boolean;
  show_area?: boolean;
  show_bio?: boolean;
  show_last_active?: boolean;
  show_consistency?: boolean;
  show_points?: boolean;
  show_distance?: boolean;
  show_challenge_wins?: boolean;
  rank_name?: string; // snapshotted at save time (rank only climbs)
  medals?: number; // medals earned (count), snapshotted alongside the rank
  medals_list?: { id: string; tier: number }[]; // which medals + tier, for display
  show_city_rank?: boolean;
  show_country_rank?: boolean;
  show_posts?: boolean; // posts section on the card
};

export type BuddyStats = { buddies: number; km: number; stars: number; cheers: number };

export type BuddyCardSocialProof = {
  mutualBuddiesCount: number;
  groupsCount: number | null;
};

/** Aggregate-only social proof. PostgreSQL binds the expected viewer to auth.uid(). */
export async function getBuddyCardSocialProof(
  expectedViewerId: string,
  targetId: string,
): Promise<BuddyCardSocialProof | null> {
  const { data, error } = await supabase.rpc('buddy_card_social_proof', {
    p_expected_viewer: expectedViewerId,
    p_target: targetId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    mutualBuddiesCount: Number(row.mutual_buddies_count ?? 0),
    groupsCount: row.groups_count == null ? null : Number(row.groups_count),
  };
}

/** A member's public performance line — the five Compete metrics, all-time,
 *  plus where they place among their own buddies by consistency. */
export type CardMetrics = {
  consistency: number | null;
  points: number | null;
  avgkm: number | null;
  distance: number | null;
  chwin: number | null;
  buddiesRank: number | null;
  buddiesTotal: number | null;
};

export async function getCardMetrics(id: string): Promise<CardMetrics> {
  const { data, error } = await supabase.rpc('member_card_stats', { p_target: id });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    consistency: row?.consistency == null ? null : Number(row.consistency),
    points: row?.points == null ? null : Number(row.points),
    avgkm: row?.avgkm == null ? null : Number(row.avgkm),
    distance: row?.distance == null ? null : Number(row.distance),
    chwin: row?.chwin == null ? null : Number(row.chwin),
    buddiesRank: row?.buddies_rank != null ? Number(row.buddies_rank) : null,
    buddiesTotal: row?.buddies_total == null ? null : Number(row.buddies_total),
  };
}

export type BoardRank = {
  city: string | null;
  country: string | null;
  cityRank: number | null;
  countryRank: number | null;
};

/** The member's live standing on their own city/country boards (this week's
 *  consistency). All-null unless they share their location. */
export async function getBoardRank(id: string): Promise<BoardRank> {
  const { data, error } = await supabase.rpc('member_board_rank', { p_user: id });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    city: row?.city ?? null,
    country: row?.country ?? null,
    cityRank: row?.city_rank != null ? Number(row.city_rank) : null,
    countryRank: row?.country_rank != null ? Number(row.country_rank) : null,
  };
}

export async function getBuddyStats(id: string): Promise<BuddyStats> {
  const { data, error } = await supabase.rpc('buddy_public_stats', { p_target: id });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    buddies: Number(row?.buddies ?? 0),
    km: Number(row?.km ?? 0),
    stars: Number(row?.stars ?? 0),
    cheers: Number(row?.cheers ?? 0),
  };
}

export async function haveIStarred(id: string): Promise<boolean> {
  const uid = await me();
  if (!uid) return false;
  const { data } = await supabase
    .from('buddy_stars')
    .select('target')
    .eq('target', id)
    .eq('starrer', uid)
    .maybeSingle();
  return !!data;
}

export async function setStar(id: string, on: boolean): Promise<void> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  if (on) {
    const { error } = await supabase
      .from('buddy_stars')
      .insert({ target: id, starrer: uid });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from('buddy_stars')
      .delete()
      .eq('target', id)
      .eq('starrer', uid);
    if (error) throw error;
  }
}

export type BuddyCardView = {
  id: string;
  name: string | null;
  avatar: string | null;
  area: string | null;
  bio: string | null;
  created_at: string;
  last_active_at: string | null;
  card: BuddyCard;
};

async function me(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function getBuddyCard(id: string): Promise<BuddyCardView | null> {
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id,display_name,avatar_url,area,bio,created_at,last_active_at,buddy_card')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    name: data.display_name ?? null,
    avatar: data.avatar_url ?? null,
    area: data.area ?? null,
    bio: data.bio ?? null,
    created_at: data.created_at,
    last_active_at: data.last_active_at ?? null,
    card: (data.buddy_card ?? {}) as BuddyCard,
  };
}

/**
 * Loads the fuller profile shape through PostgreSQL's accepted-buddy boundary.
 * PostgreSQL authorizes this RPC against the active auth identity. The screen
 * separately binds the response to its immutable viewer/target load token so
 * account or route replacement cannot commit a stale response. Non-buddy
 * callers receive no row from the function.
 */
export async function getAuthorizedBuddyCard(id: string): Promise<BuddyCardView | null> {
  const { data, error } = await supabase.rpc('buddy_full_profile', { p_target: id });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    id: row.id,
    name: row.display_name ?? null,
    avatar: row.avatar_url ?? null,
    area: row.area ?? null,
    bio: row.bio ?? null,
    created_at: row.created_at,
    last_active_at: row.last_active_at ?? null,
    card: (row.buddy_card ?? {}) as BuddyCard,
  };
}

/**
 * Owner-only fallback for the profile photo. The caller supplies the immutable
 * owner ID from its existing authenticated load; profiles RLS is the final
 * authorization boundary, so this does not need another client auth read.
 */
export async function getOwnBuddyCardAvatar(expectedOwnerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', expectedOwnerId)
    .maybeSingle();
  if (error) throw error;
  return data?.avatar_url ?? null;
}

/** One public-profile request for a Discover page; no per-card fan-out. */
export async function getBuddyCards(ids: string[]): Promise<Map<string, BuddyCardView>> {
  const result = new Map<string, BuddyCardView>();
  if (ids.length === 0) return result;
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id,display_name,avatar_url,area,bio,created_at,last_active_at,buddy_card')
    .in('id', ids);
  if (error) throw error;
  for (const row of data ?? []) {
    result.set(row.id, {
      id: row.id,
      name: row.display_name ?? null,
      avatar: row.avatar_url ?? null,
      area: row.area ?? null,
      bio: row.bio ?? null,
      created_at: row.created_at,
      last_active_at: row.last_active_at ?? null,
      card: (row.buddy_card ?? {}) as BuddyCard,
    });
  }
  return result;
}

export async function getMyBuddyCard(expectedOwnerId?: string): Promise<BuddyCard> {
  const uid = await me();
  if (!uid) return {};
  if (expectedOwnerId && uid !== expectedOwnerId) {
    throw new Error('Account changed. Review your Buddy Card and try again.');
  }
  const ownerId = expectedOwnerId ?? uid;
  const { data } = await supabase
    .from('profiles')
    .select('buddy_card')
    .eq('id', ownerId)
    .maybeSingle();
  return ((data?.buddy_card ?? {}) as BuddyCard) || {};
}

const ACCOUNT_CHANGED = 'Account changed. Review your Buddy Card and try again.';

async function assertExpectedOwner(expectedOwnerId: string): Promise<void> {
  const uid = await me();
  if (!uid || uid !== expectedOwnerId) throw new Error(ACCOUNT_CHANGED);
}

/** Save only owner-editable Buddy Card fields through the atomic server patch.
 * Rank snapshots, legacy data, privacy fields, and concurrent changes retain
 * their unrelated JSON keys. */
export async function saveMyBuddyCard(card: BuddyCard, expectedOwnerId: string): Promise<void> {
  await assertExpectedOwner(expectedOwnerId);
  const patch = pickBuddyCardEditorChanges(card);
  const { data: updated, error } = await supabase.rpc('patch_my_buddy_card', {
    p_expected_owner: expectedOwnerId,
    p_patch: patch,
    p_patch_kind: 'editor',
  });
  if (error) throw new Error(error.message ?? 'Buddy Card could not be saved.');
  if (!updated || typeof updated !== 'object' || Array.isArray(updated)) {
    throw new Error('Buddy Card could not be saved for this account.');
  }

  // The RPC binds the update to auth.uid() and expectedOwnerId. A final auth
  // check prevents the newly active account from seeing stale success UI.
  await assertExpectedOwner(expectedOwnerId);
}

export type CardPost = {
  id: string;
  body: string;
  image_url: string | null;
  post_type: string;
  created_at: string;
};

/**
 * Posts shown on a member's card. Buddies see their recent feed posts;
 * non-buddies see ONLY the posts the owner marked "Show on Buddy Card".
 */
export async function listCardPosts(userId: string, isBuddy: boolean): Promise<CardPost[]> {
  let q = supabase
    .from('posts')
    .select('id,body,image_url,post_type,created_at')
    .eq('user_id', userId)
    .is('group_id', null)
    .is('page_id', null)
    .order('created_at', { ascending: false })
    .limit(6);
  if (!isBuddy) q = q.eq('show_on_card', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CardPost[];
}

/** Selects profile text within the caller's already-established access boundary. */
export function cardText(
  view: BuddyCardView,
  fullAccess = false,
): { headline: string | null; about: string | null } {
  if (fullAccess) {
    return {
      headline: view.card.headline?.trim() || null,
      about: view.bio?.trim() || view.card.about?.trim() || null,
    };
  }

  return {
    headline: view.card.show_headline ? view.card.headline?.trim() || null : null,
    about: view.card.show_bio ? view.card.about?.trim() || null : null,
  };
}
