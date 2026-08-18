import { decode } from 'base64-arraybuffer';
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import { uploadToR2WithDigest, type R2UploadedMedia } from '../lib/r2';
import {
  classifyUploadFailure,
  estimateBase64Bytes,
  mayUseStorageFallback,
} from '../media/uploadPolicy';
import { recordUploadEvent } from '../media/uploadTelemetry';
export { mayUseStorageFallback } from '../media/uploadPolicy';

/** Uploads a base64 image for a feed post. Prefers zero-egress Cloudflare R2;
 *  falls back to Supabase Storage if R2 is unavailable, so posting never breaks. */
export async function uploadPostImage(
  base64: string,
  ext: string,
  operationId?: string,
  expectedOwnerId?: string,
): Promise<string> {
  return (await uploadPostImageResult(base64, ext, operationId, expectedOwnerId)).mediaRef;
}

export async function uploadPostImageWithDigest(
  base64: string,
  ext: string,
  operationId?: string,
  expectedOwnerId?: string,
): Promise<R2UploadedMedia> {
  return uploadPostImageResult(base64, ext, operationId, expectedOwnerId);
}

export async function uploadPostImageForOwner(
  base64: string,
  ext: string,
  operationId?: string,
  expectedOwnerId?: string,
): Promise<string> {
  return (await uploadPostImageResult(base64, ext, operationId, expectedOwnerId)).mediaRef;
}

async function uploadPostImageResult(
  base64: string,
  ext: string,
  operationId?: string,
  expectedOwnerId?: string,
): Promise<R2UploadedMedia> {
  const bytes = estimateBase64Bytes(base64);
  try {
    const uploaded = await uploadToR2WithDigest(base64, 'post', ext, { operationId, expectedOwnerId });
    void recordUploadEvent({ provider: 'r2', kind: 'post', outcome: 'success', bytes });
    return uploaded;
  } catch (e) {
    if (!mayUseStorageFallback(e)) {
      void recordUploadEvent({
        provider: 'r2',
        kind: 'post',
        outcome: 'rejected',
        bytes,
        failureClass: classifyUploadFailure(e),
      });
      throw e;
    }
    console.warn('[uploadPostImage] R2 unavailable, using Supabase Storage:', e);
    const uploaded = await uploadToSupabase(base64, ext, operationId, expectedOwnerId);
    void recordUploadEvent({
      provider: 'supabase',
      kind: 'post',
      outcome: 'fallback',
      bytes,
      failureClass: classifyUploadFailure(e),
    });
    return uploaded;
  }
}

export function postImagePath(
  userId: string,
  operationId: string,
  ext: string,
  sha256?: string,
): string {
  const safeExt = ext === 'png' ? 'png' : 'jpg';
  const digestSuffix = sha256 ? `-${sha256}` : '';
  return `${userId}/post/${operationId}${digestSuffix}.${safeExt}`;
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
  expectedOwnerId?: string,
): Promise<R2UploadedMedia> {
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const uid = data.user?.id;
  if (!uid) throw new Error('Not signed in.');
  if (expectedOwnerId && uid !== expectedOwnerId) throw new Error('Account changed.');

  const safeExt = ext === 'png' ? 'png' : 'jpg';
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, decode(base64));
  const sha256 = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  const path = operationId
    ? postImagePath(uid, operationId, safeExt, sha256)
    : `${uid}/${Date.now()}.${safeExt}`;
  const contentType = safeExt === 'png' ? 'image/png' : 'image/jpeg';

  const { error } = await supabase.storage
    .from('post-images')
    // unique path per upload → let the CDN cache it for a year (cuts egress)
    .upload(path, decode(base64), { contentType, cacheControl: '31536000' });
  if (error && !(operationId && isExistingPostImageError(error))) throw error;

  return {
    mediaRef: supabase.storage.from('post-images').getPublicUrl(path).data.publicUrl,
    sha256,
  };
}
