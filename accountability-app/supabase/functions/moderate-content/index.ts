// Supabase Edge Function: moderate-content
//
// Called in the background by a DB trigger (pg_net) after a post/comment/story/
// message is created. Reads the new row, runs OpenAI's FREE moderation over its
// text (and image, when present), and — if flagged — files a row in
// moderation_flags for the admin to review. It NEVER edits or deletes content.
//
// FAIL-OPEN: if OPENAI_API_KEY isn't set (or OpenAI errors), it returns 200 and
// does nothing — a user's post is never blocked by moderation.
//
// Auth: the trigger sends a shared secret in `x-moderation-secret`; the function
// rejects anything else. Deploy with verify_jwt = false.
//
// Secrets: MODERATION_SECRET (shared with the DB), OPENAI_API_KEY (the founder's).
import { createClient } from 'npm:@supabase/supabase-js@2';

// where each table keeps its text, image, and author columns
const SOURCES: Record<string, { text: string; image?: string; author: string }> = {
  posts: { text: 'body', image: 'image_url', author: 'user_id' },
  post_comments: { text: 'body', author: 'user_id' },
  stories: { text: 'caption', image: 'image_url', author: 'user_id' },
  buddy_messages: { text: 'body', author: 'sender' },
};

Deno.serve(async (req) => {
  try {
    if (req.headers.get('x-moderation-secret') !== Deno.env.get('MODERATION_SECRET')) {
      return new Response('unauthorized', { status: 401 });
    }
    const { table, id } = await req.json().catch(() => ({}));
    const src = SOURCES[table as string];
    if (!src || !id) return json({ ok: false, reason: 'bad input' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const cols = [src.text, src.author, ...(src.image ? [src.image] : [])].join(',');
    const { data: row } = await admin.from(table).select(cols).eq('id', id).maybeSingle();
    if (!row) return json({ ok: true, reason: 'row gone' });

    const text: string = (row as Record<string, string>)[src.text] ?? '';
    const image: string | null = src.image ? ((row as Record<string, string>)[src.image] ?? null) : null;
    const author: string | null = (row as Record<string, string>)[src.author] ?? null;
    if (!text.trim() && !image) return json({ ok: true, reason: 'nothing to check' });

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return json({ ok: true, reason: 'moderation off (no OPENAI_API_KEY)' }); // fail-open

    // Build the moderation input (text + optional image).
    const input: unknown[] = [];
    if (text.trim()) input.push({ type: 'text', text: text.slice(0, 4000) });
    if (image) input.push({ type: 'image_url', image_url: { url: image } });

    const mod = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'omni-moderation-latest', input }),
    });
    if (!mod.ok) return json({ ok: true, reason: `openai ${mod.status}` }); // fail-open
    const result = (await mod.json())?.results?.[0];
    if (!result?.flagged) return json({ ok: true, flagged: false });

    const categories = Object.entries(result.categories ?? {})
      .filter(([, v]) => v === true)
      .map(([k]) => k);
    const maxScore = Math.max(0, ...Object.values((result.category_scores ?? {}) as Record<string, number>));

    await admin.from('moderation_flags').insert({
      source_table: table,
      source_id: id,
      author_id: author,
      excerpt: text ? text.slice(0, 300) : null,
      image_url: image,
      categories,
      max_score: maxScore,
    });
    return json({ ok: true, flagged: true, categories });
  } catch (e) {
    return json({ ok: true, error: String((e as Error).message ?? e) }); // fail-open
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
