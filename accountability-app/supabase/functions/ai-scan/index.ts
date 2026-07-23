// Supabase Edge Function: ai-scan
//
// Photo → structured data, for two Pro features:
//   kind:'food'    → calories + macros for a meal photo (feeds the Diet log)
//   kind:'receipt' → merchant, date, total (feeds a money transaction)
//
// COST DISCIPLINE (this is billed, unlike moderation):
//   * Pro is checked HERE against profiles — a client claiming Pro gets 403.
//   * 20 scans per kind per calendar month, counted HERE in ai_scans — a client
//     claiming a low count gets 429.
//   * The quota row is written BEFORE the OpenAI call, so a crash mid-call can
//     never hand out free retries.
//   * The app downscales images before upload, so each scan is a few tenths of
//     a cent.
// Without OPENAI_API_KEY the function refuses cleanly (no charge, no crash).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const MONTHLY_LIMIT = 20;
const MODEL = Deno.env.get('OPENAI_VISION_MODEL') ?? 'gpt-4o-mini';
const MAX_IMAGE_CHARS = 8_000_000; // ~6MB of base64 — the app sends far less

const FOOD_PROMPT = `You are a nutrition estimator. Look at the food in this photo and return JSON only:
{"items":[{"name":string,"grams":number,"kcal":number,"protein":number,"carbs":number,"fat":number}],"note":string}
Rules: list each distinct food you can see. Estimate a realistic portion in grams from visual cues
(plate size, utensils). kcal/protein/carbs/fat are for THAT portion, not per 100g. Round to whole numbers.
"note" = one short sentence on your confidence and what you assumed. If the photo is not food,
return {"items":[],"note":"No food detected."}`;

const RECEIPT_PROMPT = `You read receipts. Return JSON only:
{"merchant":string|null,"date":string|null,"total":number|null,"currency":string|null,"category":string,"note":string}
"date" must be YYYY-MM-DD if visible, else null. "total" is the final amount paid as a number
(no currency symbol). "category" must be one of: food, transport, shopping, bills, health,
entertainment, other. "note" = one short sentence on anything unclear. If it is not a receipt,
return {"merchant":null,"date":null,"total":null,"currency":null,"category":"other","note":"Not a receipt."}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { kind, image } = await req.json().catch(() => ({}));
    if (kind !== 'food' && kind !== 'receipt') return json({ error: 'bad kind' }, 400);
    if (typeof image !== 'string' || image.length < 100) return json({ error: 'image required' }, 400);
    if (image.length > MAX_IMAGE_CHARS) return json({ error: 'image too large' }, 413);

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return json({ error: 'Scanning is not switched on yet.' }, 503);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── Pro gate (server-side truth, honouring trial expiry) ────────────────
    const { data: profile } = await admin
      .from('profiles')
      .select('is_pro, pro_until')
      .eq('id', user.id)
      .maybeSingle();
    const proActive =
      !!profile?.is_pro && (!profile.pro_until || new Date(profile.pro_until) > new Date());
    if (!proActive) return json({ error: 'Scanning is a Pro feature.', upgrade: true }, 403);

    // ── monthly quota (server-side count, not a client claim) ───────────────
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { count } = await admin
      .from('ai_scans')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('kind', kind)
      .gte('created_at', monthStart.toISOString());
    const used = count ?? 0;
    if (used >= MONTHLY_LIMIT) {
      return json({
        error: `You've used all ${MONTHLY_LIMIT} ${kind} scans this month. Your allowance resets on the 1st.`,
        used,
        limit: MONTHLY_LIMIT,
      }, 429);
    }

    // Reserve the scan BEFORE spending money, so a failure can't be retried free.
    await admin.from('ai_scans').insert({ user_id: user.id, kind });

    // ── vision call ─────────────────────────────────────────────────────────
    const dataUrl = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: 'json_object' },
        max_tokens: 700,
        messages: [
          { role: 'system', content: kind === 'food' ? FOOD_PROMPT : RECEIPT_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: kind === 'food' ? 'Estimate this meal.' : 'Read this receipt.' },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return json({ error: 'The scanner is busy right now — please try again.', detail: detail.slice(0, 200) }, 502);
    }
    const out = await res.json();
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(out?.choices?.[0]?.message?.content ?? '{}');
    } catch {
      return json({ error: "We couldn't read that photo. Try a clearer, well-lit shot." }, 422);
    }

    return json({ ok: true, kind, result: parsed, used: used + 1, limit: MONTHLY_LIMIT });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
