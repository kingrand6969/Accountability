import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { uploadToR2, type R2Kind } from '../lib/r2';
import {
  classifyUploadFailure,
  estimateBase64Bytes,
  mayUseStorageFallback,
} from '../media/uploadPolicy';
import { recordUploadEvent } from '../media/uploadTelemetry';

/**
 * Uploads a base64 profile image and returns a cache-busted public URL.
 * Prefers zero-egress Cloudflare R2; fails closed if private R2 is unavailable, so profile media never becomes public.
 */
async function uploadProfileImage(
  base64: string,
  ext: string,
  name: 'avatar' | 'cover',
): Promise<string> {
  const bytes = estimateBase64Bytes(base64);
  try {
    const url = await uploadToR2(base64, name as R2Kind, ext);
    void recordUploadEvent({ provider: 'r2', kind: name, outcome: 'success', bytes });
    return url;
  } catch (e) {
    if (!mayUseStorageFallback(e)) {
      void recordUploadEvent({
        provider: 'r2',
        kind: name,
        outcome: 'rejected',
        bytes,
        failureClass: classifyUploadFailure(e),
      });
      throw e;
    }
    console.warn('[uploadProfileImage] R2 unavailable, using Supabase Storage:', e);
    const url = await uploadToSupabase(base64, ext, name);
    void recordUploadEvent({
      provider: 'supabase',
      kind: name,
      outcome: 'fallback',
      bytes,
      failureClass: classifyUploadFailure(e),
    });
    return url;
  }
}

async function uploadToSupabase(
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
    // Long cache is safe: the returned URL is ?t= cache-busted on every change,
    // so a new upload gets a fresh URL while old ones stay served from the CDN.
    .upload(path, decode(base64), { contentType, upsert: true, cacheControl: '31536000' });
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
