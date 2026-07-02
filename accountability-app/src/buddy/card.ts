import { supabase } from '../lib/supabase';

/** Background themes a user can pick for their buddy card. */
export const CARD_BACKGROUNDS: { key: string; label: string; colors: [string, string] }[] = [
  // single-hue ramps — calm, no clashing families
  { key: 'ocean', label: 'Ocean', colors: ['#60a5fa', '#1d4ed8'] },
  { key: 'violet', label: 'Violet', colors: ['#a78bfa', '#5b21b6'] },
  { key: 'sunset', label: 'Sunset', colors: ['#fb923c', '#db2777'] },
  { key: 'ember', label: 'Ember', colors: ['#fbbf24', '#b91c1c'] },
  { key: 'forest', label: 'Forest', colors: ['#34d399', '#065f46'] },
  { key: 'slate', label: 'Slate', colors: ['#64748b', '#0f172a'] },
];

export function cardBackground(key?: string | null): [string, string] {
  return (CARD_BACKGROUNDS.find((b) => b.key === key) ?? CARD_BACKGROUNDS[0]).colors;
}

export type BuddyCard = {
  bg?: string;
  mode?: 'profile' | 'custom';
  headline?: string;
  about?: string;
};

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

/** The text a viewer should see, honoring the owner's chosen source. */
export function cardText(view: BuddyCardView): { headline: string | null; about: string | null } {
  if (view.card.mode === 'custom') {
    return {
      headline: view.card.headline?.trim() || null,
      about: view.card.about?.trim() || null,
    };
  }
  return { headline: view.area ? `Trains around ${view.area}` : null, about: view.bio };
}
