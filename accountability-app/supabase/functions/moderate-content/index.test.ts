import assert from 'node:assert/strict';
import test from 'node:test';

import { createModerationHandler, parseModerationResult, retryPolicy } from './index.ts';

const validResult = {
  flagged: true,
  categories: { harassment: true, violence: false },
  category_scores: { harassment: 0.91, violence: 0.1 },
};

test('strictly parses safe and confirmed moderation results', () => {
  assert.deepEqual(parseModerationResult({ ...validResult, flagged: false }), {
    outcome: 'safe', categories: [], maxScore: 0.91,
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
    { ...validResult, category_scores: { harassment: NaN } },
    { ...validResult, category_scores: { harassment: 1.1 } },
    { ...validResult, categories: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`x${i}`, false])) },
  ];
  for (const value of malformed) assert.equal(parseModerationResult(value).outcome, 'uncertain');
});

function request(body: unknown) {
  return new Request('http://localhost', {
    method: 'POST', headers: { 'x-moderation-secret': 'secret' }, body: JSON.stringify(body),
  });
}

function setup(result: unknown = validResult, rpcError: unknown = null) {
  const calls = { source: 0, moderate: 0, rpc: [] as unknown[], logs: [] as unknown[] };
  const handler = createModerationHandler({
    secret: 'secret',
    loadSource: async () => { calls.source++; return { text: 'private content', image: null }; },
    moderate: async () => { calls.moderate++; if (result instanceof Error) throw result; return result; },
    quarantine: async (args) => { calls.rpc.push(args); return rpcError ? { error: rpcError } : { data: true, error: null }; },
    log: (event) => { calls.logs.push(event); },
  });
  return { handler, calls };
}

test('rejects buddy_messages before external calls', async () => {
  const { handler, calls } = setup();
  const response = await handler(request({ table: 'buddy_messages', id: crypto.randomUUID() }));
  assert.equal(response.status, 400);
  assert.deepEqual(calls, { source: 0, moderate: 0, rpc: [], logs: [] });
});

test('safe, uncertain, and moderation errors never quarantine', async () => {
  for (const result of [{ ...validResult, flagged: false }, { flagged: true }, new Error('OpenAI unavailable')]) {
    const { handler, calls } = setup(result);
    const response = await handler(request({ table: 'posts', id: crypto.randomUUID() }));
    assert.equal(response.status, result instanceof Error ? 503 : 200);
    assert.equal(calls.rpc.length, 0);
  }
});

test('confirmed result quarantines once with exact trusted RPC arguments', async () => {
  const { handler, calls } = setup();
  const id = crypto.randomUUID();
  const response = await handler(request({ table: 'post_comments', id, reason: 'manual_report' }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls.rpc, [{
    p_source_table: 'post_comments', p_source_id: id, p_categories: ['harassment'],
    p_max_score: 0.91, p_reason: 'manual_report',
  }]);
});

test('untrusted reason becomes automatic', async () => {
  const { handler, calls } = setup();
  await handler(request({ table: 'stories', id: crypto.randomUUID(), reason: 'invented' }));
  assert.equal((calls.rpc[0] as { p_reason: string }).p_reason, 'automatic');
});

test('database quarantine errors return retryable non-2xx metadata', async () => {
  const { handler } = setup(validResult, new Error('db unavailable'));
  const response = await handler(request({ table: 'posts', id: crypto.randomUUID(), attempt: 2 }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false, outcome: 'confirmed', retryable: true, attempt: 2, retry: { schedule: true, nextAttempt: 3, delaySeconds: 60 },
  });
});

test('retry policy caps automated attempts at three and prioritizes manual reports', () => {
  assert.deepEqual(retryPolicy(1, 'automatic'), { schedule: true, nextAttempt: 2, delaySeconds: 15 });
  assert.deepEqual(retryPolicy(3, 'automatic'), { schedule: false });
  assert.deepEqual(retryPolicy(3, 'manual_report'), { schedule: true, nextAttempt: 4, delaySeconds: 0 });
});

test('logging is bounded metadata and excludes content and API responses', async () => {
  const { handler, calls } = setup();
  await handler(request({ table: 'posts', id: crypto.randomUUID() }));
  assert.deepEqual(calls.logs, [{ outcome: 'confirmed', attempt: 1 }]);
  assert.doesNotMatch(JSON.stringify(calls.logs), /private content|harassment|0\.91/);
});
