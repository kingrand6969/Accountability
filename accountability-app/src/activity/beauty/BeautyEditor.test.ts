import { describe, expect, jest, test } from '@jest/globals';

import {
  BEAUTY_CONTROL_METADATA,
  BEAUTY_EDITOR_COPY,
  beautyAccessibilityValueAfterAction,
  createBeautyActionMutex,
  createBeautyCaptureLeaseSlot,
  createBeautyEditorModel,
  createBeautyPreviewScheduler,
  createBeautyRenderCoordinator,
  createBeautySheetExportController,
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

function source(id: string) {
  return {
    cacheItemId: id,
    sourceUri: `file:///cache/run-share/${id}.jpg`,
    imageSize: { width: 1200, height: 1600 },
    orientation: 0 as const,
    mirrored: false as const,
    faces: null,
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

  test('Done rejects after disposal and never transfers', async () => {
    const transfer =
      jest.fn<(value: BeautyEditorRenderResult) => void>();
    const coordinator = createBeautyRenderCoordinator({
      sourceCacheItemId: 'source',
      ownerToken: 'owner-a',
      currentOwnerToken: () => 'owner-a',
      render: async () => result('processed'),
      release: async () => undefined,
      transfer,
    });
    await coordinator.request(DEFAULT_BEAUTY);
    await coordinator.dispose();

    await expect(coordinator.done()).rejects.toThrow('closed');
    expect(transfer).not.toHaveBeenCalled();
  });

  test('suppresses preview, error, and processing callbacks after disposal', async () => {
    const pending = deferred<BeautyEditorRenderResult>();
    const onPreview = jest.fn();
    const onError = jest.fn();
    const onProcessing = jest.fn();
    const coordinator = createBeautyRenderCoordinator({
      sourceCacheItemId: 'source',
      ownerToken: 'owner-a',
      currentOwnerToken: () => 'owner-a',
      render: () => pending.promise,
      release: async () => undefined,
      onPreview,
      onError,
      onProcessing,
    });
    coordinator.request(DEFAULT_BEAUTY);
    expect(onProcessing).toHaveBeenCalledWith(true);
    onProcessing.mockClear();

    const disposing = coordinator.dispose();
    pending.resolve(result('stale-after-close'));
    await disposing;

    expect(onPreview).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onProcessing).not.toHaveBeenCalled();
  });

  test('retries a failed managed release during disposal', async () => {
    const releases = new Map<string, number>();
    const release = jest.fn(async (id: string) => {
      const attempt = (releases.get(id) ?? 0) + 1;
      releases.set(id, attempt);
      if (id === 'clean' && attempt === 1) {
        throw new Error('temporary file lock');
      }
    });
    const coordinator = createBeautyRenderCoordinator({
      sourceCacheItemId: 'source',
      ownerToken: 'owner-a',
      currentOwnerToken: () => 'owner-a',
      render: async (settings) =>
        result(settings.colorLook === 'clean' ? 'clean' : 'golden'),
      release,
    });
    await coordinator.request({ ...DEFAULT_BEAUTY, colorLook: 'clean' });
    await coordinator.request({ ...DEFAULT_BEAUTY, colorLook: 'golden' });
    expect(releases.get('clean')).toBe(1);

    await coordinator.dispose();

    expect(releases.get('clean')).toBe(2);
  });

  test('shares one in-flight release across concurrent disposal calls', async () => {
    const releasing = deferred<void>();
    const release =
      jest.fn<(id: string, owner: 'editor') => Promise<void>>(
        () => releasing.promise,
      );
    const coordinator = createBeautyRenderCoordinator({
      sourceCacheItemId: 'source',
      ownerToken: 'owner-a',
      currentOwnerToken: () => 'owner-a',
      render: async () => result('processed'),
      release,
    });
    await coordinator.request(DEFAULT_BEAUTY);

    const first = coordinator.dispose();
    const second = coordinator.dispose();
    await Promise.resolve();
    expect(
      release.mock.calls.filter(([id]) => id === 'processed'),
    ).toHaveLength(1);
    releasing.resolve();
    await Promise.all([first, second]);
  });

  test('Clean then Golden Hour invalidates real sheet staging and opens the gate twice', async () => {
    const gate = createShareOperationGate();
    const shared: { uri: string; exportKey: string }[] = [];
    let generation = 0;
    let staged: { id: string } | null = null;
    const release = jest.fn(async () => undefined);
    const exports = createBeautySheetExportController({
      advanceGeneration: () => {
        generation += 1;
        return generation;
      },
      takeStaged: () => {
        const item = staged;
        staged = null;
        return item;
      },
      release,
    });
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
      staged = { id: `staged-before-${look}` };
      const acceptedExport = exports.acceptProcessed(accepted);
      const opened = await gate.run(async () => {
        shared.push({
          uri: accepted.uri,
          exportKey: acceptedExport.exportKey,
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
        exportKey:
          '1:processed-clean:file:///cache/run-share/processed-clean.jpg',
      },
      {
        uri: 'file:///cache/run-share/processed-golden.jpg',
        exportKey:
          '2:processed-golden:file:///cache/run-share/processed-golden.jpg',
      },
    ]);
    expect(release.mock.calls).toEqual([
      ['staged-before-clean', 'editor'],
      ['staged-before-golden', 'editor'],
    ]);
  });

});

describe('BeautyEditor interaction hardening', () => {
  test('capture lease is synchronously retained before mount and released on owner mismatch', async () => {
    const release = jest.fn(async () => undefined);
    const leases = createBeautyCaptureLeaseSlot(release);

    const accepting = leases.accept(source('captured'));
    expect(leases.current()?.cacheItemId).toBe('captured');
    await accepting;
    await leases.releaseAll();
    await leases.releaseAll();

    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith('captured', 'editor');
  });

  test('capture replacement releases the old source and transfers the new source exactly once', async () => {
    const oldRelease = deferred<void>();
    const release = jest.fn((id: string) =>
      id === 'old-source' ? oldRelease.promise : Promise.resolve(),
    );
    const leases = createBeautyCaptureLeaseSlot(release);
    await leases.accept(source('old-source'));

    const replacing = leases.accept(source('new-source'));
    expect(leases.current()?.cacheItemId).toBe('new-source');
    oldRelease.resolve();
    await replacing;
    expect(leases.transferToEditor(source('new-source'))).toBe(true);
    await leases.releaseAll();

    expect(release.mock.calls).toEqual([['old-source', 'editor']]);
  });

  test('account-switch release wins the pre-mount transfer race', async () => {
    const releasing = deferred<void>();
    const release = jest.fn(() => releasing.promise);
    const leases = createBeautyCaptureLeaseSlot(release);
    const captured = source('race-source');
    await leases.accept(captured);

    const ownerSwitch = leases.releaseAll();
    expect(leases.transferToEditor(captured)).toBe(false);
    releasing.resolve();
    await ownerSwitch;
    await leases.releaseAll();

    expect(release).toHaveBeenCalledTimes(1);
  });

  test('preview scheduler debounces changes, flushes latest for Done, and cancels cleanup', async () => {
    jest.useFakeTimers();
    const request = jest.fn(async () => undefined);
    const scheduler = createBeautyPreviewScheduler(request, 120);
    const clean = { ...DEFAULT_BEAUTY, colorLook: 'clean' as const };
    const golden = { ...DEFAULT_BEAUTY, colorLook: 'golden' as const };

    scheduler.schedule(clean);
    scheduler.schedule(golden);
    jest.advanceTimersByTime(119);
    expect(request).not.toHaveBeenCalled();
    await scheduler.flush();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(golden);

    scheduler.schedule(clean);
    scheduler.dispose();
    jest.runAllTimers();
    expect(request).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  test('Done can flush and wait while the latest preview is processing', async () => {
    const rendering = deferred<BeautyEditorRenderResult>();
    const transferred: string[] = [];
    const coordinator = createBeautyRenderCoordinator({
      sourceCacheItemId: 'source',
      ownerToken: 'owner-a',
      currentOwnerToken: () => 'owner-a',
      render: () => rendering.promise,
      release: async () => undefined,
      transfer: (value) => {
        transferred.push(value.cacheItemId!);
      },
    });
    const scheduler = createBeautyPreviewScheduler(
      (settings) => coordinator.request(settings),
      120,
    );
    scheduler.schedule({ ...DEFAULT_BEAUTY, colorLook: 'golden' });

    const done = scheduler.flush().then(() => coordinator.done());
    await Promise.resolve();
    expect(transferred).toEqual([]);
    rendering.resolve(result('golden'));
    await done;
    expect(transferred).toEqual(['golden']);
  });

  test('action mutex rejects double Done and Done-versus-Retake synchronously', async () => {
    const pending = deferred<void>();
    const mutex = createBeautyActionMutex();
    const done = mutex.run('done', () => pending.promise);

    expect(mutex.run('done', async () => undefined)).toBeNull();
    expect(mutex.run('retake', async () => undefined)).toBeNull();
    pending.resolve();
    await done;

    expect(mutex.run('retake', async () => undefined)).not.toBeNull();
  });

  test('disabled adjustable actions cannot change their value', () => {
    expect(
      beautyAccessibilityValueAfterAction({
        actionName: 'increment',
        disabled: true,
        maximum: 100,
        minimum: 0,
        step: 5,
        value: 20,
      }),
    ).toBeNull();
    expect(
      beautyAccessibilityValueAfterAction({
        actionName: 'increment',
        disabled: false,
        maximum: 100,
        minimum: 0,
        step: 5,
        value: 20,
      }),
    ).toBe(25);
  });
});
