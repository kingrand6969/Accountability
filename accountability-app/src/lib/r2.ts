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
const R2_DIAGNOSTIC_BODY_LIMIT = 4096;
const R2_DIAGNOSTIC_PROVIDER_CODES: ReadonlySet<string> = new Set([
  'AccessDenied',
  'SignatureDoesNotMatch',
]);
const R2_DIAGNOSTIC_SIGNED_HEADERS: ReadonlySet<string> = new Set([
  'content-length',
  'content-type',
  'host',
  'if-none-match',
  'x-amz-content-sha256',
  'x-amz-meta-operation-id',
]);

function signedHeaderNames(uploadUrl: string): string[] {
  try {
    const url = new URL(uploadUrl);
    let signedHeaders: string | undefined;
    url.searchParams.forEach((value, name) => {
      if (name.toLowerCase() === 'x-amz-signedheaders') signedHeaders = value;
    });
    return [...new Set((signedHeaders ?? '')
      .split(';')
      .map((name) => name.trim().toLowerCase())
      .filter((name) => R2_DIAGNOSTIC_SIGNED_HEADERS.has(name)))]
      .sort()
      .slice(0, R2_DIAGNOSTIC_SIGNED_HEADERS.size);
  } catch {
    return [];
  }
}

function providerCodeFromBody(body: string): string | undefined {
  const code = body.match(/<Code>([^<]*)<\/Code>/)?.[1]?.trim();
  return code && R2_DIAGNOSTIC_PROVIDER_CODES.has(code) ? code : undefined;
}

function utf8ByteLength(value: string): number {
  let byteLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      byteLength += 1;
    } else if (codeUnit <= 0x7ff) {
      byteLength += 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      byteLength += 4;
      index += 1;
    } else {
      byteLength += 3;
    }
  }
  return byteLength;
}

async function readDiagnosticBody(response: Response): Promise<string | undefined> {
  const stream = response.body;
  if (!stream || typeof stream.getReader !== 'function') {
    let contentLength: string | null;
    try {
      contentLength = response.headers?.get('content-length') ?? null;
    } catch {
      return undefined;
    }
    if (!contentLength || !/^\d+$/.test(contentLength)) return undefined;
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength > R2_DIAGNOSTIC_BODY_LIMIT) return undefined;
    try {
      const body = await response.text();
      if (body.length > R2_DIAGNOSTIC_BODY_LIMIT || utf8ByteLength(body) !== declaredLength) return undefined;
      return body.slice(0, R2_DIAGNOSTIC_BODY_LIMIT);
    } catch {
      return undefined;
    }
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = stream.getReader();
  } catch {
    return undefined;
  }

  let cancelled = false;
  const cancel = async () => {
    if (cancelled) return;
    cancelled = true;
    await reader.cancel();
  };
  try {
    const decoder = new TextDecoder();
    let body = '';
    let bytesRead = 0;
    while (bytesRead < R2_DIAGNOSTIC_BODY_LIMIT) {
      const result = await reader.read();
      if (result.done) return body + decoder.decode();
      if (!(result.value instanceof Uint8Array)) throw new Error('Unexpected response chunk.');
      const remaining = R2_DIAGNOSTIC_BODY_LIMIT - bytesRead;
      const chunk = result.value.subarray(0, remaining);
      body += decoder.decode(chunk, { stream: true });
      bytesRead += chunk.byteLength;
      if (bytesRead === R2_DIAGNOSTIC_BODY_LIMIT) {
        await cancel();
        return body + decoder.decode();
      }
    }
    return body;
  } catch {
    try {
      await cancel();
    } catch {
      // Diagnostics must never replace the original upload failure.
    }
    return undefined;
  }
}

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
    if (kind === 'share' && uploaded === true) {
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
    if (kind !== 'share' || put.status !== 403) {
      throw new Error(`Upload failed (${put.status}).`);
    }
    const responseBody = await readDiagnosticBody(put);
    const providerCode = responseBody === undefined ? undefined : providerCodeFromBody(responseBody);
    console.warn('R2 upload failed', {
      status: put.status,
      byteLength: bytes.byteLength,
      kind,
      keyClass: options.keyMode === 'operation' ? 'operation-digest' : options.operationId ? 'digest' : 'mutable',
      operationIdPresent: Boolean(options.operationId),
      signedHeaders: signedHeaderNames(uploadUrl),
      providerCode: providerCode ?? 'unknown',
    });
    throw new Error(providerCode
      ? `Upload failed (${put.status}: ${providerCode}).`
      : `Upload failed (${put.status}).`);
  }
  throw new Error('Upload failed after conditional conflict retries.');
}
