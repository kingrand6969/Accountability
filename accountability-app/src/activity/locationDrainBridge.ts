import type { LocationTaskOptions } from 'expo-location';
import { requireOptionalNativeModule } from 'expo-modules-core';

export type LocationCollectorState = {
  running: boolean;
  generation: number | null;
  highWater: number;
};

export type LocationCollectorDrainProof = {
  generation: number;
  drained: true;
  throughSequence: number;
  outcome: 'exact' | 'discard-only';
};

export type NativeLocationDrainRuntime = {
  getCollectorState(): Promise<LocationCollectorState>;
  reserveGeneration(minimumGeneration: number): Promise<number>;
  start(generation: number): Promise<void>;
  acknowledgeBatch(
    generation: number,
    batchId: string,
    throughSequence: number,
  ): Promise<void>;
  taintAndAcknowledgeBatch(
    generation: number,
    batchId: string,
    throughSequence: number,
  ): Promise<void>;
  stopLegacyCollector(): Promise<void>;
  stopAndDrain(generation: number): Promise<LocationCollectorDrainProof>;
};

type LocationCollectorDrainCapability = {
  available: true;
  version: 3;
};

export type NativeLocationDrainModule = {
  getLocationCollectorDrainCapabilityAsync?: () => Promise<unknown>;
  getLocationCollectorStateAsync?: (taskName: string) => Promise<unknown>;
  reserveLocationCollectorGenerationAsync?: (
    taskName: string,
    minimumGeneration: number,
  ) => Promise<unknown>;
  startLocationUpdatesWithGenerationAsync?: (
    taskName: string,
    generation: number,
    options: LocationTaskOptions,
  ) => Promise<void>;
  acknowledgeLocationCollectorBatchAsync?: (
    taskName: string,
    generation: number,
    batchId: string,
    throughSequence: number,
  ) => Promise<void>;
  taintAndAcknowledgeLocationCollectorBatchAsync?: (
    taskName: string,
    generation: number,
    batchId: string,
    throughSequence: number,
  ) => Promise<void>;
  stopLegacyLocationCollectorAsync?: (taskName: string) => Promise<void>;
  stopLocationUpdatesAndDrainAsync?: (
    taskName: string,
    generation: number,
  ) => Promise<unknown>;
};

type CreateNativeLocationDrainRuntimeOptions = {
  taskName: string;
  options: LocationTaskOptions;
  nativeModule?: NativeLocationDrainModule | null;
};

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function assertGeneration(generation: number): void {
  if (!positiveSafeInteger(generation)) {
    throw new Error('collector generation must be a positive safe integer');
  }
}

const NATIVE_BATCH_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertBatchAcknowledgement(
  batchId: string,
  throughSequence: number,
): void {
  if (
    !NATIVE_BATCH_ID.test(batchId) ||
    !positiveSafeInteger(throughSequence)
  ) {
    throw new Error('native location batch acknowledgement is invalid');
  }
}

function exactCapability(value: unknown): value is LocationCollectorDrainCapability {
  if (!value || typeof value !== 'object') return false;
  const capability = value as Record<string, unknown>;
  return (
    Object.keys(capability).length === 2 &&
    capability.available === true &&
    capability.version === 3
  );
}

function exactCollectorState(value: unknown): value is LocationCollectorState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  if (
    Object.keys(state).length !== 3 ||
    !Number.isSafeInteger(state.highWater) ||
    Number(state.highWater) < 0
  ) {
    return false;
  }
  if (state.running === false) return state.generation === null;
  return (
    state.running === true &&
    positiveSafeInteger(state.generation) &&
    Number(state.generation) <= Number(state.highWater)
  );
}

function exactDrainProof(
  value: unknown,
  generation: number,
): value is LocationCollectorDrainProof {
  if (!value || typeof value !== 'object') return false;
  const proof = value as Record<string, unknown>;
  return (
    Object.keys(proof).length === 4 &&
    proof.generation === generation &&
    proof.drained === true &&
    Number.isSafeInteger(proof.throughSequence) &&
    Number(proof.throughSequence) >= 0 &&
    (proof.outcome === 'exact' || proof.outcome === 'discard-only')
  );
}

function defaultNativeModule(): NativeLocationDrainModule | null {
  return requireOptionalNativeModule<NativeLocationDrainModule>('ExpoLocation');
}

/**
 * Binds Expo Location's native generation collector to one immutable task and
 * option set. Missing or malformed native proof is always an error; callers
 * must keep the recording in `closing` until a proof can be obtained.
 */
export function createNativeLocationDrainRuntime({
  taskName,
  options,
  nativeModule = defaultNativeModule(),
}: CreateNativeLocationDrainRuntimeOptions): NativeLocationDrainRuntime | null {
  if (!taskName.trim()) throw new Error('location task name is required');

  const capability = nativeModule?.getLocationCollectorDrainCapabilityAsync;
  const getState = nativeModule?.getLocationCollectorStateAsync;
  const reserveGeneration =
    nativeModule?.reserveLocationCollectorGenerationAsync;
  const start = nativeModule?.startLocationUpdatesWithGenerationAsync;
  const acknowledgeBatch =
    nativeModule?.acknowledgeLocationCollectorBatchAsync;
  const taintAndAcknowledgeBatch =
    nativeModule?.taintAndAcknowledgeLocationCollectorBatchAsync;
  const stopLegacyCollector = nativeModule?.stopLegacyLocationCollectorAsync;
  const stopAndDrain = nativeModule?.stopLocationUpdatesAndDrainAsync;

  if (
    !capability ||
    !getState ||
    !reserveGeneration ||
    !start ||
    !acknowledgeBatch ||
    !taintAndAcknowledgeBatch ||
    !stopLegacyCollector ||
    !stopAndDrain
  ) {
    return null;
  }

  const getCapability = capability;

  const boundOptions: LocationTaskOptions = Object.freeze({
    ...options,
    foregroundService: options.foregroundService
      ? Object.freeze({ ...options.foregroundService })
      : undefined,
  });

  async function assertCapability(): Promise<void> {
    if (!exactCapability(await getCapability())) {
      throw new Error('native location drain capability is unavailable');
    }
  }

  return {
    async getCollectorState() {
      await assertCapability();
      const state = await getState(taskName);
      if (!exactCollectorState(state)) {
        throw new Error('native collector state is invalid');
      }
      return state;
    },

    async reserveGeneration(minimumGeneration) {
      assertGeneration(minimumGeneration);
      await assertCapability();
      const reserved = await reserveGeneration(taskName, minimumGeneration);
      if (
        !positiveSafeInteger(reserved) ||
        reserved < minimumGeneration
      ) {
        throw new Error('native collector generation reservation is invalid');
      }
      return reserved;
    },

    async start(generation) {
      assertGeneration(generation);
      await assertCapability();
      await start(taskName, generation, boundOptions);
    },

    async acknowledgeBatch(generation, batchId, throughSequence) {
      assertGeneration(generation);
      assertBatchAcknowledgement(batchId, throughSequence);
      await assertCapability();
      await acknowledgeBatch(
        taskName,
        generation,
        batchId,
        throughSequence,
      );
    },

    async taintAndAcknowledgeBatch(generation, batchId, throughSequence) {
      assertGeneration(generation);
      assertBatchAcknowledgement(batchId, throughSequence);
      await assertCapability();
      await taintAndAcknowledgeBatch(
        taskName,
        generation,
        batchId,
        throughSequence,
      );
    },

    async stopLegacyCollector() {
      await assertCapability();
      await stopLegacyCollector(taskName);
    },

    async stopAndDrain(generation) {
      assertGeneration(generation);
      await assertCapability();
      const proof = await stopAndDrain(taskName, generation);
      if (!exactDrainProof(proof, generation)) {
        throw new Error('native location drain proof is invalid');
      }
      return proof;
    },
  };
}
