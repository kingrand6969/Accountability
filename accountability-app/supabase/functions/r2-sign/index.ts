// Supabase Edge Function: r2-sign
//
// Authorizes one media upload for the CURRENT logged-in user. Normal media gets
// a short-lived signed URL; bounded public-share derivatives are verified and
// stored here. The response includes an opaque private reference for Postgres.
// R2 credentials remain only in this function's secrets.
//
// Secrets required (set in the Supabase dashboard → Edge Functions → Secrets):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// (SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically.)
//
// Deploy:  supabase functions deploy r2-sign
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';
import { digestObjectFilename, operationDigestObjectFilename } from '../_shared/r2ObjectKey.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// What the app may upload, and where it lands in the bucket. Stable = one fixed
// path per user (overwritten on change, like a profile photo); else unique path.
const KINDS: Record<string, { folder: string; stable: boolean }> = {
  avatar: { folder: 'avatars', stable: true },
  cover: { folder: 'covers', stable: true },
  post: { folder: 'post-images', stable: false },
  video: { folder: 'post-videos', stable: false },
  voice: { folder: 'voice-encouragements', stable: false },
  share: { folder: 'share-cards', stable: false },
};

// The app only uploads compressed images; this is generous headroom (avatars are
// ~100 KB, feed photos well under a MB). Rejects an oversized/abusive upload.
const MAX_BYTES: Record<string, number> = {
  avatar: 2 * 1024 * 1024,
  cover: 4 * 1024 * 1024,
  post: 12 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  voice: 1024 * 1024,
  share: 4 * 1024 * 1024,
};
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/mp4',
  'audio/m4a',
  'audio/webm',
]);
const OPERATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const SHARE_BASE64_MAX_CHARS = 4 * Math.ceil(MAX_BYTES.share / 3);
const REQUEST_BODY_MAX_BYTES = SHARE_BASE64_MAX_CHARS + 4096;
const SHARE_PNG_MAX_DIMENSION = 8192;
const SHARE_PNG_MAX_PIXELS = 16_000_000;
const DIRECT_UPLOAD_CONFLICT_ATTEMPTS = 3;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function readBoundedJson(req: Request): Promise<
  { value: unknown; error?: never } | {
    value?: never;
    error: 'invalid request' | 'request too large' | 'unsupported content encoding';
    status: 400 | 413 | 415;
  }
> {
  const contentEncoding = req.headers.get('content-encoding');
  if (contentEncoding && contentEncoding.toLowerCase() !== 'identity') {
    return { error: 'unsupported content encoding', status: 415 };
  }
  const declaredLength = req.headers.get('content-length');
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) return { error: 'invalid request', status: 400 };
    if (Number(declaredLength) > REQUEST_BODY_MAX_BYTES) return { error: 'request too large', status: 413 };
  }
  if (!req.body) return { error: 'invalid request', status: 400 };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalLength += value.byteLength;
      if (totalLength > REQUEST_BODY_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { error: 'request too large', status: 413 };
      }
      chunks.push(value);
    }
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) };
  } catch {
    return { error: 'invalid request', status: 400 };
  }
}

function isBoundedSharePng(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 24 || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) return false;
  if (bytes[8] !== 0 || bytes[9] !== 0 || bytes[10] !== 0 || bytes[11] !== 13 ||
    bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) return false;
  const width = bytes[16] * 0x1000000 + bytes[17] * 0x10000 + bytes[18] * 0x100 + bytes[19];
  const height = bytes[20] * 0x1000000 + bytes[21] * 0x10000 + bytes[22] * 0x100 + bytes[23];
  return width > 0 && height > 0 && width <= SHARE_PNG_MAX_DIMENSION && height <= SHARE_PNG_MAX_DIMENSION &&
    width * height <= SHARE_PNG_MAX_PIXELS;
}

function hasStrictBase64Shape(value: string): boolean {
  if (!value || value.length % 4 !== 0) return false;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  for (let index = 0; index < value.length - padding; index += 1) {
    const code = value.charCodeAt(index);
    if (!(
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      code === 43 || code === 47
    )) return false;
  }
  for (let index = value.length - padding; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 61) return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const required = [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
    ];
    if (required.some((name) => !Deno.env.get(name))) {
      return json({ error: 'media storage is temporarily unavailable' }, 503);
    }

    // 1) Authorize: only a signed-in user may request an upload URL.
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: 'unauthorized' }, 401);

    // 2) Validate the request.
    const parsedBody = await readBoundedJson(req);
    if ('error' in parsedBody) return json({ error: parsedBody.error }, parsedBody.status);
    if (!parsedBody.value || typeof parsedBody.value !== 'object' || Array.isArray(parsedBody.value)) {
      return json({ error: 'invalid request' }, 400);
    }
    const { action, kind, ext, bytes, contentType, sha256, operationId, expectedOwnerId, mediaRef, keyMode, base64 } = parsedBody.value as {
      action?: 'delete' | 'direct-upload';
      kind?: string;
      ext?: string;
      bytes?: number;
      contentType?: string;
      sha256?: string;
      operationId?: string;
      expectedOwnerId?: string;
      mediaRef?: string;
      keyMode?: 'operation';
      base64?: string;
    };
    if (expectedOwnerId && expectedOwnerId !== user.id) {
      return json({ error: 'account changed' }, 403);
    }
    const cfg = KINDS[kind ?? ''];
    if (!cfg) return json({ error: 'invalid kind' }, 400);
    if (!contentType || !ALLOWED_TYPES.has(contentType)) {
      return json({ error: 'unsupported file type' }, 415);
    }
    if (!sha256 || !SHA256.test(sha256)) {
      return json({ error: 'sha256 required' }, 400);
    }
    const safeExt =
      contentType === 'image/png'
        ? 'png'
        : contentType === 'image/jpeg'
          ? 'jpg'
          : contentType === 'video/mp4'
            ? 'mp4'
            : contentType === 'video/quicktime'
              ? 'mov'
              : contentType === 'video/webm'
                ? 'webm'
          : contentType === 'audio/webm'
            ? 'webm'
            : 'm4a';
    if (
      ext &&
      ext.toLowerCase() !== safeExt &&
      !(ext.toLowerCase() === 'jpeg' && safeExt === 'jpg')
    ) {
      return json({ error: 'extension does not match content type' }, 415);
    }
    if (operationId && (!['post', 'video', 'voice', 'share'].includes(kind!) || !OPERATION_ID.test(operationId))) {
      return json({ error: 'invalid operation id' }, 400);
    }
    if (keyMode !== undefined && (
      keyMode !== 'operation' || kind !== 'post' || !operationId || !OPERATION_ID.test(operationId)
    )) return json({ error: 'invalid key mode' }, 400);
    if (action !== undefined && action !== 'delete' && action !== 'direct-upload') {
      return json({ error: 'invalid action' }, 400);
    }

    if (action === 'delete') {
      if (kind !== 'post' || expectedOwnerId !== user.id || !operationId || !OPERATION_ID.test(operationId)) {
        return json({ error: 'invalid cleanup identity' }, 400);
      }
      const filename = keyMode === 'operation'
        ? operationDigestObjectFilename(operationId, sha256, safeExt)
        : digestObjectFilename(sha256, safeExt);
      const key = `${cfg.folder}/${user.id}/${filename}`;
      const expectedMediaRef = `r2://${key}`;
      if (mediaRef !== expectedMediaRef) return json({ error: 'media reference mismatch' }, 400);
      const aws = new AwsClient({
        accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
        service: 's3',
        region: 'auto',
      });
      const endpoint = `https://${Deno.env.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${Deno.env.get(
        'R2_BUCKET',
      )}/${key}`;
      const existing = await aws.fetch(endpoint, { method: 'HEAD' });
      if (existing.status === 404) return json({ deleted: true, mediaRef: expectedMediaRef });
      if (!existing.ok) return json({ error: 'could not verify cleanup object' }, 503);
      if (existing.headers.get('x-amz-meta-operation-id') !== operationId) {
        if (keyMode === 'operation') return json({ error: 'cleanup operation metadata mismatch' }, 409);
        // Digest addressing intentionally lets identical bytes share one owner-scoped
        // object. A different operation must release its recovery record without
        // deleting the object owned by the first operation.
        return json({ shared: true, mediaRef: expectedMediaRef });
      }
      const signed = await aws.sign(new Request(`${endpoint}?X-Amz-Expires=300`, { method: 'DELETE' }), {
        aws: { signQuery: true, allHeaders: true },
      });
      return json({ deleteUrl: signed.url, mediaRef: expectedMediaRef });
    }

    // REQUIRE size for uploads (don't let a client omit it to skip the checks).
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
      return json({ error: 'bytes required' }, 400);
    }
    if (bytes > MAX_BYTES[kind!]) return json({ error: 'file too large' }, 413);
    if (action === 'direct-upload') {
      if (kind !== 'share' || contentType !== 'image/png' || ext?.toLowerCase() !== 'png' ||
        !operationId || typeof base64 !== 'string') {
        return json({ error: 'invalid direct upload' }, 400);
      }
      if (base64.length > SHARE_BASE64_MAX_CHARS) return json({ error: 'file too large' }, 413);
      if (!hasStrictBase64Shape(base64)) {
        return json({ error: 'invalid upload payload' }, 400);
      }
      const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
      const decodedLength = Math.floor(base64.length / 4) * 3 - padding;
      if (decodedLength !== bytes) return json({ error: 'upload payload mismatch' }, 400);
    } else if (kind === 'share') {
      return json({ error: 'invalid direct upload' }, 400);
    }

    // 3) Rate-limit: log this upload authorization; a per-user BEFORE-INSERT trigger (migration
    //    0057) rejects the write once the hourly cap is hit → we return 429
    //    instead of handing out another upload URL.
    const { error: rlErr } = await supabase.from('r2_sign_log').insert({ kind });
    if (rlErr) {
      return json({ error: 'Too many uploads — please slow down and try again shortly.' }, 429);
    }

    let directUploadBytes: Uint8Array | undefined;
    if (action === 'direct-upload') {
      try {
        const binary = atob(base64!);
        directUploadBytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          directUploadBytes[index] = binary.charCodeAt(index);
        }
        if (btoa(binary) !== base64 || !isBoundedSharePng(directUploadBytes)) {
          return json({ error: 'invalid upload payload' }, 400);
        }
        if (directUploadBytes.byteLength !== bytes) {
          return json({ error: 'upload payload mismatch' }, 400);
        }
        const actualDigest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', directUploadBytes))]
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('');
        if (actualDigest !== sha256) return json({ error: 'upload payload mismatch' }, 400);
      } catch {
        return json({ error: 'media upload failed' }, 502);
      }
    }

    // 4) Build the object key, scoped to this user's folder (their own space).
    const filename = cfg.stable
      ? `${cfg.folder}.${safeExt}`
      : keyMode === 'operation'
        ? operationDigestObjectFilename(operationId!, sha256, safeExt)
      : operationId
        ? digestObjectFilename(sha256, safeExt)
        : `${crypto.randomUUID()}.${safeExt}`;
    const key = `${cfg.folder}/${user.id}/${filename}`;

    // 5) Store bounded share derivatives here; all other media uses a presigned PUT.
    const aws = new AwsClient({
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
      service: 's3',
      region: 'auto',
    });
    const endpoint = `https://${Deno.env.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${Deno.env.get(
      'R2_BUCKET',
    )}/${key}`;
    if (action === 'direct-upload') {
      const directHeaders = {
        'content-type': contentType,
        'x-amz-content-sha256': sha256,
        'if-none-match': '*',
        'x-amz-meta-operation-id': operationId!,
      };
      try {
        let stored: Response | undefined;
        for (let attempt = 0; attempt < DIRECT_UPLOAD_CONFLICT_ATTEMPTS; attempt += 1) {
          stored = await aws.fetch(endpoint, {
            method: 'PUT',
            headers: directHeaders,
            body: directUploadBytes!,
            aws: { allHeaders: true },
          });
          if (stored.status !== 409) break;
        }
        if (!stored || (!stored.ok && stored.status !== 412)) {
          return json({ error: 'media upload failed' }, 502);
        }
        return json({ uploaded: true, mediaRef: `r2://${key}` });
      } catch {
        return json({ error: 'media upload failed' }, 502);
      }
    }

    // Bind exact length, type, and digest for presigned non-share uploads.
    // Deterministic retries are create-only: digest-addressing plus If-None-Match
    // makes an existing object safe to reuse without overwriting.
    const uploadHeaders = {
      'content-type': contentType,
      'content-length': String(bytes),
      'x-amz-content-sha256': sha256,
      ...(operationId ? { 'if-none-match': '*' } : {}),
      ...(operationId ? { 'x-amz-meta-operation-id': operationId } : {}),
    };
    const signed = await aws.sign(
      new Request(`${endpoint}?X-Amz-Expires=300`, {
        method: 'PUT',
        headers: uploadHeaders,
      }),
      { aws: { signQuery: true, allHeaders: true } },
    );

    return json({ uploadUrl: signed.url, mediaRef: `r2://${key}`, key });
  } catch {
    return json({ error: 'internal error' }, 500);
  }
});
