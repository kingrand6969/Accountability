// Authenticated, authorization-aware short-lived reads for the private R2 bucket.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';

const responseHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'private, no-store',
  'Vary': 'Authorization',
};
const PRIVATE_REF = /^r2:\/\/(avatars|covers|post-images|post-videos|voice-encouragements)\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,100}$/i;
// Five minutes allows a user to seek within a short video without exposing a
// durable URL. The URL is still issued only after the post's RLS check passes.
const READ_SECONDS = 300;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders, 'Content-Type': 'application/json' },
  });
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

    const input = (await req.json().catch(() => ({}))) as { ref?: unknown; refs?: unknown };
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
      let allowed = false;
      if (folder === 'post-images' || folder === 'post-videos') {
        const [{ data: post }, { data: story }] = await Promise.all([
          supabase.from('posts').select('id').eq('image_url', ref).limit(1).maybeSingle(),
          supabase.from('stories').select('id').eq('image_url', ref).limit(1).maybeSingle(),
        ]);
        allowed = Boolean(post || story);
      } else if (folder === 'voice-encouragements') {
        const { data } = await supabase.from('post_encouragements').select('id').eq('voice_ref', ref).limit(1).maybeSingle();
        allowed = Boolean(data);
      } else {
        const column = folder === 'avatars' ? 'avatar_url' : 'cover_url';
        const { data } = await supabase.from('public_profiles').select('id').eq(column, ref).limit(1).maybeSingle();
        allowed = Boolean(data);
      }
      return allowed ? { ref, key, folder } : null;
    }));
    if (authorized.some((item) => item == null)) return json({ error: 'media not found' }, 404);
    const readable = authorized.filter((item): item is NonNullable<typeof item> => item != null);

    const { error: rateError } = await supabase.from('media_read_log').insert(
      readable.map((item) => ({ media_kind: item.folder })),
    );
    if (rateError) return json({ error: 'Too many image requests — please try again shortly.' }, 429);

    const aws = new AwsClient({
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
      service: 's3',
      region: 'auto',
    });
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
