import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';

/**
 * Uploads a base64 image to the user's own folder in the public `avatars`
 * bucket and returns a cache-busted public URL. Overwrites any previous avatar.
 */
export async function uploadAvatar(base64: string, ext: string): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const safeExt = ext === 'png' ? 'png' : 'jpg';
  const path = `${uid}/avatar.${safeExt}`;
  const contentType = safeExt === 'png' ? 'image/png' : 'image/jpeg';

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, decode(base64), { contentType, upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  // Bust the CDN/image cache so the new photo shows immediately.
  return `${data.publicUrl}?t=${Date.now()}`;
}
