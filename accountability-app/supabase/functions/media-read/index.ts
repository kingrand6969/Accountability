// Authenticated, authorization-aware short-lived reads for the private R2 bucket.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';

const responseHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'private, no-store',
  'Vary': 'Authorization',
};
const PRIVATE_REF = /^r2:\/\/(avatars|covers|post-images|post-videos|voice-encouragements)\/[0-9a-f-]{36}\/(?:[A-Za-z0-9._-]{1,100}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[a-f0-9]{64}\.(?:jpg|png))$/i;
const BYTE_IMAGE_FOLDERS = new Set(['avatars', 'covers', 'post-images']);
const BYTE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BYTE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const BYTE_IMAGE_FETCH_TIMEOUT_MS = 15_000;
// Five minutes allows a user to seek within a short video without exposing a
// durable URL. The URL is still issued only after the post's RLS check passes.
const READ_SECONDS = 300;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders, 'Content-Type': 'application/json' },
  });
}

function imageTypeForBytes(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp';
  return null;
}

async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      if (value.byteLength > maxBytes - totalBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      totalBytes += value.byteLength;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (totalBytes < 1) return null;
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function authorizationDecision(
  responses: Array<{ data: unknown; error: unknown }>,
): 'allowed' | 'denied' | 'unavailable' {
  if (responses.some(({ error }) => Boolean(error))) return 'unavailable';
  return responses.some(({ data }) => Boolean(data)) ? 'allowed' : 'denied';
}

function rateErrorStatus(error: { code?: string } | null): number | null {
  if (!error) return null;
  return error.code === '54000' ? 429 : 503;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: responseHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  try {
    const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
    if (required.some((name) => !Deno.env.get(name))) return json({ error: 'media storage is temporarily unavailable' }, 503);

    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'unauthorized' }, 401);

    const input = (await req.json().catch(() => ({}))) as {
      ref?: unknown;
      refs?: unknown;
      delivery?: unknown;
    };
    const byteDelivery = input.delivery === 'bytes';
    if (
      (input.delivery !== undefined && !byteDelivery) ||
      (byteDelivery && (input.refs !== undefined || typeof input.ref !== 'string'))
    ) {
      return json({ error: 'media not found' }, 404);
    }
    const requested = Array.isArray(input.refs) ? input.refs : [input.ref];
    if (requested.length === 0 || requested.length > 50 || requested.some(
      (ref) => typeof ref !== 'string' || ref.length > 240 || !PRIVATE_REF.test(ref),
    )) {
      return json({ error: 'media not found' }, 404);
    }

    const refs = [...new Set(requested as string[])];
    const authorized = await Promise.all(refs.map(async (ref) => {
      const key = ref.slice('r2://'.length);
      const folder = key.split('/', 1)[0];
      let decision: 'allowed' | 'denied' | 'unavailable';
      if (folder === 'post-images' || folder === 'post-videos') {
        const responses = await Promise.all([
          supabase.from('posts').select('id').eq('image_url', ref).limit(1).maybeSingle(),
          supabase.from('stories').select('id').eq('image_url', ref).limit(1).maybeSingle(),
        ]);
        decision = authorizationDecision(responses);
      } else if (folder === 'voice-encouragements') {
        const response = await supabase.from('post_encouragements').select('id').eq('voice_ref', ref).limit(1).maybeSingle();
        decision = authorizationDecision([response]);
      } else {
        const column = folder === 'avatars' ? 'avatar_url' : 'cover_url';
        const response = await supabase.from('public_profiles').select('id').eq(column, ref).limit(1).maybeSingle();
        decision = authorizationDecision([response]);
      }
      return {
        decision,
        item: decision === 'allowed' ? { ref, key, folder } : null,
      };
    }));
    const authorizationUnavailable = authorized.some(({ decision }) => decision === 'unavailable');
    if (authorizationUnavailable) {
      return json({ error: 'media service is temporarily unavailable' }, 503);
    }
    if (authorized.some(({ decision }) => decision === 'denied')) {
      return json({ error: 'media not found' }, 404);
    }
    const readable = authorized
      .map(({ item }) => item)
      .filter((item): item is NonNullable<typeof item> => item != null);
    if (byteDelivery && !BYTE_IMAGE_FOLDERS.has(readable[0].folder)) {
      return json({ error: 'media not found' }, 404);
    }

    const { error: rateError } = await supabase.from('media_read_log').insert(
      readable.map((item) => ({ media_kind: item.folder })),
    );
    const rateStatus = rateErrorStatus(rateError);
    if (rateStatus === 429) {
      return json({ error: 'Too many image requests — please try again shortly.' }, 429);
    }
    if (rateStatus === 503) {
      return json({ error: 'media service is temporarily unavailable' }, 503);
    }

    const aws = new AwsClient({
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
      service: 's3',
      region: 'auto',
    });
    if (byteDelivery) {
      const { key } = readable[0];
      const endpoint = `https://${Deno.env.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${Deno.env.get('R2_BUCKET')}/${key}`;
      const upstreamRequest = await aws.sign(new Request(endpoint, { method: 'GET' }));
      const upstream = await fetch(upstreamRequest, { signal: AbortSignal.timeout(BYTE_IMAGE_FETCH_TIMEOUT_MS) });
      if (!upstream.ok) return json({ error: 'media request failed' }, 502);

      const contentType = (upstream.headers.get('content-type') ?? '')
        .split(';', 1)[0]
        .trim()
        .toLowerCase();
      if (!BYTE_IMAGE_TYPES.has(contentType)) {
        return json({ error: 'media request failed' }, 502);
      }
      const contentLength = upstream.headers.get('content-length');
      if (contentLength !== null) {
        const declaredBytes = Number(contentLength);
        if (
          !Number.isSafeInteger(declaredBytes) ||
          declaredBytes < 1 ||
          declaredBytes > BYTE_IMAGE_MAX_BYTES
        ) {
          return json({ error: 'media request failed' }, 502);
        }
      }
      const bytes = await readBoundedBody(upstream.body, BYTE_IMAGE_MAX_BYTES);
      if (bytes === null || bytes.byteLength < 1 || bytes.byteLength > BYTE_IMAGE_MAX_BYTES) {
        return json({ error: 'media request failed' }, 502);
      }
      const magicType = imageTypeForBytes(bytes);
      if (magicType !== contentType) {
        return json({ error: 'media request failed' }, 502);
      }
      return new Response(bytes, {
        status: 200,
        headers: {
          ...responseHeaders,
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(bytes.byteLength),
          'X-Private-Image-Type': contentType,
          'X-Content-Type-Options': 'nosniff',
          'Access-Control-Expose-Headers': 'X-Private-Image-Type, Content-Length',
        },
      });
    }
    const expiresAt = new Date(Date.now() + READ_SECONDS * 1000).toISOString();
    const items = await Promise.all(readable.map(async ({ ref, key }) => {
      const endpoint = `https://${Deno.env.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${Deno.env.get('R2_BUCKET')}/${key}`;
      const signed = await aws.sign(new Request(endpoint + '?X-Amz-Expires=' + READ_SECONDS, { method: 'GET' }), { aws: { signQuery: true } });
      return { ref, url: signed.url, expiresAt };
    }));
    return Array.isArray(input.refs) ? json({ items }) : json(items[0]);
  } catch {
    return json({ error: 'media request failed' }, 500);
  }
});
