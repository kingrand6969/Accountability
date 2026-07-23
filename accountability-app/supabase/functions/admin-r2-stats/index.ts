// Supabase Edge Function: admin-r2-stats
//
// Detailed Cloudflare R2 media usage for the admin dashboard's System tab.
// Reuses the project's existing R2 credentials (same secrets as r2-sign) to
// list the bucket server-side and aggregate: total size, per-folder breakdown,
// largest files, newest uploads, and uploads-per-week. Admin-only — the caller
// must be in `admins` (verified with the service role), same as admin-actions.
// The R2 keys never leave this function.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const MAX_PAGES = 20; // 20 × 1000 keys — far beyond current scale; flags `truncated` past it

type Obj = { key: string; bytes: number; at: string };

function parseList(xml: string): { objs: Obj[]; truncated: boolean; next: string | null } {
  const objs: Obj[] = [];
  for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const c = m[1];
    const key = /<Key>([\s\S]*?)<\/Key>/.exec(c)?.[1] ?? '';
    const bytes = Number(/<Size>(\d+)<\/Size>/.exec(c)?.[1] ?? 0);
    const at = /<LastModified>([\s\S]*?)<\/LastModified>/.exec(c)?.[1] ?? '';
    if (key) objs.push({ key, bytes, at });
  }
  return {
    objs,
    truncated: /<IsTruncated>true<\/IsTruncated>/.test(xml),
    next: /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] ?? null,
  };
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
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: isAdmin } = await admin.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (!isAdmin) return json({ error: 'forbidden — admins only' }, 403);

    const account = Deno.env.get('R2_ACCOUNT_ID');
    const bucket = Deno.env.get('R2_BUCKET');
    if (!account || !bucket) return json({ error: 'R2 not configured' }, 500);
    const aws = new AwsClient({
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
      service: 's3',
      region: 'auto',
    });

    // page through the bucket
    const all: Obj[] = [];
    let token: string | null = null;
    let truncated = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = `list-type=2&max-keys=1000${token ? `&continuation-token=${encodeURIComponent(token)}` : ''}`;
      const res = await aws.fetch(`https://${account}.r2.cloudflarestorage.com/${bucket}?${q}`);
      if (!res.ok) return json({ error: `R2 list failed (${res.status})` }, 502);
      const parsed = parseList(await res.text());
      all.push(...parsed.objs);
      if (!parsed.truncated || !parsed.next) { truncated = false; break; }
      token = parsed.next;
      truncated = true; // stays true only if we exit by hitting MAX_PAGES
    }

    // aggregate
    const folders = new Map<string, { files: number; bytes: number }>();
    let bytes = 0;
    const weekly = Array(8).fill(0);
    const now = Date.now(), wk = 7 * 86400000;
    for (const o of all) {
      bytes += o.bytes;
      const folder = o.key.includes('/') ? o.key.split('/')[0] : '(root)';
      const f = folders.get(folder) ?? { files: 0, bytes: 0 };
      f.files++; f.bytes += o.bytes;
      folders.set(folder, f);
      const idx = Math.floor((now - new Date(o.at).getTime()) / wk);
      if (idx >= 0 && idx < 8) weekly[7 - idx]++;
    }
    const bySize = [...all].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
    const byDate = [...all].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 5);

    return json({
      ok: true,
      bucket,
      public_base: Deno.env.get('R2_PUBLIC_BASE') ?? null,
      objects: all.length,
      bytes,
      folders: [...folders.entries()]
        .map(([name, v]) => ({ name, files: v.files, bytes: v.bytes }))
        .sort((a, b) => b.bytes - a.bytes),
      largest: bySize,
      newest: byDate,
      weekly_uploads: weekly,
      truncated,
    });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
