// Supabase Edge Function: set-location
//
// The ONLY writer allowed to assert a member's leaderboard place (migration
// 0067 blocks clients from setting profiles.city / profiles.country).
//
// The app sends the device's RAW GPS COORDINATES — never a city name — and this
// function reverse-geocodes them server-side, so a client can't claim to be in
// a town it isn't. Changes are rate-limited so nobody hops between leaderboards
// to farm ranks, and every change is written to location_changes for review.
//
// Geocoder: OpenStreetMap Nominatim (free, no key, requires a real User-Agent
// and ~1 req/sec — ample at signup volume). Swap to a paid geocoder here alone
// if volume ever demands it; nothing else needs to change.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// Trusted client IP (edge-proxy header only). x-forwarded-for's left-most entry
// is client-spoofable and MUST NOT be trusted for the change log.
function trustedClientIp(req: Request): string {
  const isIp = (s: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(s) || /^[0-9a-fA-F:]+$/.test(s);
  for (const h of ['cf-connecting-ip', 'x-real-ip']) {
    const v = (req.headers.get(h) || '').trim();
    if (v && isIp(v)) return v;
  }
  return '';
}

// how long a member must stay put before they can rank somewhere else
const COOLDOWN_DAYS = 30;
const CONTACT = 'support@awldesk.com'; // Nominatim asks for a contact in the UA

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { lat, lng } = await req.json().catch(() => ({}));
    const la = Number(lat), ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) {
      return json({ error: 'valid coordinates required' }, 400);
    }

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: profile } = await admin
      .from('profiles')
      .select('city, country, city_set_at, location_flagged')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.location_flagged) {
      return json({ error: 'Your location is under review. Contact support.' }, 403);
    }

    // ── cooldown: you may re-verify the SAME place any time, but moving your
    //    leaderboard to a different city is limited ────────────────────────────
    const setAt = profile?.city_set_at ? new Date(profile.city_set_at).getTime() : 0;
    const daysSince = setAt ? (Date.now() - setAt) / 86400000 : Infinity;

    // ── reverse-geocode server-side ─────────────────────────────────────────
    const geoUrl =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1` +
      `&lat=${encodeURIComponent(String(la))}&lon=${encodeURIComponent(String(ln))}`;
    let city: string | null = null;
    let country: string | null = null;
    try {
      const res = await fetch(geoUrl, {
        headers: { 'User-Agent': `AccountAbility/1.0 (${CONTACT})`, 'Accept-Language': 'en' },
      });
      if (res.ok) {
        const g = await res.json();
        const a = g?.address ?? {};
        city = a.city ?? a.town ?? a.municipality ?? a.village ?? a.city_district ?? a.county ?? null;
        country = a.country ?? null;
      }
    } catch {
      /* handled below */
    }
    if (!city || !country) {
      return json({ error: "We couldn't determine your city from your location. Try again outdoors." }, 422);
    }

    const movingCity = !!profile?.city && profile.city !== city;
    if (movingCity && daysSince < COOLDOWN_DAYS) {
      const wait = Math.ceil(COOLDOWN_DAYS - daysSince);
      return json({
        error:
          `Your leaderboard city can only change every ${COOLDOWN_DAYS} days — ` +
          `${wait} day${wait === 1 ? '' : 's'} to go. This keeps rankings fair.`,
        cooldown_days_left: wait,
      }, 429);
    }

    const ip = trustedClientIp(req) || null;

    await admin.from('profiles').update({
      city,
      country,
      location_verified: true,
      location_lat: la,
      location_lng: ln,
      city_set_at: new Date().toISOString(),
      share_location: true,
    }).eq('id', user.id);

    await admin.from('location_changes').insert({
      user_id: user.id,
      old_city: profile?.city ?? null,
      old_country: profile?.country ?? null,
      new_city: city,
      new_country: country,
      lat: la,
      lng: ln,
      ip,
      source: 'gps',
    });

    return json({ ok: true, city, country, verified: true });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
