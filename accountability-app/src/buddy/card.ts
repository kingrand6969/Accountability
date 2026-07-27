import { supabase } from '../lib/supabase';

/** Default card background — brand blue. Users can replace it with a photo. */
export const CARD_BLUE: [string, string] = ['#60a5fa', '#1d4ed8'];

export type BuddyCard = {
  bg_url?: string | null; // custom background photo (else the blue gradient)
  mode?: 'profile' | 'custom';
  headline?: string;
  about?: string;
  /** Public, owner-selected signals that help a potential buddy judge fit. */
  traits?: string[];
  // what the owner chooses to display on their card
  show_rank?: boolean;
  rank_name?: string; // snapshotted at save time (rank only climbs)
  medals?: number; // medals earned (count), snapshotted alongside the rank
  medals_list?: { id: string; tier: number }[]; // which medals + tier, for display
  show_city_rank?: boolean;
  show_country_rank?: boolean;
  show_posts?: boolean; // posts section on the card
};

export type BuddyStats = { buddies: number; km: number; stars: number; cheers: number };

/** A member's public performance line — the five Compete metrics, all-time,
 *  plus where they place among their own buddies by consistency. */
export type CardMetrics = {
  consistency: number;
  points: number;
  avgkm: number;
  distance: number;
  chwin: number;
  buddiesRank: number | null;
  buddiesTotal: number;
};

export async function getCardMetrics(id: string): Promise<CardMetrics> {
  const { data, error } = await supabase.rpc('member_card_stats', { p_target: id });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    consistency: Number(row?.consistency ?? 0),
    points: Number(row?.points ?? 0),
    avgkm: Number(row?.avgkm ?? 0),
    distance: Number(row?.distance ?? 0),
    chwin: Number(row?.chwin ?? 0),
    buddiesRank: row?.buddies_rank != null ? Number(row.buddies_rank) : null,
    buddiesTotal: Number(row?.buddies_total ?? 0),
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

export async function getMyBuddyCard(): Promise<BuddyCard> {
  const uid = await me();
  if (!uid) return {};
  const { data } = await supabase
    .from('profiles')
    .select('buddy_card')
    .eq('id', uid)
    .maybeSingle();
  return ((data?.buddy_card ?? {}) as BuddyCard) || {};
}

export async function saveMyBuddyCard(card: BuddyCard): Promise<void> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('profiles')
    .update({ buddy_card: card })
    .eq('id', uid);
  if (error) throw error;
}

export type CardPost = {
  id: string;
  body: string;
  image_url: string | null;
  created_at: string;
};

/**
 * Posts shown on a member's card. Buddies see their recent feed posts;
 * non-buddies see ONLY the posts the owner marked "Show on Buddy Card".
 */
export async function listCardPosts(userId: string, isBuddy: boolean): Promise<CardPost[]> {
  let q = supabase
    .from('posts')
    .select('id,body,image_url,created_at')
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

/** The text a viewer should see — the owner's own words, falling back to their
 *  profile area/bio so the card is never blank. */
export function cardText(view: BuddyCardView): { headline: string | null; about: string | null } {
  return {
    headline: view.card.headline?.trim() || (view.area ? `Trains around ${view.area}` : null),
    about: view.card.about?.trim() || view.bio,
  };
}
