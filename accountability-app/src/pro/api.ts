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
    .select('is_pro, pro_until')
    .eq('id', uid)
    .maybeSingle();
  if (error) throw error;
  // Pro is active when the flag is on AND any expiry (trial/comp) is still in the
  // future. pro_until null = perpetual (a real paid subscription).
  const active = !!data?.is_pro && (!data.pro_until || new Date(data.pro_until as string) > new Date());
  return active;
}

// Pro is granted server-side only: the RevenueCat webhook (service role) for paid
// subs, or an admin via admin_grant_pro (migration 0060) for comps/trials. The
// client can read is_pro/pro_until but can't write them — migration 0015 revokes
// UPDATE on those columns from the client role.
