import { supabase } from '../lib/supabase';
import type { Profile, ProfileUpdate } from './types';

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function getMyProfile(): Promise<Profile | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', uid)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as Profile;

  // No row yet (e.g. account created before the auto-create trigger existed,
  // or a trigger hiccup). Create one so the app never gets stuck.
  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert({ id: uid })
    .select('*')
    .single();
  if (insertError) throw insertError;
  return created as Profile;
}

export async function updateMyProfile(update: ProfileUpdate): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase.from('profiles').update(update).eq('id', uid);
  if (error) throw error;
}

export async function touchLastActive(): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  await supabase
    .from('profiles')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', uid);
}
