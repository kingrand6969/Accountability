import { supabase } from '../lib/supabase';

// Other users' profiles are read through the privacy-respecting public_profiles
// view (the base table only exposes your own row).
export type PublicProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  area: string | null;
  buddy_opt_in: boolean;
  last_active_at: string | null;
};

const COLS = 'id,display_name,avatar_url,area,buddy_opt_in,last_active_at';

export async function getPublicProfiles(
  ids: string[],
): Promise<Map<string, PublicProfile>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase
    .from('public_profiles')
    .select(COLS)
    .in('id', unique);
  if (error) throw error;
  return new Map((data ?? []).map((p: any) => [p.id, p as PublicProfile]));
}

export async function getPublicProfile(id: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .from('public_profiles')
    .select(COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as PublicProfile | null;
}
