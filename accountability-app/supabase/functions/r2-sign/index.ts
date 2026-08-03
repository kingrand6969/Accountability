// Supabase Edge Function: r2-sign
//
// Returns a short-lived, one-time signed URL that lets the CURRENT logged-in
// user upload a single image straight to Cloudflare R2 (zero-egress delivery),
// plus an opaque private reference to store in Postgres. All R2 credentials live only in this
// function's secrets — never in the mobile app — so the client can't leak them
// and switching to a custom domain later is a server-only change.
//
// Secrets required (set in the Supabase dashboard → Edge Functions → Secrets):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// (SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically.)
//
// Deploy:  supabase functions deploy r2-sign
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
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
    const { kind, ext, bytes, contentType, operationId } = (await req.json().catch(() => ({}))) as {
      kind?: string;
      ext?: string;
      bytes?: number;
      contentType?: string;
      operationId?: string;
    };
    const cfg = KINDS[kind ?? ''];
    if (!cfg) return json({ error: 'invalid kind' }, 400);
    // REQUIRE size + type (don't let a client omit them to skip the checks).
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
      return json({ error: 'bytes required' }, 400);
    }
    if (bytes > MAX_BYTES[kind!]) return json({ error: 'file too large' }, 413);
    if (!contentType || !ALLOWED_TYPES.has(contentType)) {
      return json({ error: 'unsupported file type' }, 415);
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

    // 3) Rate-limit: log this sign; a per-user BEFORE-INSERT trigger (migration
    //    0057) rejects the write once the hourly cap is hit → we return 429
    //    instead of handing out another upload URL.
    const { error: rlErr } = await supabase.from('r2_sign_log').insert({ kind });
    if (rlErr) {
      return json({ error: 'Too many uploads — please slow down and try again shortly.' }, 429);
    }

    // 4) Build the object key, scoped to this user's folder (their own space).
    const filename = cfg.stable
      ? `${cfg.folder}.${safeExt}`
      : `${operationId ?? crypto.randomUUID()}.${safeExt}`;
    const key = `${cfg.folder}/${user.id}/${filename}`;

    // 5) Presign a PUT to the R2 S3 endpoint (valid 5 minutes).
    const aws = new AwsClient({
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
      service: 's3',
      region: 'auto',
    });
    const endpoint = `https://${Deno.env.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${Deno.env.get(
      'R2_BUCKET',
    )}/${key}`;
    // Bind the Content-Type INTO the signature: it becomes a signed header, so
    // R2 rejects any upload whose Content-Type differs from what we approved —
    // a client can no longer request an "image/jpeg" URL then PUT a video/zip.
    // (The app already sends this exact Content-Type on its PUT.)
    const signed = await aws.sign(
      new Request(`${endpoint}?X-Amz-Expires=300`, {
        method: 'PUT',
        headers: { 'content-type': contentType },
      }),
      { aws: { signQuery: true, allHeaders: true } },
    );

    return json({ uploadUrl: signed.url, mediaRef: `r2://${key}`, key });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
