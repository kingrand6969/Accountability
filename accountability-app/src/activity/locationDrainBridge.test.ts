import { describe, expect, it, jest } from '@jest/globals';

import {
  createNativeLocationDrainRuntime,
  type NativeLocationDrainModule,
} from './locationDrainBridge';

const TASK_NAME = 'accountability-location-task';
const OPTIONS = { accuracy: 6 };

function resolved<T>(value: T) {
  return jest.fn(async () => value);
}

function module(overrides: Partial<NativeLocationDrainModule> = {}) {
  return {
    getLocationCollectorDrainCapabilityAsync: resolved({ available: true, version: 3 }),
    getLocationCollectorStateAsync: resolved({
      running: false,
      generation: null,
      highWater: 0,
    }),
    reserveLocationCollectorGenerationAsync: resolved(11),
    startLocationUpdatesWithGenerationAsync: resolved(undefined),
    acknowledgeLocationCollectorBatchAsync: resolved(undefined),
    taintAndAcknowledgeLocationCollectorBatchAsync: resolved(undefined),
    stopLegacyLocationCollectorAsync: resolved(undefined),
    stopLocationUpdatesAndDrainAsync: resolved({
      generation: 11,
      drained: true,
      throughSequence: 4,
      outcome: 'exact',
    }),
    ...overrides,
  } satisfies NativeLocationDrainModule;
}

describe('native location drain bridge', () => {
  it('is unavailable unless the complete versioned native contract exists', () => {
    expect(
      createNativeLocationDrainRuntime({
        taskName: TASK_NAME,
        options: OPTIONS,
        nativeModule: {},
      }),
    ).toBeNull();

    expect(
      createNativeLocationDrainRuntime({
        taskName: TASK_NAME,
        options: OPTIONS,
        nativeModule: module({
          reserveLocationCollectorGenerationAsync: undefined,
        }),
      }),
    ).toBeNull();
  });

  it('binds the immutable task name and options to generation start', async () => {
    const nativeModule = module();
    const runtime = createNativeLocationDrainRuntime({
      taskName: TASK_NAME,
      options: OPTIONS,
      nativeModule,
    });

    await runtime?.start(11);

    expect(
      nativeModule.startLocationUpdatesWithGenerationAsync,
    ).toHaveBeenCalledWith(TASK_NAME, 11, OPTIONS);
  });

  it('atomically reserves a native generation at or above the JS evidence floor', async () => {
    const nativeModule = module({
      reserveLocationCollectorGenerationAsync: resolved(14),
    });
    const runtime = createNativeLocationDrainRuntime({
      taskName: TASK_NAME,
      options: OPTIONS,
      nativeModule,
    });

    await expect(runtime?.reserveGeneration(12)).resolves.toBe(14);
    expect(
      nativeModule.reserveLocationCollectorGenerationAsync,
    ).toHaveBeenCalledWith(TASK_NAME, 12);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid reservation floor %s before crossing the native bridge',
    async (minimumGeneration) => {
      const nativeModule = module();
      const runtime = createNativeLocationDrainRuntime({
        taskName: TASK_NAME,
        options: OPTIONS,
        nativeModule,
      });

      await expect(runtime?.reserveGeneration(minimumGeneration)).rejects.toThrow(
        'collector generation must be a positive safe integer',
      );
      expect(
        nativeModule.reserveLocationCollectorGenerationAsync,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([0, 1.5, 11, Number.MAX_SAFE_INTEGER + 1])(
    'rejects malformed native reservation %#',
    async (reserved) => {
      const runtime = createNativeLocationDrainRuntime({
        taskName: TASK_NAME,
        options: OPTIONS,
        nativeModule: module({
          reserveLocationCollectorGenerationAsync: resolved(reserved),
        }),
      });

      await expect(runtime?.reserveGeneration(12)).rejects.toThrow(
        'native collector generation reservation is invalid',
      );
    },
  );

  it('forwards an exact native batch durability acknowledgement', async () => {
    const nativeModule = module();
    const runtime = createNativeLocationDrainRuntime({
      taskName: TASK_NAME,
      options: OPTIONS,
      nativeModule,
    });

    await runtime?.acknowledgeBatch(
      11,
      'e7692ca5-b9e1-44f6-a110-408c7b74d579',
      4,
    );

    expect(
      nativeModule.acknowledgeLocationCollectorBatchAsync,
    ).toHaveBeenCalledWith(
      TASK_NAME,
      11,
      'e7692ca5-b9e1-44f6-a110-408c7b74d579',
      4,
    );
  });

  it('taints and acknowledges only the exact batch after JS durably records discard-only', async () => {
    const nativeModule = module();
    const runtime = createNativeLocationDrainRuntime({
      taskName: TASK_NAME,
      options: OPTIONS,
      nativeModule,
    });

    await runtime?.taintAndAcknowledgeBatch(
      11,
      'e7692ca5-b9e1-44f6-a110-408c7b74d579',
      4,
    );

    expect(
      nativeModule.taintAndAcknowledgeLocationCollectorBatchAsync,
    ).toHaveBeenCalledWith(
      TASK_NAME,
      11,
      'e7692ca5-b9e1-44f6-a110-408c7b74d579',
      4,
    );
  });

  it('stops a legacy collector without manufacturing a drain proof', async () => {
    const nativeModule = module();
    const runtime = createNativeLocationDrainRuntime({
      taskName: TASK_NAME,
      options: OPTIONS,
      nativeModule,
    });

    await runtime?.stopLegacyCollector();

    expect(nativeModule.stopLegacyLocationCollectorAsync).toHaveBeenCalledWith(
      TASK_NAME,
    );
    expect(
      nativeModule.stopLocationUpdatesAndDrainAsync,
    ).not.toHaveBeenCalled();
  });

  it.each([
    [11, '', 4],
    [11, 'not-a-native-uuid', 4],
    [11, 'e7692ca5-b9e1-44f6-a110-408c7b74d579', 0],
    [11, 'e7692ca5-b9e1-44f6-a110-408c7b74d579', 1.5],
  ])(
    'rejects malformed native batch acknowledgement %#',
    async (generation, batchId, throughSequence) => {
      const nativeModule = module();
      const runtime = createNativeLocationDrainRuntime({
        taskName: TASK_NAME,
        options: OPTIONS,
        nativeModule,
      });

      await expect(
        runtime?.acknowledgeBatch(
          generation as number,
          batchId as string,
          throughSequence as number,
        ),
      ).rejects.toThrow('native location batch acknowledgement is invalid');
      expect(
        nativeModule.acknowledgeLocationCollectorBatchAsync,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid collector generation %s before crossing the native bridge',
    async (generation) => {
      const nativeModule = module();
      const runtime = createNativeLocationDrainRuntime({
        taskName: TASK_NAME,
        options: OPTIONS,
        nativeModule,
      });

      await expect(runtime?.start(generation)).rejects.toThrow(
        'collector generation must be a positive safe integer',
      );
      expect(
        nativeModule.startLocationUpdatesWithGenerationAsync,
      ).not.toHaveBeenCalled();
    },
  );

  it('fails closed when native capability is not exact version 3', async () => {
    const runtime = createNativeLocationDrainRuntime({
      taskName: TASK_NAME,
      options: OPTIONS,
      nativeModule: module({
        getLocationCollectorDrainCapabilityAsync: resolved({
          available: true,
          version: 2,
        }),
      }),
    });

    await expect(runtime?.getCollectorState()).rejects.toThrow(
      'native location drain capability is unavailable',
    );
  });

  it.each([
    null,
    {},
    { available: true, version: 1 },
    { available: true, version: 3, experimental: true },
    { available: 1, version: 3 },
  ])('rejects non-exact capability payload %#', async (capability) => {
    const runtime = createNativeLocationDrainRuntime({
      taskName: TASK_NAME,
      options: OPTIONS,
      nativeModule: module({
        getLocationCollectorDrainCapabilityAsync: resolved(capability),
      }),
    });

    await expect(runtime?.getCollectorState()).rejects.toThrow(
      'native location drain capability is unavailable',
    );
  });

  it('accepts only an exact collector state', async () => {
    const runtime = createNativeLocationDrainRuntime({
      taskName: TASK_NAME,
      options: OPTIONS,
      nativeModule: module({
        getLocationCollectorStateAsync: resolved({
          running: true,
          generation: 11,
          highWater: 12,
        }),
      }),
    });

    await expect(runtime?.getCollectorState()).resolves.toEqual({
      running: true,
      generation: 11,
      highWater: 12,
    });
  });

  it('exposes native generation high-water while the collector is inactive', async () => {
    const runtime = createNativeLocationDrainRuntime({
      taskName: TASK_NAME,
      options: OPTIONS,
      nativeModule: module({
        getLocationCollectorStateAsync: resolved({
          running: false,
          generation: null,
          highWater: 77,
        }),
      }),
    });

    await expect(runtime?.getCollectorState()).resolves.toEqual({
      running: false,
      generation: null,
      highWater: 77,
    });
  });

  it.each([
    { running: true, generation: null, highWater: 11 },
    { running: false, generation: 11, highWater: 11 },
    { running: true, generation: 1.5, highWater: 11 },
    { running: true, generation: 12, highWater: 11 },
    { running: false, generation: null, highWater: -1 },
    { running: false, generation: null, highWater: 1.5 },
    { running: false, generation: null },
    { running: true, generation: 11, highWater: 11, stale: true },
  ])('rejects malformed collector state %#', async (state) => {
    const runtime = createNativeLocationDrainRuntime({
      taskName: TASK_NAME,
      options: OPTIONS,
      nativeModule: module({
        getLocationCollectorStateAsync: resolved(state),
      }),
    });

    await expect(runtime?.getCollectorState()).rejects.toThrow(
      'native collector state is invalid',
    );
  });

  it('accepts only an exact same-generation drain proof', async () => {
    const nativeModule = module();
    const runtime = createNativeLocationDrainRuntime({
      taskName: TASK_NAME,
      options: OPTIONS,
      nativeModule,
    });

    await expect(runtime?.stopAndDrain(11)).resolves.toEqual({
      generation: 11,
      drained: true,
      throughSequence: 4,
      outcome: 'exact',
    });
    expect(
      nativeModule.startLocationUpdatesWithGenerationAsync,
    ).not.toHaveBeenCalled();
  });

  it('preserves a native discard-only outcome so callers cannot seal an incomplete run', async () => {
    const runtime = createNativeLocationDrainRuntime({
      taskName: TASK_NAME,
      options: OPTIONS,
      nativeModule: module({
        stopLocationUpdatesAndDrainAsync: resolved({
          generation: 11,
          drained: true,
          throughSequence: 4,
          outcome: 'discard-only',
        }),
      }),
    });

    await expect(runtime?.stopAndDrain(11)).resolves.toEqual({
      generation: 11,
      drained: true,
      throughSequence: 4,
      outcome: 'discard-only',
    });
  });

  it.each([
    { generation: 12, drained: true, throughSequence: 4, outcome: 'exact' },
    { generation: 11, drained: false, throughSequence: 4, outcome: 'exact' },
    { generation: 11, drained: true, throughSequence: -1, outcome: 'exact' },
    { generation: 11, drained: true, throughSequence: 1.5, outcome: 'exact' },
    { generation: 11, drained: true, throughSequence: 4 },
    { generation: 11, drained: true, throughSequence: 4, outcome: 'tainted' },
    {
      generation: 11,
      drained: true,
      throughSequence: 4,
      outcome: 'exact',
      timeoutFallback: true,
    },
  ])('rejects malformed drain proof %#', async (proof) => {
    const runtime = createNativeLocationDrainRuntime({
      taskName: TASK_NAME,
      options: OPTIONS,
      nativeModule: module({
        stopLocationUpdatesAndDrainAsync: resolved(proof),
      }),
    });

    await expect(runtime?.stopAndDrain(11)).rejects.toThrow(
      'native location drain proof is invalid',
    );
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid stop generation %s before crossing the native bridge',
    async (generation) => {
      const nativeModule = module();
      const runtime = createNativeLocationDrainRuntime({
        taskName: TASK_NAME,
        options: OPTIONS,
        nativeModule,
      });

      await expect(runtime?.stopAndDrain(generation)).rejects.toThrow(
        'collector generation must be a positive safe integer',
      );
      expect(
        nativeModule.stopLocationUpdatesAndDrainAsync,
      ).not.toHaveBeenCalled();
    },
  );
});
