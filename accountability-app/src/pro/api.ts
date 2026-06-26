import { supabase } from '../lib/supabase';

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function fetchProStatus(): Promise<boolean> {
  const uid = await currentUserId();
  if (!uid) return false;
  const { data, error } = await supabase
    .from('profiles')
    .select('is_pro')
    .eq('id', uid)
    .maybeSingle();
  if (error) throw error;
  return !!data?.is_pro;
}

/**
 * DEV ONLY — simulate a subscription change so we can test Pro gating before
 * real billing exists. In production, is_pro is set by the RevenueCat webhook
 * (service role), never by the client. See migration 0006 notes.
 */
export async function setProDev(isPro: boolean): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('profiles')
    .update({ is_pro: isPro, pro_until: null })
    .eq('id', uid);
  if (error) throw error;
}
