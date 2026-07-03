import { supabase } from '../lib/supabase';

/** Default card background — brand blue. Users can replace it with a photo. */
export const CARD_BLUE: [string, string] = ['#60a5fa', '#1d4ed8'];

export type BuddyCard = {
  bg_url?: string | null; // custom background photo (else the blue gradient)
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
