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
  trustedSupabaseUrl: string | undefined;
  trustedMediaUrl?: string | undefined;
  loadSource(table: string, id: string): Promise<SourceRow | null>;
  resolveModerationImage(raw: string): Promise<string | null>;
  moderate(input: unknown[]): Promise<unknown>;
  quarantine(args: QuarantineArgs): Promise<{ data: boolean | null; error: unknown }>;
  log?: (event: { outcome: string; attempt: number }) => void;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

export function validateModerationImageUrl(
  raw: unknown,
  trustedSupabaseUrl: string | undefined,
  trustedMediaUrl?: string | undefined,
): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const candidate = new URL(raw);
    if (candidate.protocol !== 'https:' || candidate.username || candidate.password) return null;
    const trustedHosts = [trustedSupabaseUrl, trustedMediaUrl]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map((value) => new URL(value))
      .filter((value) => value.protocol === 'https:')
      .map((value) => value.hostname);
    if (!trustedHosts.includes(candidate.hostname)) return null;
    if (!/\.(?:avif|gif|jpe?g|png|webp)$/i.test(candidate.pathname)) return null;
    return candidate.href;
  } catch {
    return null;
  }
}

type R2ResolverConfig = {
  trustedSupabaseUrl: string | undefined;
  r2AccountId: string | undefined;
  r2AccessKeyId: string | undefined;
  r2SecretAccessKey: string | undefined;
  r2Bucket: string | undefined;
  signGet(endpoint: string, credentials: { accessKeyId: string; secretAccessKey: string }): Promise<string>;
};

export function createModerationImageResolver(config: R2ResolverConfig) {
  return async (raw: string): Promise<string | null> => {
    const direct = validateModerationImageUrl(raw, config.trustedSupabaseUrl);
    if (direct) return direct;
    const required = [config.r2AccountId, config.r2AccessKeyId, config.r2SecretAccessKey, config.r2Bucket];
    if (required.some((value) => typeof value !== 'string' || value.length === 0) || raw.length > 256) return null;
    const match = /^r2:\/\/post-images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(?:jpe?g|png|webp))$/i.exec(raw);
    if (!match || !/^[a-z0-9]+$/i.test(config.r2AccountId!) || !/^[A-Za-z0-9._-]+$/.test(config.r2Bucket!)) return null;
    const key = `post-images/${match[1]}/${match[2]}`;
    const trustedR2Url = `https://${config.r2AccountId}.r2.cloudflarestorage.com`;
    const endpoint = `${trustedR2Url}/${config.r2Bucket}/${key}?X-Amz-Expires=300`;
    try {
      const signed = await config.signGet(endpoint, {
        accessKeyId: config.r2AccessKeyId!, secretAccessKey: config.r2SecretAccessKey!,
      });
      const parsed = new URL(signed);
      const expiry = Number(parsed.searchParams.get('X-Amz-Expires'));
      if (!Number.isFinite(expiry) || expiry <= 0 || expiry > 300) return null;
      return validateModerationImageUrl(signed, trustedR2Url);
    } catch {
      return null;
    }
  };
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

  const categoryKeys = categoryEntries.map(([name]) => name).sort();
  const scoreKeys = scoreEntries.map(([name]) => name).sort();
  if (categoryKeys.length !== scoreKeys.length || categoryKeys.some((name, index) => name !== scoreKeys[index])) {
    return { outcome: 'uncertain' };
  }

  const categories = categoryEntries.filter(([, enabled]) => enabled).map(([name]) => name);
  if ((!value.flagged && categories.length > 0) || (value.flagged && categories.length === 0)) return { outcome: 'uncertain' };
  const maxScore = Math.max(0, ...categories.map((name) => value.category_scores[name] as number));
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
    const suppliedSecret = req.headers.get('x-moderation-secret') ?? '';
    if (!deps.secret || !suppliedSecret || !constantTimeEqual(suppliedSecret, deps.secret)) {
      return new Response('unauthorized', { status: 401 });
    }
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
      const image = row.image ? await deps.resolveModerationImage(row.image).catch(() => null) : null;
      if (!row.text.trim() && row.image && !image) return json({
        ok: false, outcome: 'unsupported_media', retryable: true, attempt, retry: retryPolicy(attempt, reason),
      }, 503);
      const input: unknown[] = [];
      if (row.text.trim()) input.push({ type: 'text', text: row.text.slice(0, 4000) });
      if (image) input.push({ type: 'image_url', image_url: { url: image } });

      const decision = parseModerationResult(await deps.moderate(input));
      deps.log?.({ outcome: decision.outcome, attempt });
      if (decision.outcome === 'safe' && row.image && !image) return json({
        ok: false, outcome: 'image_unresolved', retryable: true, attempt, retry: retryPolicy(attempt, reason),
      }, 503);
      if (decision.outcome !== 'confirmed') return json({ ok: true, ...decision });

      const { data, error } = await deps.quarantine({
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
      if (data === false) return json({ ok: true, outcome: 'row_gone' });
      if (data !== true) return json({
        ok: false, outcome: 'confirmed', retryable: true, attempt, retry: retryPolicy(attempt, reason),
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
  const [{ createClient }, { AwsClient }] = await Promise.all([
    import('npm:@supabase/supabase-js@2'),
    import('npm:aws4fetch@1.0.20'),
  ]);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const columns: Record<string, { text: string; image?: string }> = {
    posts: { text: 'body', image: 'image_url' },
    post_comments: { text: 'body' },
    stories: { text: 'caption', image: 'image_url' },
  };
  const resolveModerationImage = createModerationImageResolver({
    trustedSupabaseUrl: Deno.env.get('SUPABASE_URL'),
    r2AccountId: Deno.env.get('R2_ACCOUNT_ID'),
    r2AccessKeyId: Deno.env.get('R2_ACCESS_KEY_ID'),
    r2SecretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY'),
    r2Bucket: Deno.env.get('R2_BUCKET'),
    async signGet(endpoint, credentials) {
      const aws = new AwsClient({ ...credentials, service: 's3', region: 'auto' });
      return (await aws.sign(new Request(endpoint, { method: 'GET' }), { aws: { signQuery: true } })).url;
    },
  });
  const handler = createModerationHandler({
    secret: Deno.env.get('MODERATION_SECRET'),
    trustedSupabaseUrl: Deno.env.get('SUPABASE_URL'),
    resolveModerationImage,
    async loadSource(table, id) {
      const src = columns[table];
      const selected = [src.text, ...(src.image ? [src.image] : [])].join(',');
      const { data, error } = await admin.from(table).select(selected).eq('id', id).maybeSingle();
      if (error) throw error;
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
