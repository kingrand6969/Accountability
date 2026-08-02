import assert from 'node:assert/strict';
import test from 'node:test';

import { createModerationHandler, createModerationImageResolver, parseModerationResult, retryPolicy,
  validateModerationImageUrl } from './index.ts';

const validResult = {
  flagged: true,
  categories: { harassment: true, violence: false },
  category_scores: { harassment: 0.91, violence: 0.1 },
};

test('strictly parses safe and confirmed moderation results', () => {
  assert.deepEqual(parseModerationResult({
    ...validResult, flagged: false, categories: { harassment: false, violence: false },
  }), {
    outcome: 'safe', categories: [], maxScore: 0,
  });
  assert.deepEqual(parseModerationResult(validResult), {
    outcome: 'confirmed', categories: ['harassment'], maxScore: 0.91,
  });
});

test('malformed moderation results are uncertain', () => {
  const malformed = [
    null,
    { ...validResult, flagged: 'yes' },
    { ...validResult, categories: { unknown_category: true } },
    { ...validResult, categories: { harassment: 1 } },
    { ...validResult, category_scores: { harassment: -0.01 } },
    { ...validResult, category_scores: { harassment: NaN } },
    { ...validResult, category_scores: { harassment: Infinity } },
    { ...validResult, category_scores: { harassment: 1.1 } },
    { ...validResult, categories: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`x${i}`, false])) },
    { ...validResult, category_scores: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`x${i}`, 0.5])) },
  ];
  for (const value of malformed) assert.equal(parseModerationResult(value).outcome, 'uncertain');
});

test('accepts category score boundaries zero and one', () => {
  assert.deepEqual(parseModerationResult({
    flagged: true,
    categories: { harassment: true, violence: false },
    category_scores: { harassment: 1, violence: 0 },
  }), { outcome: 'confirmed', categories: ['harassment'], maxScore: 1 });
});

test('rejects contradictory or mismatched category maps', () => {
  const cases = [
    { flagged: false, categories: { harassment: true }, category_scores: { harassment: 0.4 } },
    { flagged: true, categories: { harassment: true }, category_scores: {} },
    { flagged: true, categories: { harassment: true }, category_scores: { harassment: 0.4, violence: 0.2 } },
    { flagged: true, categories: { harassment: true, violence: false }, category_scores: { harassment: 0.4 } },
  ];
  for (const value of cases) assert.equal(parseModerationResult(value).outcome, 'uncertain');
});

test('max score is computed only from enabled categories', () => {
  assert.deepEqual(parseModerationResult({
    flagged: true,
    categories: { harassment: true, violence: false },
    category_scores: { harassment: 0.4, violence: 0.99 },
  }), { outcome: 'confirmed', categories: ['harassment'], maxScore: 0.4 });
});

test('accepts only HTTPS images on the exact trusted hostname', () => {
  const trusted = 'https://project.supabase.co';
  assert.equal(validateModerationImageUrl('https://project.supabase.co/storage/v1/object/a.jpg', trusted),
    'https://project.supabase.co/storage/v1/object/a.jpg');
  for (const raw of ['r2://bucket/a.jpg', 'https://evil.example/a.jpg', 'https://project.supabase.co.evil/a.jpg',
    'http://project.supabase.co/a.jpg', 'data:image/png;base64,abc', 'file:///a.jpg', 'not a url',
    'https://project.supabase.co/a.mp4']) assert.equal(validateModerationImageUrl(raw, trusted), null);
});

function request(body: unknown) {
  return new Request('http://localhost', {
    method: 'POST', headers: { 'x-moderation-secret': 'secret' }, body: JSON.stringify(body),
  });
}

function setup(result: unknown = validResult, rpcError: unknown = null, sourceText = 'private content', image: string | null = null,
  secret: string | null = 'secret') {
  const calls = { source: 0, moderate: 0, inputs: [] as unknown[][], rpc: [] as unknown[], logs: [] as unknown[] };
  const handler = createModerationHandler({
    secret: secret ?? undefined, trustedSupabaseUrl: 'https://project.supabase.co',
    loadSource: async () => { calls.source++; return { text: sourceText, image }; },
    resolveModerationImage: async (raw) => validateModerationImageUrl(raw, 'https://project.supabase.co'),
    moderate: async (input) => { calls.moderate++; calls.inputs.push(input); if (result instanceof Error) throw result; return result; },
    quarantine: async (args) => { calls.rpc.push(args); return rpcError ? { error: rpcError } : { data: true, error: null }; },
    log: (event) => { calls.logs.push(event); },
  });
  return { handler, calls };
}

test('rejects buddy_messages before external calls', async () => {
  const { handler, calls } = setup();
  const response = await handler(request({ table: 'buddy_messages', id: crypto.randomUUID() }));
  assert.equal(response.status, 400);
  assert.deepEqual(calls, { source: 0, moderate: 0, inputs: [], rpc: [], logs: [] });
});

test('authentication fails closed for absent configuration and missing, empty, or wrong headers', async () => {
  for (const secret of [null, '']) {
    const { handler } = setup(validResult, null, 'private content', null, secret);
    assert.equal((await handler(request({ table: 'posts', id: crypto.randomUUID() }))).status, 401);
  }
  const { handler, calls } = setup();
  for (const header of [undefined, '', 'wrong']) {
    const headers = new Headers();
    if (header !== undefined) headers.set('x-moderation-secret', header);
    const response = await handler(new Request('http://localhost', { method: 'POST', headers,
      body: JSON.stringify({ table: 'posts', id: crypto.randomUUID() }) }));
    assert.equal(response.status, 401);
  }
  assert.equal(calls.source, 0);
});

test('unsupported images are omitted while text is moderated', async () => {
  for (const image of ['r2://bucket/private.jpg', 'https://project.supabase.co/a.mp4', 'bad']) {
    const { handler, calls } = setup(validResult, null, 'text survives', image);
    await handler(request({ table: 'posts', id: crypto.randomUUID() }));
    assert.equal(calls.moderate, 1);
    assert.deepEqual(calls.inputs[0], [{ type: 'text', text: 'text survives' }]);
  }
});

test('trusted HTTPS image is included in moderation input', async () => {
  let received: unknown[] = [];
  const handler = createModerationHandler({
    secret: 'secret', trustedSupabaseUrl: 'https://project.supabase.co',
    loadSource: async () => ({ text: '', image: 'https://project.supabase.co/a.png' }),
    resolveModerationImage: async (raw) => validateModerationImageUrl(raw, 'https://project.supabase.co'),
    moderate: async (input) => { received = input; return { ...validResult, flagged: false }; },
    quarantine: async () => ({ data: true, error: null }),
  });
  await handler(request({ table: 'stories', id: crypto.randomUUID() }));
  assert.deepEqual(received, [{ type: 'image_url', image_url: { url: 'https://project.supabase.co/a.png' } }]);
});

test('unsupported image-only source is never reported safe', async () => {
  const { handler, calls } = setup(validResult, null, '', 'r2://bucket/private.jpg');
  const response = await handler(request({ table: 'stories', id: crypto.randomUUID() }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).outcome, 'unsupported_media');
  assert.equal(calls.moderate, 0);
  assert.equal(calls.rpc.length, 0);
});

test('safe, uncertain, and moderation errors never quarantine', async () => {
  for (const result of [{ ...validResult, flagged: false }, { flagged: true }, new Error('OpenAI unavailable')]) {
    const { handler, calls } = setup(result);
    const response = await handler(request({ table: 'posts', id: crypto.randomUUID() }));
    assert.equal(response.status, result instanceof Error ? 503 : 200);
    assert.equal(calls.rpc.length, 0);
  }
});

test('confirmed result quarantines once with exact trusted RPC arguments and bounded context', async () => {
  const { handler, calls } = setup();
  const id = crypto.randomUUID();
  const response = await handler(request({ table: 'post_comments', id, reason: 'manual_report' }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls.rpc, [{
    p_source_table: 'post_comments', p_source_id: id, p_categories: ['harassment'],
    p_max_score: 0.91, p_excerpt: 'manual report AI confirmation: private content',
  }]);
});

test('untrusted reason becomes automatic', async () => {
  const { handler, calls } = setup();
  await handler(request({ table: 'stories', id: crypto.randomUUID(), reason: 'invented' }));
  assert.equal((calls.rpc[0] as { p_excerpt: string }).p_excerpt, 'automatic AI confirmation: private content');
});

test('RPC excerpt includes no more than 300 source characters', async () => {
  const { handler, calls } = setup(validResult, null, 'x'.repeat(1000));
  await handler(request({ table: 'posts', id: crypto.randomUUID(), reason: 'attacker-controlled' }));
  assert.equal((calls.rpc[0] as { p_excerpt: string }).p_excerpt,
    `automatic AI confirmation: ${'x'.repeat(300)}`);
});

test('database quarantine errors return retryable non-2xx metadata', async () => {
  const { handler } = setup(validResult, new Error('db unavailable'));
  const response = await handler(request({ table: 'posts', id: crypto.randomUUID(), attempt: 2 }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false, outcome: 'confirmed', retryable: true, attempt: 2, retry: { schedule: true, nextAttempt: 3, delaySeconds: 120 },
  });
});

test('source query errors return retryable non-2xx metadata', async () => {
  const handler = createModerationHandler({
    secret: 'secret', trustedSupabaseUrl: 'https://project.supabase.co',
    loadSource: async () => { throw new Error('query failed'); },
    resolveModerationImage: async () => null,
    moderate: async () => validResult,
    quarantine: async () => ({ data: true, error: null }),
  });
  const response = await handler(request({ table: 'posts', id: crypto.randomUUID(), attempt: 2 }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).retryable, true);
});

test('RPC false means source disappeared and null is retryable', async () => {
  for (const [data, status, outcome] of [[false, 200, 'row_gone'], [null, 503, 'confirmed']] as const) {
    const calls = { rpc: 0 };
    const handler = createModerationHandler({
      secret: 'secret', trustedSupabaseUrl: 'https://project.supabase.co',
      loadSource: async () => ({ text: 'content', image: null }),
      resolveModerationImage: async () => null,
      moderate: async () => validResult,
      quarantine: async () => { calls.rpc++; return { data, error: null }; },
    });
    const response = await handler(request({ table: 'posts', id: crypto.randomUUID() }));
    assert.equal(response.status, status);
    assert.equal((await response.json()).outcome, outcome);
    assert.equal(calls.rpc, 1);
  }
});

test('valid private post image resolves to signed HTTPS and reaches moderation', async () => {
  let signCalls = 0;
  let received: unknown[] = [];
  const resolveModerationImage = createModerationImageResolver({
    trustedSupabaseUrl: 'https://project.supabase.co', r2AccountId: 'abc123', r2AccessKeyId: 'key',
    r2SecretAccessKey: 'secret-key', r2Bucket: 'media',
    signGet: async (endpoint) => { signCalls++; return `${endpoint}&X-Amz-Signature=signed`; },
  });
  const handler = createModerationHandler({
    secret: 'secret', trustedSupabaseUrl: 'https://project.supabase.co', resolveModerationImage,
    loadSource: async () => ({ text: '', image: 'r2://post-images/00000000-0000-4000-8000-000000000000/proof.webp' }),
    moderate: async (input) => { received = input; return validResult; },
    quarantine: async () => ({ data: true, error: null }),
  });
  await handler(request({ table: 'posts', id: crypto.randomUUID() }));
  assert.equal(signCalls, 1);
  assert.match(JSON.stringify(received), /abc123\.r2\.cloudflarestorage\.com/);
});

test('resolver failure plus text-safe is retryable and never quarantines', async () => {
  let quarantines = 0;
  const handler = createModerationHandler({
    secret: 'secret', trustedSupabaseUrl: 'https://project.supabase.co',
    loadSource: async () => ({ text: 'benign text', image: 'r2://post-images/00000000-0000-4000-8000-000000000000/a.jpg' }),
    resolveModerationImage: async () => null,
    moderate: async () => ({ flagged: false, categories: { harassment: false }, category_scores: { harassment: 0 } }),
    quarantine: async () => { quarantines++; return { data: true, error: null }; },
  });
  const response = await handler(request({ table: 'posts', id: crypto.randomUUID() }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).outcome, 'image_unresolved');
  assert.equal(quarantines, 0);
});

test('resolver failure plus text-confirmed can quarantine', async () => {
  const { handler, calls } = setup(validResult, null, 'violating text',
    'r2://post-images/00000000-0000-4000-8000-000000000000/a.jpg');
  const response = await handler(request({ table: 'posts', id: crypto.randomUUID() }));
  assert.equal(response.status, 200);
  assert.equal(calls.rpc.length, 1);
});

test('malicious private refs are rejected without signing and signed URLs are not logged', async () => {
  let signCalls = 0;
  const resolver = createModerationImageResolver({
    trustedSupabaseUrl: 'https://project.supabase.co', r2AccountId: 'abc123', r2AccessKeyId: 'key',
    r2SecretAccessKey: 'secret-key', r2Bucket: 'media',
    signGet: async (endpoint) => { signCalls++; return `${endpoint}&secret=sensitive`; },
  });
  for (const ref of ['r2://post-videos/00000000-0000-4000-8000-000000000000/a.jpg',
    'r2://voice/00000000-0000-4000-8000-000000000000/a.jpg',
    'r2://avatars/00000000-0000-4000-8000-000000000000/a.jpg',
    'r2://covers/00000000-0000-4000-8000-000000000000/a.jpg',
    'r2://post-images/00000000-0000-4000-8000-000000000000/../a.jpg',
    `r2://post-images/00000000-0000-4000-8000-000000000000/${'a'.repeat(300)}.jpg`]) {
    assert.equal(await resolver(ref), null);
  }
  assert.equal(signCalls, 0);
  const logs: unknown[] = [];
  const handler = createModerationHandler({
    secret: 'secret', trustedSupabaseUrl: 'https://project.supabase.co', resolveModerationImage: resolver,
    loadSource: async () => ({ text: 'violation', image: 'r2://post-images/00000000-0000-4000-8000-000000000000/a.jpg' }),
    moderate: async () => validResult, quarantine: async () => ({ data: true, error: null }),
    log: (event) => logs.push(event),
  });
  await handler(request({ table: 'posts', id: crypto.randomUUID() }));
  assert.doesNotMatch(JSON.stringify(logs), /Signature|sensitive|cloudflarestorage/);
});

test('missing R2 credentials reject private refs without signing', async () => {
  let signCalls = 0;
  const resolver = createModerationImageResolver({
    trustedSupabaseUrl: 'https://project.supabase.co', r2AccountId: 'abc123', r2AccessKeyId: '',
    r2SecretAccessKey: 'secret-key', r2Bucket: 'media',
    signGet: async () => { signCalls++; return 'https://never.example/a.jpg?X-Amz-Expires=300'; },
  });
  assert.equal(await resolver('r2://post-images/00000000-0000-4000-8000-000000000000/a.jpg'), null);
  assert.equal(signCalls, 0);
});

test('thrown resolver failure with text-safe remains retryable', async () => {
  const handler = createModerationHandler({
    secret: 'secret', trustedSupabaseUrl: 'https://project.supabase.co',
    loadSource: async () => ({ text: 'benign', image: 'r2://post-images/00000000-0000-4000-8000-000000000000/a.jpg' }),
    resolveModerationImage: async () => { throw new Error('signing unavailable'); },
    moderate: async () => ({ flagged: false, categories: { harassment: false }, category_scores: { harassment: 0 } }),
    quarantine: async () => ({ data: true, error: null }),
  });
  const response = await handler(request({ table: 'posts', id: crypto.randomUUID() }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).outcome, 'image_unresolved');
});

test('retry policy caps automated attempts at three and prioritizes manual reports', () => {
  assert.deepEqual(retryPolicy(1, 'automatic'), { schedule: true, nextAttempt: 2, delaySeconds: 30 });
  assert.deepEqual(retryPolicy(2, 'automatic'), { schedule: true, nextAttempt: 3, delaySeconds: 120 });
  assert.deepEqual(retryPolicy(1, 'manual_report'), { schedule: true, nextAttempt: 2, delaySeconds: 5 });
  assert.deepEqual(retryPolicy(2, 'manual_report'), { schedule: true, nextAttempt: 3, delaySeconds: 30 });
  assert.deepEqual(retryPolicy(3, 'automatic'), { schedule: false });
  assert.deepEqual(retryPolicy(3, 'manual_report'), { schedule: false });
});

test('malformed moderation output never calls quarantine', async () => {
  const { handler, calls } = setup({
    flagged: true, categories: { harassment: 'true' }, category_scores: { harassment: 0.9 },
  });
  const response = await handler(request({ table: 'posts', id: crypto.randomUUID() }));
  assert.equal(response.status, 200);
  assert.equal(calls.rpc.length, 0);
});

test('logging is bounded metadata and excludes content and API responses', async () => {
  const { handler, calls } = setup();
  await handler(request({ table: 'posts', id: crypto.randomUUID() }));
  assert.deepEqual(calls.logs, [{ outcome: 'confirmed', attempt: 1 }]);
  assert.doesNotMatch(JSON.stringify(calls.logs), /private content|harassment|0\.91/);
});
