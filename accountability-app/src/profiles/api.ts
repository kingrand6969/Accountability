import { supabase } from '../lib/supabase';
import type { Profile, ProfileUpdate } from './types';

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// Exactly the columns the Profile type exposes — profiles also carries heavy
// unrelated fields (the buddy_card JSON blob, calorie/locale settings) that no
// getMyProfile caller reads, so selecting * shipped them on every screen load.
const PROFILE_COLS: string =
  'id,display_name,avatar_url,cover_url,bio,birthday,birthday_private,relationship_status,' +
  'gender,gender_private,sexual_orientation,sexual_orientation_private,area,' +
  'show_last_active,last_active_at,created_at';

export async function getMyProfile(): Promise<Profile | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLS)
    .eq('id', uid)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as unknown as Profile;

  // No row yet (e.g. account created before the auto-create trigger existed,
  // or a trigger hiccup). Create one so the app never gets stuck.
  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert({ id: uid })
    .select(PROFILE_COLS)
    .single();
  if (insertError) throw insertError;
  return created as unknown as Profile;
}

export async function updateMyProfile(update: ProfileUpdate): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase.from('profiles').update(update).eq('id', uid);
  if (error) throw error;
}

/**
 * Permanently delete the signed-in account. Wipes everything about the member
 * (profile, posts, activity, money, buddies, groups, achievements-source data);
 * only the other side of any chat survives, where they'll appear as "Deleted
 * Account". Irreversible. Caller should sign out immediately after.
 */
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut();
}

export async function touchLastActive(): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  await supabase
    .from('profiles')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', uid);
}
