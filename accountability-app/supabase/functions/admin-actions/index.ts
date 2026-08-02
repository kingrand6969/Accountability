// Supabase Edge Function: admin-actions
//
// Privileged moderation actions for the admin dashboard: warn / restrict / ban /
// unban / clear / remove_content. Called with the admin's own login
// (verify_jwt = true); the function confirms the caller is in `admins` before
// using the service role. A BAN is real — it disables auth-level login so the
// member can't get back in, and can optionally ban their known IPs too.
// remove_content deletes a flagged piece of content (ALWAYS a human decision),
// warns the author with a message quoting it, and adds a strike (5 = ban review).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const DAY = 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set([
  'approve_content', 'remove_content', 'remove_post',
  'ban', 'unban', 'restrict', 'warning', 'clear',
]);

// Public-error contract: responses are fixed allowlisted text. Never forward a
// database message, detail, hint, stack, request payload, or member identifier.
const moderationRpcError = (code?: string) => {
  if (code === 'P0002') return { status: 404, error: 'moderation item not found' };
  if (code === '22023') return { status: 400, error: 'invalid moderation request' };
  if (code === '42501') return { status: 403, error: 'moderation action forbidden' };
  return { status: 500, error: 'moderation action failed' };
};

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

    const { action, user_id, reason, message, days, flag_id, ban_ips, post_id, report_id } =
      await req.json().catch(() => ({}));
    if (typeof action !== 'string' || !ACTIONS.has(action)) return json({ error: 'unknown action' }, 400);
    if (user_id != null && (typeof user_id !== 'string' || !UUID.test(user_id))) {
      return json({ error: 'valid user_id required' }, 400);
    }

    // ── remove_post: a USER-reported post (no flag row) — delete it, warn the
    //    author with a strike, and resolve the report. Same discipline as
    //    remove_content but keyed by an explicit post id from the report. ──
    if (action === 'remove_post') {
      if (typeof report_id !== 'string' || !UUID.test(report_id)) {
        return json({ error: 'valid report_id required' }, 400);
      }
      if (post_id != null && (typeof post_id !== 'string' || !UUID.test(post_id))) {
        return json({ error: 'valid post_id required' }, 400);
      }
      const { data, error } = await admin.rpc('remove_reported_post', {
        p_report: report_id,
        p_admin_actor: user.id,
        p_post_hint: post_id ?? null,
        p_author_hint: user_id ?? null,
        p_reason: typeof reason === 'string' ? reason : null,
        p_message: typeof message === 'string' ? message : null,
      });
      if (error) {
        const safe = moderationRpcError(error.code);
        return json({ error: safe.error }, safe.status);
      }
      return json(data);
    }

    // ── remove_content: delete flagged content + warn author + add a strike ──
    if (action === 'approve_content' || action === 'remove_content') {
      if (typeof flag_id !== 'string' || !UUID.test(flag_id)) {
        return json({ error: 'valid flag_id required' }, 400);
      }
      const { data, error } = await admin.rpc('review_quarantined_content', {
        p_flag: flag_id,
        p_decision: action === 'approve_content' ? 'approve' : 'remove',
        p_admin_actor: user.id,
        p_reason: typeof reason === 'string' ? reason : null,
        p_message: typeof message === 'string' ? message : null,
      });
      if (error) {
        const safe = moderationRpcError(error.code);
        return json({ error: safe.error }, safe.status);
      }
      return json(data);
    }

    // ── account-level sanctions ──────────────────────────────────────────────
    if (!user_id) return json({ error: 'bad input' }, 400);
    if (user_id === user.id) return json({ error: 'you cannot sanction yourself' }, 400);
    const d = Math.max(0, Number(days) || 0);
    const now = new Date().toISOString();
    let expires: string | null = null;

    if (action === 'ban') {
      await admin.auth.admin.updateUserById(user_id, { ban_duration: d > 0 ? `${d * 24}h` : '876000h' });
      await admin.from('profiles').update({ banned_at: now, ban_message: message || null }).eq('id', user_id);
      if (d > 0) expires = new Date(Date.now() + d * DAY).toISOString();
      // optionally block their known network addresses too
      if (ban_ips) {
        const { data: ips } = await admin.from('user_ips').select('ip').eq('user_id', user_id).limit(20);
        for (const row of ips ?? []) {
          await admin.from('ip_bans').upsert(
            { ip: row.ip, reason: `account ban: ${reason || 'rules violation'}`, admin_id: user.id },
            { onConflict: 'ip', ignoreDuplicates: true },
          );
        }
      }
    } else if (action === 'unban') {
      await admin.auth.admin.updateUserById(user_id, { ban_duration: 'none' });
      await admin.from('profiles').update({ banned_at: null, ban_message: null }).eq('id', user_id);
    } else if (action === 'restrict') {
      expires = new Date(Date.now() + Math.max(1, d) * DAY).toISOString();
      await admin.from('profiles').update({ restricted_until: expires, restrict_message: message || null }).eq('id', user_id);
    } else if (action === 'warning') {
      await admin.from('profiles').update({ warning_message: message || null, warned_at: now, warning_ack_at: null }).eq('id', user_id);
    } else if (action === 'clear') {
      await admin.from('profiles').update({
        restricted_until: null, restrict_message: null,
        warning_message: null, warned_at: null, warning_ack_at: null,
      }).eq('id', user_id);
    } else {
      return json({ error: 'unknown action' }, 400);
    }

    await admin.from('user_sanctions').insert({
      user_id, admin_id: user.id, action, reason: reason || null, message: message || null,
      days: d || null, expires_at: expires,
    });
    return json({ ok: true });
  } catch {
    return json({ error: 'internal server error' }, 500);
  }
});
