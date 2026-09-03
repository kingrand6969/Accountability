import { decode } from 'base64-arraybuffer';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

export type R2Kind = 'avatar' | 'cover' | 'post' | 'video' | 'voice' | 'share';
export type R2UploadOptions = {
  operationId?: string;
  expectedOwnerId?: string;
  keyMode?: 'operation';
};
export type R2UploadedMedia = { mediaRef: string; sha256: string };

export const R2_UPLOAD_MAX_BYTES: Readonly<Record<R2Kind, number>> = {
  avatar: 2 * 1024 * 1024,
  cover: 4 * 1024 * 1024,
  post: 12 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  voice: 1024 * 1024,
  // The app renders share cards from approved display copy without passing the
  // source-media URL. The signer separately enforces PNG structure and size.
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

/** Validates the exact owner-scoped object identity returned for a Journey operation. */
export function isExpectedOperationDigestMediaRef(
  mediaRef: string,
  kind: R2Kind,
  operationId: string,
  sha256: string,
  contentType: string,
  expectedOwnerId?: string,
): boolean {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId) ||
    !/^[a-f0-9]{64}$/.test(sha256)) return false;
  const extension = extensionForContentType(contentType);
  if (!extension) return false;
  const prefix = `r2://${R2_FOLDER[kind]}/`;
  if (!mediaRef.startsWith(prefix)) return false;
  const [ownerId, operationSegment, filename, extra] = mediaRef.slice(prefix.length).split('/');
  return extra === undefined && /^[0-9a-f-]{36}$/i.test(ownerId ?? '') &&
    (expectedOwnerId === undefined || ownerId === expectedOwnerId) &&
    operationSegment === operationId && filename === `${sha256}.${extension}`;
}

/**
 * Upload base64 media to Cloudflare R2.
 *
 * Normal media receives a one-time signed PUT URL. Share-card bytes instead pass
 * through `r2-sign`, which validates and stores that bounded derivative without
 * exposing an R2 URL. Both paths return an opaque private reference for Postgres.
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
  return uploadArrayBufferToR2(body, kind, contentType, ext, options, base64);
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
  directUploadBase64?: string,
): Promise<R2UploadedMedia> {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes));
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
        keyMode: options.keyMode,
        ...(kind === 'share' ? { action: 'direct-upload', base64: directUploadBase64 } : {}),
      },
    });
    if (error) throw error;
    const { uploadUrl, mediaRef, uploaded } = (data ?? {}) as {
      uploadUrl?: string;
      mediaRef?: string;
      uploaded?: boolean;
    };
    if (!mediaRef) throw new Error('Could not get an upload URL.');
    const expectedReference = options.keyMode === 'operation'
      ? Boolean(options.operationId && isExpectedOperationDigestMediaRef(
        mediaRef, kind, options.operationId, sha256, contentType, options.expectedOwnerId,
      ))
      : !options.operationId || isExpectedDigestMediaRef(mediaRef, kind, sha256, contentType);
    if (!expectedReference) {
      throw new Error('Upload service is out of date. Please try again shortly.');
    }
    if (kind === 'share') {
      if (uploaded !== true) throw new Error('Could not complete the upload.');
      return { mediaRef, sha256 };
    }
    if (!uploadUrl) throw new Error('Could not get an upload URL.');
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.byteLength),
        'x-amz-content-sha256': sha256,
        ...(options.operationId ? { 'If-None-Match': '*' } : {}),
        ...(options.operationId ? { 'x-amz-meta-operation-id': options.operationId } : {}),
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
