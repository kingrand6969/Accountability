import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import {
  composeDraftIndexKey,
  composeDraftKey,
  draftEffect,
  durableMediaPath,
  isCompatibleDraft,
  parseComposeDraft,
  persistDurableMedia,
  saveComposeDraft,
  selectDraftCleanupTarget,
  loadComposeDrafts,
  clearComposeDraft,
  commitDraftMedia,
  removeDraftMedia,
  cleanupOwnerDrafts,
  cleanupOrphanTemps,
  runForCurrentOwner,
  completeRemoteSubmission,
  restoreForCurrentOwner,
  persistDraftMedia,
  resolveDraftContext,
  validMediaTuple,
  type ComposeDraftV1,
  type DraftFileAdapter,
} from './composeDraft';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DRAFT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const validDraft: ComposeDraftV1 = {
  version: 1,
  draftId: DRAFT,
  ownerId: OWNER,
  kind: 'new',
  editingId: null,
  origin: 'photo',
  queryIdentity: { photo: true, event: false, text: null, edit: null },
  body: 'hello',
  audience: 'buddies',
  media: null,
  event: { open: false, title: '', date: '2026-07-29', time: '18:00', location: '' },
  tagIds: [],
  keepInMemories: false,
  updatedAt: '2026-07-29T00:00:00.000Z',
};

describe('compose draft contract', () => {
  test('uses versioned per-user keys and round-trips a valid draft', () => {
    expect(composeDraftKey('user-a', 'new', 'draft-1')).toBe('compose-draft:v1:user-a:new:draft-1');
    expect(composeDraftIndexKey('user-a')).toBe('compose-draft-index:v1:user-a');
    expect(parseComposeDraft(JSON.stringify(validDraft), OWNER)).toEqual(validDraft);
  });

  test('rejects corrupt, unsupported and cross-owner records', () => {
    expect(parseComposeDraft('{broken', OWNER)).toBeNull();
    expect(parseComposeDraft(JSON.stringify({ ...validDraft, version: 2 }), OWNER)).toBeNull();
    expect(parseComposeDraft(JSON.stringify({ ...validDraft, ownerId: DRAFT }), OWNER)).toBeNull();
  });

  test('normalizes precedence and requires exact initiating identity', () => {
    const edit = resolveDraftContext({ edit: 'p1', event: '1', photo: '1', text: 'x' });
    expect(edit.kind).toBe('edit');
    expect(resolveDraftContext({ event: '1', photo: '1', text: 'x' }).origin).toBe('event');
    expect(resolveDraftContext({ photo: '1', text: 'x' }).origin).toBe('photo');
    expect(resolveDraftContext({ text: 'x' }).origin).toBe('post');
    expect(isCompatibleDraft({ ...validDraft, ...edit, ownerId: OWNER }, { ...edit, ownerId: OWNER })).toBe(true);
    expect(isCompatibleDraft({ ...validDraft, ...edit, ownerId: OWNER }, { ...edit, editingId: 'p2', queryIdentity: { ...edit.queryIdentity, edit: 'p2' }, ownerId: OWNER })).toBe(false);
    expect(isCompatibleDraft(validDraft, { ...resolveDraftContext({ event: '1' }), ownerId: OWNER })).toBe(false);
  });

  test('maps every lifecycle trigger to its exact effect', () => {
    expect([
      'field-change', 'background', 'process-recovery', 'explicit-cancel',
      'successful-post', 'successful-edit', 'hardware-back', 'upload-error', 'account-switch',
    ].map((trigger) => draftEffect(trigger as Parameters<typeof draftEffect>[0]))).toEqual([
      'save', 'save', 'save', 'clear', 'clear', 'clear', 'keep', 'keep', 'detach',
    ]);
  });

  test('maintains an isolated owner index for save/load/clear', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => { values.set(key, value); },
      removeItem: async (key: string) => { values.delete(key); },
    };
    await saveComposeDraft(validDraft, storage);
    expect(JSON.parse(values.get(composeDraftIndexKey(OWNER))!)).toEqual([composeDraftKey(OWNER, 'new', DRAFT)]);
    expect((await loadComposeDrafts(OWNER, storage)).drafts).toEqual([validDraft]);
    expect((await loadComposeDrafts(DRAFT, storage)).drafts).toEqual([]);
    await clearComposeDraft(validDraft, storage);
    expect((await loadComposeDrafts(OWNER, storage)).drafts).toEqual([]);
  });

  test('reports and clears corrupt or unsupported indexed records', async () => {
    const storage = memoryStorage(new Map([
      [composeDraftIndexKey(OWNER), JSON.stringify([composeDraftKey(OWNER, 'new', DRAFT)])],
      [composeDraftKey(OWNER, 'new', DRAFT), '{broken'],
    ]));
    expect(await loadComposeDrafts(OWNER, storage)).toEqual({ drafts: [], cleanedInvalid: 1 });
  });

  test('reconciles a record left unindexed by an index-write crash without scanning another owner', async () => {
    const values = new Map<string, string>();
    let failed = false;
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        if (key === composeDraftIndexKey(OWNER) && !failed) { failed = true; throw new Error('index crash'); }
        values.set(key, value);
      },
      removeItem: async (key: string) => { values.delete(key); },
    };
    await expect(saveComposeDraft(validDraft, storage)).rejects.toThrow('index crash');
    expect(values.get(composeDraftKey(OWNER, 'new', DRAFT))).toBe(JSON.stringify(validDraft));
    expect((await loadComposeDrafts(OWNER, storage)).drafts).toEqual([validDraft]);
    expect(await storage.getItem(composeDraftIndexKey(DRAFT))).toBeNull();
  });

  test('serializes overlapping owner saves so both remain indexed and cleanup completes', async () => {
    const secondId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const values = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        await Promise.resolve();
        values.set(key, value);
      },
      removeItem: async (key: string) => { values.delete(key); },
    };
    await Promise.all([
      saveComposeDraft(validDraft, storage),
      saveComposeDraft({ ...validDraft, draftId: secondId, body: 'second' }, storage),
    ]);
    expect((await loadComposeDrafts(OWNER, storage)).drafts.map((draft) => draft.draftId).sort())
      .toEqual([DRAFT, secondId].sort());
    expect(await cleanupOwnerDrafts(OWNER, storage, mockAdapter())).toBe(2);
    expect(values.size).toBe(0);
  });

  test('stale prompt callbacks cannot mutate a new owner', async () => {
    let current = OWNER;
    const calls: string[] = [];
    const captured = current;
    current = DRAFT;
    expect(await runForCurrentOwner(captured, () => current, async () => { calls.push('mutated'); })).toBe(false);
    expect(calls).toEqual([]);
    expect(await runForCurrentOwner(DRAFT, () => current, async () => { calls.push('b'); })).toBe(true);
  });

  test('deferred restore media read cannot mutate or notify a switched account', async () => {
    let current = OWNER;
    let resolveRead!: (value: string) => void;
    const read = new Promise<string>((resolve) => { resolveRead = resolve; });
    const applied: string[] = [];
    const notices: string[] = [];
    const restoring = restoreForCurrentOwner(
      OWNER,
      () => current,
      async () => ({ body: await read }),
      (prepared) => { applied.push(prepared.body); },
      (message) => { notices.push(message); },
    );
    current = DRAFT;
    resolveRead('owner-a-media');
    expect(await restoring).toBe(false);
    expect(applied).toEqual([]);
    expect(notices).toEqual([]);
  });

  test('separates remote success from local cleanup failure', async () => {
    const result = await completeRemoteSubmission(async () => 'post-1', async () => { throw new Error('storage'); });
    expect(result).toEqual({ remoteSucceeded: true, value: 'post-1', cleanupError: 'storage' });
  });

  test('explicit null submitted snapshot never falls through to a switched owner draft', () => {
    const ownerBDraft = { ...validDraft, ownerId: DRAFT, draftId: OWNER };
    expect(selectDraftCleanupTarget(null, ownerBDraft, ownerBDraft)).toBeNull();
    expect(selectDraftCleanupTarget(undefined, ownerBDraft, null)).toBe(ownerBDraft);
  });
});

describe('Compose production binding', () => {
  const source = readFileSync(require.resolve('../app/compose'), 'utf8');

  test('binds debounced field saves and immediate background flush', () => {
    expect(source).toContain('setTimeout(() => { void flushDraft(); }, 500)');
    expect(source).toContain("if (state !== 'active') void flushDraft()");
  });

  test('binds owner-guarded Restore and Discard plus truthful notices', () => {
    expect(source).toContain('runForCurrentOwner(promptOwner, () => ownerRef.current');
    expect(source).toContain('Draft could not be saved');
    expect(source).toContain('A corrupt or unsupported saved draft was removed');
  });

  test('guards edit hydration and separates remote success cleanup', () => {
    expect(source).toContain('await editHydrationRef.current');
    expect(source).toContain('restoreChosenRef.current) return');
    expect(source).toContain('completeRemoteSubmission');
    expect(source).toContain('Only local draft cleanup failed; do not submit again.');
  });

  test('detaches all live media and draft state on account switch', () => {
    expect(source).toContain('draftRef.current = null');
    expect(source).toContain('setDraftMedia(null)');
    expect(source).toContain('setOwnerId(nextOwner)');
  });
});

describe('durable media path and transaction', () => {
  const invalidIds = [
    '', '..', '../x', 'a/b', 'a\\b', '/absolute', 'file://evil', 'CON',
    `bad\0id`, 'bad\u0001id', 'bad\u2028id', 'A'.repeat(37), 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
  ];

  test('allows canonical UUIDs and approved extensions under document', () => {
    expect(durableMediaPath('file:///document', OWNER, DRAFT, 'a'.repeat(64), 'JpEg')).toEqual({
      directory: `file:///document/compose-drafts/${OWNER}/${DRAFT}`,
      temporary: `file:///document/compose-drafts/${OWNER}/${DRAFT}/${'a'.repeat(64)}.jpeg.tmp`,
      final: `file:///document/compose-drafts/${OWNER}/${DRAFT}/${'a'.repeat(64)}.jpeg`,
    });
  });

  test('allows WebM only as a video/webm durable tuple and path', () => {
    expect(validMediaTuple('webm', 'video/webm', 'video')).toBe(true);
    expect(validMediaTuple('webm', 'video/mp4', 'video')).toBe(false);
    expect(durableMediaPath('file:///document', OWNER, DRAFT, 'a'.repeat(64), 'webm').final)
      .toBe(`file:///document/compose-drafts/${OWNER}/${DRAFT}/${'a'.repeat(64)}.webm`);
  });

  test('accepts the complete WebM EBML signature and rejects a partial signature', async () => {
    const valid = mockAdapter({ prefix: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]) });
    await expect(persistDurableMedia({
      ownerId: OWNER, draftId: DRAFT, sourceUri: 'content://ok', extension: 'webm',
      expectedBytes: 2, maxBytes: 10, mimeType: 'video/webm', kind: 'video',
    }, valid)).resolves.toMatchObject({ uri: expect.stringMatching(/\.webm$/), byteCount: 2 });

    const partial = mockAdapter({ prefix: new Uint8Array([0x1a, 0x45, 0xdf]) });
    await expect(persistDurableMedia({
      ownerId: OWNER, draftId: DRAFT, sourceUri: 'content://ok', extension: 'webm',
      expectedBytes: 2, maxBytes: 10, mimeType: 'video/webm', kind: 'video',
    }, partial)).rejects.toThrow('does not match its contents');
  });

  test.each(invalidIds)('rejects unsafe owner %p before adapter use', async (owner) => {
    const adapter = mockAdapter();
    await expect(persistDurableMedia({ ownerId: owner, draftId: DRAFT, sourceUri: 'content://ok', extension: 'jpg', expectedBytes: 2, maxBytes: 10 }, adapter))
      .rejects.toThrow('Invalid media path');
    expect(adapter.calls).toEqual([]);
  });

  test.each(invalidIds)('rejects unsafe draft id %p before adapter use', async (draftId) => {
    const adapter = mockAdapter();
    await expect(persistDurableMedia({ ownerId: OWNER, draftId, sourceUri: 'content://ok', extension: 'jpg', expectedBytes: 2, maxBytes: 10 }, adapter))
      .rejects.toThrow('Invalid media path');
    expect(adapter.calls).toEqual([]);
  });

  test.each(['', '..', 'exe', 'jpg/evil', '.jpg', 'jpg\u2028'])('rejects extension %p before adapter use', async (extension) => {
    const adapter = mockAdapter();
    await expect(persistDurableMedia({ ownerId: OWNER, draftId: DRAFT, sourceUri: 'content://ok', extension, expectedBytes: 2, maxBytes: 10 }, adapter))
      .rejects.toThrow('Invalid media path');
    expect(adapter.calls).toEqual([]);
  });

  test('copies to temp, verifies size/readability, then atomically replaces final', async () => {
    const adapter = mockAdapter({ prefix: new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70]) });
    const result = await persistDurableMedia({ ownerId: OWNER, draftId: DRAFT, sourceUri: 'content://ok', extension: 'mp4', expectedBytes: 2, maxBytes: 10, mimeType: 'video/mp4', kind: 'video' }, adapter);
    expect(result.byteCount).toBe(2);
    expect(adapter.calls.map(([name]) => name)).toEqual(['list', 'available', 'prefix', 'hash', 'mkdir', 'copy', 'size', 'read', 'move']);
    expect(adapter.calls.at(-1)?.slice(1)).toEqual([expect.stringMatching(/\.tmp$/), expect.stringMatching(/\.mp4$/), true]);
  });

  test.each([
    ['zero byte', { size: 0 }, 'empty'],
    ['size mismatch', { size: 1 }, 'changed'],
    ['size limit', { size: 11 }, 'too large'],
    ['insufficient space', { available: 1 }, 'space'],
    ['unreadable', { readable: false }, 'read'],
  ])('rejects %s, cleans temp and never replaces prior final', async (_name, options, message) => {
    const adapter = mockAdapter(options);
    await expect(persistDurableMedia({ ownerId: OWNER, draftId: DRAFT, sourceUri: 'content://ok', extension: 'jpg', expectedBytes: 2, maxBytes: 10, mimeType: 'image/jpeg', kind: 'photo' }, adapter))
      .rejects.toThrow(message);
    if (_name !== 'insufficient space') expect(adapter.calls.some(([name]) => name === 'delete')).toBe(true);
    expect(adapter.calls.some(([name]) => name === 'move')).toBe(false);
  });

  test('cleans temp after a copy failure and preserves the existing final', async () => {
    const adapter = mockAdapter({ copyError: true, prefix: new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70]) });
    await expect(persistDurableMedia({ ownerId: OWNER, draftId: DRAFT, sourceUri: 'content://ok', extension: 'mov', expectedBytes: 2, maxBytes: 10, mimeType: 'video/quicktime', kind: 'video' }, adapter))
      .rejects.toThrow('copy');
    expect(adapter.calls.map(([name]) => name)).toEqual(['list', 'available', 'prefix', 'hash', 'mkdir', 'copy', 'delete']);
  });

  test('cleans temp after atomic move failure', async () => {
    const adapter = mockAdapter({ moveError: true });
    await expect(persistDurableMedia({ ownerId: OWNER, draftId: DRAFT, sourceUri: 'content://ok', extension: 'jpg', expectedBytes: 2, maxBytes: 10, mimeType: 'image/jpeg', kind: 'photo' }, adapter)).rejects.toThrow('move');
    expect(adapter.calls.map(([name]) => name).slice(-2)).toEqual(['move', 'delete']);
  });

  test('rejects spoofed MIME/extension/magic before hashing or copying', async () => {
    const adapter = mockAdapter();
    adapter.readPrefix = async (path, length) => {
      adapter.calls.push(['prefix', path, length]);
      return new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
    };
    await expect(persistDurableMedia({
      ownerId: OWNER, draftId: DRAFT, sourceUri: 'content://ok', extension: 'jpg',
      expectedBytes: 2, maxBytes: 10, mimeType: 'image/jpeg', kind: 'photo',
    }, adapter)).rejects.toThrow('does not match');
    expect(adapter.calls.some(([name]) => name === 'hash' || name === 'copy')).toBe(false);
  });

  test('persists a new descriptor before deleting prior media and rolls back new final on save failure', async () => {
    const prior = { uri: `file:///document/compose-drafts/${OWNER}/${DRAFT}/${'b'.repeat(64)}.jpg`, extension: 'jpg', mimeType: 'image/jpeg', byteCount: 2, sha256: 'b'.repeat(64), kind: 'photo' as const };
    const next = { ...prior, uri: `file:///document/compose-drafts/${OWNER}/${DRAFT}/${'a'.repeat(64)}.jpg`, sha256: 'a'.repeat(64) };
    const adapter = mockAdapter();
    const calls: string[] = [];
    const storage = memoryStorage(new Map(), { setError: true, calls });
    await expect(commitDraftMedia({ ...validDraft, media: prior }, next, storage, adapter)).rejects.toThrow('save');
    expect(adapter.calls.filter(([name]) => name === 'delete')).toEqual([['delete', next.uri]]);
    expect(calls[0]).toBe('set');
  });

  test('persists media null before deleting removed media', async () => {
    const prior = { uri: `file:///document/compose-drafts/${OWNER}/${DRAFT}/${'b'.repeat(64)}.jpg`, extension: 'jpg', mimeType: 'image/jpeg', byteCount: 2, sha256: 'b'.repeat(64), kind: 'photo' as const };
    const order: string[] = [];
    const adapter = mockAdapter({ order });
    await removeDraftMedia({ ...validDraft, media: prior }, memoryStorage(new Map(), { calls: order }), adapter);
    expect(order).toEqual(expect.arrayContaining(['set', 'delete']));
    expect(order.indexOf('set')).toBeLessThan(order.indexOf('delete'));
  });

  test('recovers validated orphan temp files and ignores unsafe names', async () => {
    const adapter = mockAdapter({ listed: ['a'.repeat(64) + '.jpg.tmp', '../evil.tmp', 'final.jpg'] });
    expect(await cleanupOrphanTemps(OWNER, DRAFT, adapter)).toBe(1);
    expect(adapter.calls.filter(([name]) => name === 'delete')).toHaveLength(1);
  });

  test('owner cleanup deletes only indexed owned drafts, media, and index', async () => {
    const media = { uri: `file:///document/compose-drafts/${OWNER}/${DRAFT}/${'a'.repeat(64)}.jpg`, extension: 'jpg', mimeType: 'image/jpeg', byteCount: 2, sha256: 'a'.repeat(64), kind: 'photo' as const };
    const values = new Map<string, string>();
    const storage = memoryStorage(values);
    await saveComposeDraft({ ...validDraft, media }, storage);
    const adapter = mockAdapter();
    expect(await cleanupOwnerDrafts(OWNER, storage, adapter)).toBe(1);
    expect(values.size).toBe(0);
    expect(adapter.calls).toContainEqual(['delete', media.uri]);
    expect(adapter.calls).toContainEqual(['delete-directory', `file:///document/compose-drafts/${OWNER}`]);
    expect(await cleanupOwnerDrafts(OWNER, storage, adapter)).toBe(0);
  });

  test('indexes base before filesystem work and later load removes crash orphan while preserving base JSON', async () => {
    const values = new Map<string, string>();
    const storage = memoryStorage(values);
    const failingStorage = memoryStorage(new Map(), { setError: true });
    const untouched = mockAdapter();
    await expect(persistDraftMedia(validDraft, { ownerId: OWNER, draftId: DRAFT, sourceUri: 'content://ok', extension: 'jpg', expectedBytes: 2, maxBytes: 10, mimeType: 'image/jpeg', kind: 'photo' }, failingStorage, untouched))
      .rejects.toThrow('save');
    expect(untouched.calls).toEqual([]);

    await saveComposeDraft(validDraft, storage);
    const adapter = mockAdapter({ listed: ['a'.repeat(64) + '.jpg.tmp'] });
    const loaded = await loadComposeDrafts(OWNER, storage, adapter);
    expect(loaded.drafts).toEqual([validDraft]);
    expect(adapter.calls).toContainEqual(['delete', `file:///document/compose-drafts/${OWNER}/${DRAFT}/${'a'.repeat(64)}.jpg.tmp`]);
    expect(JSON.parse(values.get(composeDraftKey(OWNER, 'new', DRAFT))!)).toEqual(validDraft);
  });
});

function mockAdapter(options: { size?: number; available?: number; readable?: boolean; copyError?: boolean; moveError?: boolean; listed?: string[]; order?: string[]; prefix?: Uint8Array } = {}): DraftFileAdapter & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    documentUri: 'file:///document',
    calls,
    availableBytes: async () => { calls.push(['available']); return options.available ?? 100; },
    sha256: async () => { calls.push(['hash']); return 'a'.repeat(64); },
    ensureDirectory: async (path) => { calls.push(['mkdir', path]); },
    copy: async (source, target) => { calls.push(['copy', source, target]); if (options.copyError) throw new Error('copy failed'); },
    size: async (path) => { calls.push(['size', path]); return options.size ?? 2; },
    readByte: async (path) => { calls.push(['read', path]); return options.readable === false ? null : 1; },
    readPrefix: async (path, length) => { calls.push(['prefix', path, length]); return options.prefix ?? new Uint8Array([0xff, 0xd8, 0xff]); },
    atomicMove: async (source, target, overwrite) => { calls.push(['move', source, target, overwrite]); if (options.moveError) throw new Error('move failed'); },
    deleteIfExists: async (path) => { calls.push(['delete', path]); options.order?.push('delete'); },
    listNames: async (path) => { calls.push(['list', path]); return options.listed ?? []; },
    deleteDirectoryIfExists: async (path) => { calls.push(['delete-directory', path]); },
  };
}

function memoryStorage(values = new Map<string, string>(), options: { setError?: boolean; calls?: string[] } = {}) {
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      options.calls?.push('set');
      if (options.setError) throw new Error('save failed');
      values.set(key, value);
    },
    removeItem: async (key: string) => { options.calls?.push('remove'); values.delete(key); },
  };
}
