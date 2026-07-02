import { supabase } from '../lib/supabase';

/** Background themes a user can pick for their buddy card. */
export const CARD_BACKGROUNDS: { key: string; label: string; colors: [string, string] }[] = [
  { key: 'ocean', label: 'Ocean', colors: ['#3b82f6', '#1e40af'] },
  { key: 'violet', label: 'Violet', colors: ['#7c3aed', '#312e81'] },
  { key: 'sunset', label: 'Sunset', colors: ['#db2777', '#7c3aed'] },
  { key: 'ember', label: 'Ember', colors: ['#f59e0b', '#dc2626'] },
  { key: 'forest', label: 'Forest', colors: ['#16a34a', '#064e3b'] },
  { key: 'slate', label: 'Slate', colors: ['#475569', '#0f172a'] },
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
