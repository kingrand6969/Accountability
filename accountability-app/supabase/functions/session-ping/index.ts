// Supabase Edge Function: session-ping
//
// Called by the app on launch / foreground with the member's own login
// (verify_jwt = true). Records the connection's IP address server-side (the
// client never self-reports — the proxy header is the source of truth) so
// repeat abusers can be blocked at the network level, and tells the app
// whether this network is banned. Disclosed in the Privacy Policy.
// FAIL-OPEN: any storage error still returns ok — members are never blocked
// by a telemetry hiccup.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// The real client IP as set by the trusted edge proxy (Cloudflare in front of
// Supabase Functions). x-forwarded-for's left-most entry is client-appendable
// and MUST NOT be trusted. We also validate the shape and store nothing if it
// isn't a syntactically valid IP.
function trustedClientIp(req: Request): string {
  const isIp = (s: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(s) || /^[0-9a-fA-F:]+$/.test(s);
  for (const h of ['cf-connecting-ip', 'x-real-ip']) {
    const v = (req.headers.get(h) || '').trim();
    if (v && isIp(v)) return v;
  }
  return '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    // Only trust the client IP the edge proxy set — NEVER x-forwarded-for's
    // left-most entry, which the client can spoof (ban-evasion + IP poisoning).
    const ip = trustedClientIp(req);
    if (!ip) return json({ ok: true, ip_banned: false });

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    try {
      const { data: existing } = await admin.from('user_ips')
        .select('hits').eq('user_id', user.id).eq('ip', ip).maybeSingle();
      if (existing) {
        await admin.from('user_ips')
          .update({ last_seen: new Date().toISOString(), hits: existing.hits + 1 })
          .eq('user_id', user.id).eq('ip', ip);
      } else {
        await admin.from('user_ips').insert({ user_id: user.id, ip });
      }
    } catch { /* telemetry must never block */ }

    const { data: ban } = await admin.from('ip_bans').select('ip').eq('ip', ip).maybeSingle();
    return json({ ok: true, ip_banned: !!ban });
  } catch {
    return json({ ok: true, ip_banned: false }); // fail-open
  }
});
