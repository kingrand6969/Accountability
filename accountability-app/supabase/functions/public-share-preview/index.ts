// Controlled public read of a sanitized share-card derivative. The original
// post photo/video is never accepted here. Revocation and expiry are checked
// on every request before a private R2 object is streamed.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHARE_REF = /^r2:\/\/share-cards\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,100}$/i;

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  try {
    const id = new URL(req.url).searchParams.get('id') ?? '';
    if (!UUID.test(id)) return new Response('Not found', { status: 404 });
    const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
    if (required.some((name) => !Deno.env.get(name))) return new Response('Unavailable', { status: 503 });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });
    const { data } = await admin
      .from('public_shares')
      .select('preview_image_ref')
      .eq('id', id)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    const ref = data?.preview_image_ref;
    if (typeof ref !== 'string' || !SHARE_REF.test(ref)) return new Response('Not found', { status: 404 });

    const key = ref.slice('r2://'.length);
    const aws = new AwsClient({
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
      service: 's3',
      region: 'auto',
    });
    const endpoint = `https://${Deno.env.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${Deno.env.get('R2_BUCKET')}/${key}`;
    const signed = await aws.sign(new Request(endpoint, { method: req.method }), { aws: { signQuery: true } });
    const object = await fetch(signed);
    if (!object.ok) return new Response('Not found', { status: 404 });
    return new Response(req.method === 'HEAD' ? null : object.body, {
      headers: {
        'Content-Type': object.headers.get('Content-Type') ?? 'image/png',
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=60',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
});
