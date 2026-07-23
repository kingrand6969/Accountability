import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { uploadToR2 } from '../lib/r2';

/** Uploads a base64 image for a feed post. Prefers zero-egress Cloudflare R2;
 *  falls back to Supabase Storage if R2 is unavailable, so posting never breaks. */
export async function uploadPostImage(base64: string, ext: string): Promise<string> {
  try {
    return await uploadToR2(base64, 'post', ext);
  } catch (e) {
    console.warn('[uploadPostImage] R2 unavailable, using Supabase Storage:', e);
    return uploadToSupabase(base64, ext);
  }
}

async function uploadToSupabase(base64: string, ext: string): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const safeExt = ext === 'png' ? 'png' : 'jpg';
  const path = `${uid}/${Date.now()}.${safeExt}`;
  const contentType = safeExt === 'png' ? 'image/png' : 'image/jpeg';

  const { error } = await supabase.storage
    .from('post-images')
    // unique path per upload → let the CDN cache it for a year (cuts egress)
    .upload(path, decode(base64), { contentType, cacheControl: '31536000' });
  if (error) throw error;

  return supabase.storage.from('post-images').getPublicUrl(path).data.publicUrl;
}
