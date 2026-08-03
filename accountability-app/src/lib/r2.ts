import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

export type R2Kind = 'avatar' | 'cover' | 'post' | 'video' | 'voice' | 'share';
export type R2UploadOptions = { operationId?: string };

export const R2_UPLOAD_MAX_BYTES: Readonly<Record<R2Kind, number>> = {
  avatar: 2 * 1024 * 1024,
  cover: 4 * 1024 * 1024,
  post: 12 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  voice: 1024 * 1024,
  // A share card is a rendered, sanitized derivative. It never contains the
  // private source-media URL and remains in the private bucket.
  share: 4 * 1024 * 1024,
};

/**
 * Upload a base64 image straight to Cloudflare R2 (zero-egress delivery).
 *
 * Flow: ask the `r2-sign` Edge Function for a one-time signed URL (it authorizes
 * the caller and holds the R2 credentials server-side), PUT the bytes directly to
 * R2, and return an opaque private reference to store in Postgres. The bytes never pass through
 * Supabase, so this move takes serving those images off Supabase's metered egress.
 *
 * Upload flows use this R2 path first and only fall back when policy permits.
 * Remote activation still requires the `r2-sign` function and R2 secrets.
 */
export async function uploadToR2(
  base64: string,
  kind: R2Kind,
  ext = 'jpg',
  options: R2UploadOptions = {},
): Promise<string> {
  const body = decode(base64);
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  if (body.byteLength > R2_UPLOAD_MAX_BYTES[kind]) {
    throw Object.assign(new Error('That image is too large to upload.'), { status: 413 });
  }
  // Declare size + type so the signing function can reject oversized/abusive
  // uploads and rate-limit per user before handing back an upload URL.
  const { data, error } = await supabase.functions.invoke('r2-sign', {
    body: { kind, ext, bytes: body.byteLength, contentType, operationId: options.operationId },
  });
  if (error) throw error;
  const { uploadUrl, mediaRef } = (data ?? {}) as { uploadUrl?: string; mediaRef?: string };
  if (!uploadUrl || !mediaRef) throw new Error('Could not get an upload URL.');

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      // objects are content-addressed by a unique/stable key → cache hard at the CDN
      'Cache-Control': 'private, max-age=0, no-store',
    },
    body,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status}).`);

  return mediaRef;
}

export async function uploadBytesToR2(
  bytes: Uint8Array,
  kind: R2Kind,
  contentType: string,
  ext: string,
  options: R2UploadOptions = {},
): Promise<string> {
  if (bytes.byteLength > R2_UPLOAD_MAX_BYTES[kind]) {
    throw Object.assign(new Error('That file is too large to upload.'), { status: 413 });
  }
  const { data, error } = await supabase.functions.invoke('r2-sign', {
    body: { kind, ext, bytes: bytes.byteLength, contentType, operationId: options.operationId },
  });
  if (error) throw error;
  const { uploadUrl, mediaRef } = (data ?? {}) as { uploadUrl?: string; mediaRef?: string };
  if (!uploadUrl || !mediaRef) throw new Error('Could not get an upload URL.');
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=0, no-store' },
    body: Uint8Array.from(bytes).buffer,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status}).`);
  return mediaRef;
}
