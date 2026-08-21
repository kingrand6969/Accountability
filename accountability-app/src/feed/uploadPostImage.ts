import { decode } from 'base64-arraybuffer';
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import { isExpectedDigestMediaRef, uploadToR2WithDigest, type R2UploadedMedia } from '../lib/r2';
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

const POST_OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_HEX = /^[a-f0-9]{64}$/;

/** Deletes only the derivative bound to this owner, operation, and digest. */
export async function deletePostImageForOperation(
  mediaRef: string,
  sha256: string,
  operationId: string,
  expectedOwnerId: string,
): Promise<void> {
  if (!POST_OPERATION_ID.test(operationId) || !SHA256_HEX.test(sha256)) {
    throw new Error('Invalid post image cleanup identity.');
  }
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (data.user?.id !== expectedOwnerId) throw new Error('Account changed.');

  if (mediaRef.startsWith('r2://')) {
    if (!isExpectedDigestMediaRef(mediaRef, 'post', sha256, 'image/jpeg') ||
      !mediaRef.startsWith(`r2://post-images/${expectedOwnerId}/`)) {
      throw new Error('The post image reference does not match this cleanup operation.');
    }
    const { data: signed, error } = await supabase.functions.invoke('r2-sign', { body: {
      action: 'delete', kind: 'post', ext: 'jpg', contentType: 'image/jpeg',
      sha256, operationId, expectedOwnerId, mediaRef,
    } });
    if (error) throw error;
    const response = (signed ?? {}) as { deleteUrl?: string; mediaRef?: string; deleted?: boolean };
    if (response.mediaRef !== mediaRef || (!response.deleteUrl && response.deleted !== true)) {
      throw new Error('The cleanup service returned a mismatched image reference.');
    }
    if (response.deleted === true) return;
    const deleteUrl = response.deleteUrl;
    if (!deleteUrl) throw new Error('The cleanup service did not return a delete URL.');
    const deleted = await fetch(deleteUrl, { method: 'DELETE' });
    if (!deleted.ok && deleted.status !== 404) throw new Error(`Post image cleanup failed (${deleted.status}).`);
    return;
  }

  const path = postImagePath(expectedOwnerId, operationId, 'jpg', sha256);
  const bucket = supabase.storage.from('post-images');
  const expectedPublicUrl = bucket.getPublicUrl(path).data.publicUrl;
  if (mediaRef !== expectedPublicUrl) throw new Error('The post image reference does not match this cleanup operation.');
  const { error } = await bucket.remove([path]);
  if (error) throw error;
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
