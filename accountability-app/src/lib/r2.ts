import { decode } from 'base64-arraybuffer';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

export type R2Kind = 'avatar' | 'cover' | 'post' | 'video' | 'voice' | 'share';
export type R2UploadOptions = { operationId?: string; expectedOwnerId?: string };
export type R2UploadedMedia = { mediaRef: string; sha256: string };

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

const R2_FOLDER: Readonly<Record<R2Kind, string>> = {
  avatar: 'avatars',
  cover: 'covers',
  post: 'post-images',
  video: 'post-videos',
  voice: 'voice-encouragements',
  share: 'share-cards',
};

const R2_CONDITIONAL_CONFLICT_RETRIES = 2;

function extensionForContentType(contentType: string): string | null {
  switch (contentType) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'video/mp4': return 'mp4';
    case 'video/quicktime': return 'mov';
    case 'video/webm':
    case 'audio/webm': return 'webm';
    case 'audio/mp4':
    case 'audio/m4a': return 'm4a';
    default: return null;
  }
}

/** Rejects stale or malformed signer responses before any private bytes leave the device. */
export function isExpectedDigestMediaRef(
  mediaRef: string,
  kind: R2Kind,
  sha256: string,
  contentType: string,
): boolean {
  if (!/^[a-f0-9]{64}$/.test(sha256)) return false;
  const extension = extensionForContentType(contentType);
  if (!extension) return false;
  const prefix = `r2://${R2_FOLDER[kind]}/`;
  if (!mediaRef.startsWith(prefix)) return false;
  const [ownerId, filename, extra] = mediaRef.slice(prefix.length).split('/');
  return extra === undefined
    && /^[0-9a-f-]{36}$/i.test(ownerId ?? '')
    && filename === `${sha256}.${extension}`;
}

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
  return (await uploadToR2WithDigest(base64, kind, ext, options)).mediaRef;
}

export async function uploadToR2WithDigest(
  base64: string,
  kind: R2Kind,
  ext = 'jpg',
  options: R2UploadOptions = {},
): Promise<R2UploadedMedia> {
  const body = decode(base64);
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  if (body.byteLength > R2_UPLOAD_MAX_BYTES[kind]) {
    throw Object.assign(new Error('That image is too large to upload.'), { status: 413 });
  }
  return uploadArrayBufferToR2(body, kind, contentType, ext, options);
}

export async function uploadBytesToR2(
  bytes: Uint8Array,
  kind: R2Kind,
  contentType: string,
  ext: string,
  options: R2UploadOptions = {},
): Promise<string> {
  return (await uploadBytesToR2WithDigest(bytes, kind, contentType, ext, options)).mediaRef;
}

export async function uploadBytesToR2WithDigest(
  bytes: Uint8Array,
  kind: R2Kind,
  contentType: string,
  ext: string,
  options: R2UploadOptions = {},
): Promise<R2UploadedMedia> {
  if (bytes.byteLength > R2_UPLOAD_MAX_BYTES[kind]) {
    throw Object.assign(new Error('That file is too large to upload.'), { status: 413 });
  }
  return uploadArrayBufferToR2(Uint8Array.from(bytes).buffer, kind, contentType, ext, options);
}

async function uploadArrayBufferToR2(
  bytes: ArrayBuffer,
  kind: R2Kind,
  contentType: string,
  ext: string,
  options: R2UploadOptions,
): Promise<R2UploadedMedia> {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  const sha256 = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  const maxAttempts = options.operationId ? R2_CONDITIONAL_CONFLICT_RETRIES + 1 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await supabase.functions.invoke('r2-sign', {
      body: {
        kind,
        ext,
        bytes: bytes.byteLength,
        contentType,
        sha256,
        operationId: options.operationId,
        expectedOwnerId: options.expectedOwnerId,
      },
    });
    if (error) throw error;
    const { uploadUrl, mediaRef } = (data ?? {}) as { uploadUrl?: string; mediaRef?: string };
    if (!uploadUrl || !mediaRef) throw new Error('Could not get an upload URL.');
    if (options.operationId && !isExpectedDigestMediaRef(mediaRef, kind, sha256, contentType)) {
      throw new Error('Upload service is out of date. Please try again shortly.');
    }
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.byteLength),
        'x-amz-content-sha256': sha256,
        ...(options.operationId ? { 'If-None-Match': '*' } : {}),
        'Cache-Control': 'private, max-age=0, no-store',
      },
      body: bytes,
    });
    if (put.ok || (options.operationId && put.status === 412)) {
      return { mediaRef, sha256 };
    }
    if (options.operationId && put.status === 409 && attempt + 1 < maxAttempts) {
      continue;
    }
    throw new Error(`Upload failed (${put.status}).`);
  }
  throw new Error('Upload failed after conditional conflict retries.');
}
