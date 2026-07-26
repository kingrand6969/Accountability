import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { uploadToR2 } from '../lib/r2';

/** Uploads a base64 image for a feed post. Prefers zero-egress Cloudflare R2;
 *  falls back to Supabase Storage if R2 is unavailable, so posting never breaks. */
export async function uploadPostImage(
  base64: string,
  ext: string,
  operationId?: string,
): Promise<string> {
  if (operationId) {
    return uploadToSupabase(base64, ext, operationId);
  }
  try {
    return await uploadToR2(base64, 'post', ext);
  } catch (e) {
    console.warn('[uploadPostImage] R2 unavailable, using Supabase Storage:', e);
    return uploadToSupabase(base64, ext);
  }
}

export function postImagePath(userId: string, operationId: string, ext: string): string {
  const safeExt = ext === 'png' ? 'png' : 'jpg';
  return `${userId}/post/${operationId}.${safeExt}`;
}

export function isExistingPostImageError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { statusCode?: unknown; status?: unknown; message?: unknown };
  return (
    candidate.statusCode === '409' ||
    candidate.statusCode === 409 ||
    candidate.status === 409 ||
    (typeof candidate.message === 'string' &&
      /(?:already exists|resource exists|duplicate)/i.test(candidate.message))
  );
}

async function uploadToSupabase(
  base64: string,
  ext: string,
  operationId?: string,
): Promise<string> {
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const uid = data.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const safeExt = ext === 'png' ? 'png' : 'jpg';
  const path = operationId
    ? postImagePath(uid, operationId, safeExt)
    : `${uid}/${Date.now()}.${safeExt}`;
  const contentType = safeExt === 'png' ? 'image/png' : 'image/jpeg';

  const { error } = await supabase.storage
    .from('post-images')
    // unique path per upload → let the CDN cache it for a year (cuts egress)
    .upload(path, decode(base64), { contentType, cacheControl: '31536000' });
  if (error && !(operationId && isExistingPostImageError(error))) throw error;

  return supabase.storage.from('post-images').getPublicUrl(path).data.publicUrl;
}
