import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';

/**
 * Uploads a base64 image to the user's own folder in the public `avatars`
 * bucket and returns a cache-busted public URL. Overwrites any previous avatar.
 */
async function uploadProfileImage(
  base64: string,
  ext: string,
  name: 'avatar' | 'cover',
): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const safeExt = ext === 'png' ? 'png' : 'jpg';
  const path = `${uid}/${name}.${safeExt}`;
  const contentType = safeExt === 'png' ? 'image/png' : 'image/jpeg';

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, decode(base64), { contentType, upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  // Bust the CDN/image cache so the new photo shows immediately.
  return `${data.publicUrl}?t=${Date.now()}`;
}

export function uploadAvatar(base64: string, ext: string): Promise<string> {
  return uploadProfileImage(base64, ext, 'avatar');
}

/** Facebook-style cover photo (wide banner behind the avatar). */
export function uploadCover(base64: string, ext: string): Promise<string> {
  return uploadProfileImage(base64, ext, 'cover');
}
