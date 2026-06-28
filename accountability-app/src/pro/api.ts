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

// Pro is granted server-side only (RevenueCat webhook via the service role).
// The client can read is_pro (fetchProStatus) but can no longer write it —
// migration 0015 revokes UPDATE on is_pro/pro_until from the client role.
