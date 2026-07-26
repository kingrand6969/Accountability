import { describe, expect, jest, test } from '@jest/globals';

import {
  BEAUTY_CONTROL_METADATA,
  BEAUTY_EDITOR_COPY,
  createBeautyEditorModel,
  createBeautyRenderCoordinator,
  type BeautyEditorRenderResult,
} from './BeautyEditor';
import { COLOR_LOOK_PRESETS, DEFAULT_BEAUTY } from './types';
import { createShareOperationGate } from '../shareOperationGate';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function result(id: string): BeautyEditorRenderResult {
  return {
    cacheItemId: id,
    uri: `file:///cache/run-share/${id}.jpg`,
  };
}

describe('BeautyEditor contract', () => {
  test('publishes the approved defaults, labels, bounds, and privacy copy', () => {
    expect(DEFAULT_BEAUTY.overall).toBe(20);
    expect(BEAUTY_EDITOR_COPY.privacy).toBe(
      'No face reshaping · Original untouched',
    );
    expect(COLOR_LOOK_PRESETS.map(({ label }) => label)).toEqual([
      'Natural',
      'Clean',
      'Golden Hour',
      'Energy',
      'Night Run',
      'Focus B&W',
    ]);
    expect(BEAUTY_CONTROL_METADATA).toEqual([
      { key: 'overall', label: 'Overall Beauty', minimum: 0, maximum: 100 },
      { key: 'smooth', label: 'Smooth', minimum: 0, maximum: 60 },
      { key: 'blemish', label: 'Blemishes', minimum: 0, maximum: 60 },
      { key: 'shine', label: 'Shine', minimum: 0, maximum: 50 },
      { key: 'underEye', label: 'Under-eyes', minimum: 0, maximum: 40 },
      { key: 'lighting', label: 'Lighting', minimum: 0, maximum: 40 },
      {
        key: 'colorStrength',
        label: 'Color strength',
        minimum: 0,
        maximum: 100,
      },
    ]);
  });

  test('applies overall, advanced, preset, and independent color events', () => {
    const model = createBeautyEditorModel();
    model.setControl('overall', 45);
    model.setControl('smooth', 32);
    model.setControl('blemish', 27);
    model.setControl('shine', 21);
    model.setControl('underEye', 14);
    model.setControl('lighting', 18);
    model.selectLook('golden');
    model.setControl('colorStrength', 72);

    expect(model.settings()).toMatchObject({
      overall: 45,
      smooth: 32,
      blemish: 27,
      shine: 21,
      underEye: 14,
      lighting: 18,
      colorLook: 'golden',
      colorStrength: 72,
    });
  });

  test('supports press-and-hold and persistent accessible Original comparison', () => {
    const model = createBeautyEditorModel();

    model.pressOriginal();
    expect(model.showOriginal()).toBe(true);
    model.releaseOriginal();
    expect(model.showOriginal()).toBe(false);

    model.toggleOriginal();
    expect(model.showOriginal()).toBe(true);
    model.pressOriginal();
    model.releaseOriginal();
    expect(model.showOriginal()).toBe(true);
    model.toggleOriginal();
    expect(model.showOriginal()).toBe(false);
  });
});

describe('BeautyEditor render and lease orchestration', () => {
  test('is single-flight, cancels stale work, and keeps only the latest result', async () => {
    const renders = [
      deferred<BeautyEditorRenderResult>(),
      deferred<BeautyEditorRenderResult>(),
    ];
    const render = jest
      .fn<(settings: unknown, signal: AbortSignal) => Promise<BeautyEditorRenderResult>>()
      .mockImplementation((_settings, signal) => {
        const next = renders[render.mock.calls.length - 1];
        signal.addEventListener('abort', () => {
          // The native renderer may still settle successfully after cancellation;
          // the coordinator must release that stale managed output.
        });
        return next.promise;
      });
    const release = jest.fn(async () => undefined);
    const applied: string[] = [];
    const coordinator = createBeautyRenderCoordinator({
      sourceCacheItemId: 'source',
      ownerToken: 'owner-a',
      currentOwnerToken: () => 'owner-a',
      render,
      release,
      onPreview: (value) => applied.push(value.cacheItemId!),
    });

    const first = coordinator.request({ ...DEFAULT_BEAUTY, colorLook: 'clean' });
    coordinator.request({ ...DEFAULT_BEAUTY, colorLook: 'golden' });
    renders[0].resolve(result('clean'));
    await first;
    expect(render).toHaveBeenCalledTimes(2);

    renders[1].resolve(result('golden'));
    await coordinator.ensureLatest();

    expect(applied).toEqual(['golden']);
    expect(release).toHaveBeenCalledWith('clean', 'editor');
    expect(coordinator.current()?.cacheItemId).toBe('golden');
  });

  test('releases the previous preview only after its replacement succeeds', async () => {
    const cleanRender = deferred<BeautyEditorRenderResult>();
    const goldenRender = deferred<BeautyEditorRenderResult>();
    const pending = [cleanRender, goldenRender];
    const release = jest.fn(async () => undefined);
    const coordinator = createBeautyRenderCoordinator({
      sourceCacheItemId: 'source',
      ownerToken: 'owner-a',
      currentOwnerToken: () => 'owner-a',
      render: () => pending.shift()!.promise,
      release,
    });

    const clean = coordinator.request({
      ...DEFAULT_BEAUTY,
      colorLook: 'clean',
    });
    cleanRender.resolve(result('clean'));
    await clean;

    const golden = coordinator.request({
      ...DEFAULT_BEAUTY,
      colorLook: 'golden',
    });
    expect(release).not.toHaveBeenCalledWith('clean', 'editor');
    goldenRender.resolve(result('golden'));
    await golden;

    expect(release).toHaveBeenCalledWith('clean', 'editor');
    expect(coordinator.current()?.cacheItemId).toBe('golden');
    await coordinator.dispose();
  });

  test('Done waits for latest render, transfers processed lease, then releases source', async () => {
    const renderDone = deferred<BeautyEditorRenderResult>();
    const release = jest.fn(async () => undefined);
    const transferred: string[] = [];
    const coordinator = createBeautyRenderCoordinator({
      sourceCacheItemId: 'source',
      ownerToken: 'owner-a',
      currentOwnerToken: () => 'owner-a',
      render: () => renderDone.promise,
      release,
      transfer: async (value) => {
        transferred.push(value.cacheItemId!);
      },
    });

    coordinator.request({ ...DEFAULT_BEAUTY, colorLook: 'golden' });
    const done = coordinator.done();
    await Promise.resolve();
    expect(transferred).toEqual([]);
    expect(release).not.toHaveBeenCalledWith('source', 'editor');

    renderDone.resolve(result('golden'));
    await done;

    expect(transferred).toEqual(['golden']);
    expect(release).toHaveBeenCalledWith('source', 'editor');
    await coordinator.dispose();
    expect(release).not.toHaveBeenCalledWith('golden', 'editor');
  });

  test.each(['retake', 'owner switch'] as const)(
    '%s releases source and processed leases exactly once',
    async (reason) => {
      let owner = 'owner-a';
      const release = jest.fn(async () => undefined);
      const coordinator = createBeautyRenderCoordinator({
        sourceCacheItemId: 'source',
        ownerToken: 'owner-a',
        currentOwnerToken: () => owner,
        render: async () => result('processed'),
        release,
      });
      await coordinator.request(DEFAULT_BEAUTY);
      if (reason === 'owner switch') owner = 'owner-b';
      await coordinator.dispose();
      await coordinator.dispose();

      expect(release.mock.calls).toEqual(
        expect.arrayContaining([
          ['source', 'editor'],
          ['processed', 'editor'],
        ]),
      );
      expect(release).toHaveBeenCalledTimes(2);
    },
  );

  test('owner switch releases a stale render and never applies it', async () => {
    let owner = 'owner-a';
    const pending = deferred<BeautyEditorRenderResult>();
    const release = jest.fn(async () => undefined);
    const onPreview = jest.fn();
    const coordinator = createBeautyRenderCoordinator({
      sourceCacheItemId: 'source',
      ownerToken: 'owner-a',
      currentOwnerToken: () => owner,
      render: () => pending.promise,
      release,
      onPreview,
    });

    const request = coordinator.request(DEFAULT_BEAUTY);
    owner = 'owner-b';
    pending.resolve(result('stale'));
    await request;
    await coordinator.dispose();

    expect(onPreview).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith('stale', 'editor');
  });

  test('caps automatic retry attempts and exposes a safe error', async () => {
    const render = jest.fn(async () => {
      throw new Error('native path and secret details');
    });
    const onError = jest.fn();
    const coordinator = createBeautyRenderCoordinator({
      sourceCacheItemId: null,
      ownerToken: 'owner-a',
      currentOwnerToken: () => 'owner-a',
      render,
      release: async () => undefined,
      onError,
      maxAttempts: 2,
    });

    await expect(coordinator.request(DEFAULT_BEAUTY)).resolves.toBeUndefined();
    expect(render).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenLastCalledWith(
      'Beauty processing could not finish. Try again or retake the photo.',
    );
  });

  test('Clean then Golden Hour opens the share gate twice with new managed output keys', async () => {
    const gate = createShareOperationGate();
    const shared: Array<{ uri: string; exportKey: string }> = [];
    const transferAndShare = async (
      sourceId: string,
      look: 'clean' | 'golden',
      outputId: string,
    ) => {
      let transferred: BeautyEditorRenderResult | null = null;
      const coordinator = createBeautyRenderCoordinator({
        sourceCacheItemId: sourceId,
        ownerToken: 'owner-a',
        currentOwnerToken: () => 'owner-a',
        render: async (settings) => {
          expect(settings.colorLook).toBe(look);
          return result(outputId);
        },
        release: async () => undefined,
        transfer: (value) => {
          transferred = value;
        },
      });
      await coordinator.request({ ...DEFAULT_BEAUTY, colorLook: look });
      await coordinator.done();
      const output = transferred as BeautyEditorRenderResult | null;
      if (!output) throw new Error('processed output was not transferred');
      const accepted = output;
      const opened = await gate.run(async () => {
        shared.push({
          uri: accepted.uri,
          exportKey: accepted.cacheItemId ?? accepted.uri,
        });
      });
      expect(opened).toBe(true);
      await coordinator.dispose();
    };

    await transferAndShare('source-clean', 'clean', 'processed-clean');
    await transferAndShare('source-golden', 'golden', 'processed-golden');

    expect(shared).toEqual([
      {
        uri: 'file:///cache/run-share/processed-clean.jpg',
        exportKey: 'processed-clean',
      },
      {
        uri: 'file:///cache/run-share/processed-golden.jpg',
        exportKey: 'processed-golden',
      },
    ]);
  });

});
