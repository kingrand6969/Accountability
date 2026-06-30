import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';

/** Uploads a base64 image to the user's folder in the public post-images bucket. */
export async function uploadPostImage(base64: string, ext: string): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const safeExt = ext === 'png' ? 'png' : 'jpg';
  const path = `${uid}/${Date.now()}.${safeExt}`;
  const contentType = safeExt === 'png' ? 'image/png' : 'image/jpeg';

  const { error } = await supabase.storage
    .from('post-images')
    .upload(path, decode(base64), { contentType });
  if (error) throw error;

  return supabase.storage.from('post-images').getPublicUrl(path).data.publicUrl;
}
