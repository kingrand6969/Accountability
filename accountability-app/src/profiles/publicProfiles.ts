import { supabase } from '../lib/supabase';
import { resolveMediaUrl, resolveMediaUrls } from '../media/privateMedia';

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
  const avatars = await resolveMediaUrls((data ?? []).flatMap((p: any) => p.avatar_url ? [p.avatar_url] : []));
  const profiles = (data ?? []).map((p: any) => ({
    ...p,
    avatar_url: p.avatar_url ? (avatars.get(p.avatar_url) ?? p.avatar_url) : null,
  } as PublicProfile));
  return new Map(profiles.map((p) => [p.id, p]));
}

export async function getPublicProfile(id: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .from('public_profiles')
    .select(COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, avatar_url: data.avatar_url ? await resolveMediaUrl(data.avatar_url) : null } as PublicProfile;
}
