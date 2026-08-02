// Supabase Edge Function: moderate-content
// AI-confirmed violations are hidden and flagged atomically by the service-only RPC.

export type ModerationDecision =
  | { outcome: 'safe'; categories: string[]; maxScore: number }
  | { outcome: 'confirmed'; categories: string[]; maxScore: number }
  | { outcome: 'uncertain' };

const SOURCES = new Set(['posts', 'post_comments', 'stories']);
const CATEGORY_NAMES = new Set([
  'sexual', 'sexual/minors', 'harassment', 'harassment/threatening',
  'hate', 'hate/threatening', 'illicit', 'illicit/violent',
  'self-harm', 'self-harm/intent', 'self-harm/instructions',
  'violence', 'violence/graphic',
]);

type SourceRow = { text: string; image: string | null };
type QuarantineArgs = {
  p_source_table: string;
  p_source_id: string;
  p_categories: string[];
  p_max_score: number;
  p_excerpt: string;
};
type Dependencies = {
  secret: string | undefined;
  loadSource(table: string, id: string): Promise<SourceRow | null>;
  moderate(input: unknown[]): Promise<unknown>;
  quarantine(args: QuarantineArgs): Promise<{ data?: unknown; error: unknown }>;
  log?: (event: { outcome: string; attempt: number }) => void;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseModerationResult(value: unknown): ModerationDecision {
  if (!record(value) || typeof value.flagged !== 'boolean' ||
      !record(value.categories) || !record(value.category_scores)) return { outcome: 'uncertain' };
  const categoryEntries = Object.entries(value.categories);
  const scoreEntries = Object.entries(value.category_scores);
  if (categoryEntries.length > 64 || scoreEntries.length > 64 ||
      categoryEntries.some(([name, enabled]) => !CATEGORY_NAMES.has(name) || typeof enabled !== 'boolean') ||
      scoreEntries.some(([name, score]) => !CATEGORY_NAMES.has(name) || typeof score !== 'number' ||
        !Number.isFinite(score) || score < 0 || score > 1)) return { outcome: 'uncertain' };

  const categories = categoryEntries.filter(([, enabled]) => enabled).map(([name]) => name);
  const maxScore = Math.max(0, ...scoreEntries.map(([, score]) => score as number));
  if (value.flagged && categories.length === 0) return { outcome: 'uncertain' };
  return { outcome: value.flagged ? 'confirmed' : 'safe', categories: value.flagged ? categories : [], maxScore };
}

export function retryPolicy(attempt: number, reason: 'automatic' | 'manual_report') {
  const current = Number.isInteger(attempt) && attempt > 0 ? attempt : 1;
  if (current >= 3) return { schedule: false as const };
  const delaySeconds = reason === 'manual_report'
    ? (current === 1 ? 5 : 30)
    : (current === 1 ? 30 : 120);
  return { schedule: true as const, nextAttempt: current + 1, delaySeconds };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function createModerationHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.headers.get('x-moderation-secret') !== deps.secret) return new Response('unauthorized', { status: 401 });
    const body = await req.json().catch(() => null);
    if (!record(body) || typeof body.table !== 'string' || !SOURCES.has(body.table) || typeof body.id !== 'string') {
      return json({ ok: false, reason: 'bad input' }, 400);
    }
    const reason = body.reason === 'manual_report' ? 'manual_report' : 'automatic';
    const attempt = Number.isInteger(body.attempt) && (body.attempt as number) > 0 ? body.attempt as number : 1;
    try {
      const row = await deps.loadSource(body.table, body.id);
      if (!row) return json({ ok: true, outcome: 'safe', reason: 'row gone' });
      if (!row.text.trim() && !row.image) return json({ ok: true, outcome: 'safe', reason: 'nothing to check' });
      const input: unknown[] = [];
      if (row.text.trim()) input.push({ type: 'text', text: row.text.slice(0, 4000) });
      if (row.image) input.push({ type: 'image_url', image_url: { url: row.image } });

      const decision = parseModerationResult(await deps.moderate(input));
      deps.log?.({ outcome: decision.outcome, attempt });
      if (decision.outcome !== 'confirmed') return json({ ok: true, ...decision });

      const { error } = await deps.quarantine({
        p_source_table: body.table,
        p_source_id: body.id,
        p_categories: decision.categories,
        p_max_score: decision.maxScore,
        p_excerpt: `${reason === 'manual_report' ? 'manual report' : 'automatic'} AI confirmation: ${row.text.slice(0, 300)}`,
      });
      if (error) return json({
        ok: false, outcome: 'confirmed', retryable: true, attempt,
        retry: retryPolicy(attempt, reason),
      }, 503);
      return json({ ok: true, outcome: 'confirmed', categories: decision.categories });
    } catch {
      deps.log?.({ outcome: 'error', attempt });
      return json({ ok: false, outcome: 'error', retryable: true, attempt, retry: retryPolicy(attempt, reason) }, 503);
    }
  };
}

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): void;
} | undefined;

if (typeof Deno !== 'undefined') {
  const { createClient } = await import('npm:@supabase/supabase-js@2');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const columns: Record<string, { text: string; image?: string }> = {
    posts: { text: 'body', image: 'image_url' },
    post_comments: { text: 'body' },
    stories: { text: 'caption', image: 'image_url' },
  };
  const handler = createModerationHandler({
    secret: Deno.env.get('MODERATION_SECRET'),
    async loadSource(table, id) {
      const src = columns[table];
      const selected = [src.text, ...(src.image ? [src.image] : [])].join(',');
      const { data } = await admin.from(table).select(selected).eq('id', id).maybeSingle();
      if (!data) return null;
      const row = data as Record<string, string | null>;
      return { text: row[src.text] ?? '', image: src.image ? row[src.image] ?? null : null };
    },
    async moderate(input) {
      const key = Deno.env.get('OPENAI_API_KEY');
      if (!key) throw new Error('moderation unavailable');
      const response = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'omni-moderation-latest', input }),
      });
      if (!response.ok) throw new Error('moderation unavailable');
      const payload: unknown = await response.json();
      return record(payload) && Array.isArray(payload.results) ? payload.results[0] : undefined;
    },
    quarantine: (args) => admin.rpc('quarantine_moderated_content', args),
  });
  Deno.serve(handler);
}
