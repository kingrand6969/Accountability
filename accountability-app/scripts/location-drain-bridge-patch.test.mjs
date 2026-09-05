import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFile = promisify(execFileCallback);

const files = {
  package: new URL('../package.json', import.meta.url),
  androidModule: new URL(
    '../node_modules/expo-location/android/src/main/java/expo/modules/location/LocationModule.kt',
    import.meta.url,
  ),
  androidConsumer: new URL(
    '../node_modules/expo-location/android/src/main/java/expo/modules/location/taskConsumers/LocationTaskConsumer.kt',
    import.meta.url,
  ),
  androidOptions: new URL(
    '../node_modules/expo-location/android/src/main/java/expo/modules/location/records/LocationArguments.kt',
    import.meta.url,
  ),
  iosModule: new URL('../node_modules/expo-location/ios/LocationModule.swift', import.meta.url),
  iosConsumer: new URL(
    '../node_modules/expo-location/ios/TaskConsumers/EXLocationTaskConsumer.m',
    import.meta.url,
  ),
  iosHeader: new URL(
    '../node_modules/expo-location/ios/TaskConsumers/EXLocationTaskConsumer.h',
    import.meta.url,
  ),
  patch: new URL('../patches/expo-location+56.0.22.patch', import.meta.url),
  taskManagerPatch: new URL(
    '../patches/expo-task-manager+56.0.23.patch',
    import.meta.url,
  ),
  androidTaskService: new URL(
    '../node_modules/expo-task-manager/android/src/main/java/expo/modules/taskManager/TaskService.java',
    import.meta.url,
  ),
  androidTaskPersistence: new URL(
    '../node_modules/expo-task-manager/android/src/main/java/expo/modules/taskManager/repository/TasksPersistence.java',
    import.meta.url,
  ),
  iosTaskService: new URL(
    '../node_modules/expo-task-manager/ios/EXTaskManager/EXTaskService.m',
    import.meta.url,
  ),
};

async function source(name) {
  return readFile(files[name], 'utf8');
}

class CollectorCrashModel {
  constructor(durable = { active: null, highWater: 0, phase: null, taskPersisted: false, registeredGeneration: null, sourceEffective: false, sequence: 0, pending: new Map(), acknowledgedThrough: 0, terminalFailure: null, recoveryTainted: false, outboxCorrupt: false, strayBatch: false, malformedPayload: false, unaccountedSequence: false, proof: null }) {
    this.durable = durable;
    this.sensorStarted = false;
    this.sourceIdentityPrepared = false;
    this.startCalls = 0;
    this.dispatched = null;
    this.replayBlocked = false;
  }

  reserve(minimumGeneration) {
    if (this.durable.active) throw new Error('active');
    if (!Number.isSafeInteger(this.durable.highWater) || this.durable.highWater < 0) {
      throw new Error('high-water is corrupt');
    }
    const generation = Math.max(
      minimumGeneration,
      this.durable.highWater + 1,
    );
    if (!Number.isSafeInteger(generation)) throw new Error('exhausted');
    this.durable.active = generation;
    this.durable.highWater = generation;
    this.durable.phase = 'claimed';
    return generation;
  }

  persistTask(succeeds = true) {
    if (!succeeds) throw new Error('task persistence failed');
    this.durable.taskPersisted = true;
    this.durable.registeredGeneration = this.durable.active;
  }

  beginAuthorizedStart(generation) {
    assert.equal(this.durable.taskPersisted, true);
    assert.equal(this.durable.active, generation);
    assert.equal(this.durable.phase, 'claimed');
    this.startCalls += 1;
    this.durable.phase = 'starting';
  }

  makeSourceEffective() {
    this.durable.sourceEffective = true;
    this.sensorStarted = true;
  }

  restoreSourceIdentity(optionsAreValid = true) {
    this.sourceIdentityPrepared = true;
    if (!optionsAreValid) {
      this.failStop('restored location options are corrupt');
      throw new Error(this.durable.terminalFailure);
    }
  }

  failStop(message) {
    this.durable.terminalFailure = message;
    this.durable.sourceEffective = false;
    this.sensorStarted = false;
  }

  authorizedStart(generation) {
    this.beginAuthorizedStart(generation);
    this.makeSourceEffective();
    this.durable.phase = 'started';
  }

  persist(batchId, locations) {
    if (this.durable.terminalFailure) throw new Error(this.durable.terminalFailure);
    if (!this.durable.pending.has(batchId) && this.durable.pending.size >= 2) {
      this.failStop('native outbox capacity exceeded');
      throw new Error(this.durable.terminalFailure);
    }
    const first = this.durable.sequence + 1;
    const exact = locations.map((location, index) => ({ ...location, nativeSequence: first + index }));
    this.durable.sequence += exact.length;
    this.durable.pending.set(batchId, structuredClone(exact));
  }

  recover() {
    return new CollectorCrashModel(this.durable);
  }

  validateRestoredOutbox() {
    const malformedBatch = [...this.durable.pending.values()].some(
      (locations) =>
        !Array.isArray(locations) ||
        locations.length === 0 ||
        locations.length > 128 ||
        locations.some(
          (location, index) =>
            !Number.isSafeInteger(location?.nativeSequence) ||
            location.nativeSequence !==
              locations.at(-1)?.nativeSequence - locations.length + 1 + index,
        ),
    );
    if (
      this.durable.outboxCorrupt ||
      this.durable.strayBatch ||
      this.durable.malformedPayload ||
      this.durable.unaccountedSequence ||
      malformedBatch ||
      this.durable.pending.size > 2
    ) {
      this.failStop('restored native outbox exceeds capacity');
      this.durable.recoveryTainted = true;
      this.replayBlocked = true;
      return false;
    }
    return true;
  }

  collectorState() {
    const activeGeneration =
      this.durable.registeredGeneration ?? this.durable.active;
    return activeGeneration
      ? {
          running: true,
          generation: activeGeneration,
          highWater: this.durable.highWater,
        }
      : {
          running: false,
          generation: null,
          highWater: this.durable.highWater,
        };
  }

  replayOne() {
    if (this.replayBlocked || this.dispatched || this.durable.pending.size === 0) return null;
    const [batchId, locations] = [...this.durable.pending.entries()].sort(([a], [b]) => a.localeCompare(b))[0];
    this.dispatched = batchId;
    return { batchId, locations: structuredClone(locations) };
  }

  finishDispatch(batchId) {
    assert.equal(this.dispatched, batchId);
    this.dispatched = null;
  }

  acknowledge(generation, batchId, throughSequence = null) {
    if (this.durable.proof?.generation === generation) {
      const through = throughSequence ?? this.durable.proof.throughSequence;
      if (through <= this.durable.proof.throughSequence) return;
      throw new Error('acknowledgement exceeds proof');
    }
    assert.equal(this.durable.active, generation);
    const pending = this.durable.pending.get(batchId);
    if (!pending) {
      const through = throughSequence ?? this.durable.acknowledgedThrough;
      if (through <= this.durable.acknowledgedThrough) return;
      throw new Error('batch is not pending');
    }
    const exactThrough = pending.at(-1).nativeSequence;
    assert.equal(throughSequence ?? exactThrough, exactThrough);
    this.durable.pending.delete(batchId);
    this.durable.acknowledgedThrough = Math.max(
      this.durable.acknowledgedThrough,
      exactThrough,
    );
  }

  drain(generation) {
    assert.equal(this.durable.registeredGeneration, generation);
    this.sensorStarted = false;
    this.durable.sourceEffective = false;
    assert.equal(this.durable.active, generation, 'claim is corrupt after exact source removal');
    if (this.durable.recoveryTainted) {
      // The durable discard-only marker precedes exact-generation cleanup.
      this.durable.pending.clear();
      this.durable.outboxCorrupt = false;
      this.durable.strayBatch = false;
      this.durable.malformedPayload = false;
      this.durable.unaccountedSequence = false;
    } else if (this.dispatched || this.durable.pending.size) {
      throw new Error('not drained');
    }
    this.durable.proof = {
      generation,
      throughSequence: this.durable.sequence,
      outcome: this.durable.terminalFailure ? 'discard-only' : 'exact',
    };
    this.durable.active = null;
    this.durable.registeredGeneration = null;
    this.durable.phase = null;
    this.durable.terminalFailure = null;
    this.durable.recoveryTainted = false;
    return this.durable.proof;
  }

  abortClaim(generation) {
    assert.equal(this.durable.active, generation);
    if (this.durable.taskPersisted || this.durable.phase !== 'claimed' || this.durable.sequence !== 0 || this.durable.pending.size || this.durable.acknowledgedThrough !== 0 || this.durable.terminalFailure || this.durable.recoveryTainted || this.durable.outboxCorrupt || this.durable.strayBatch) {
      throw new Error('activation is ambiguous');
    }
    assert.equal(this.durable.sourceEffective, false);
    this.durable.proof = { generation, throughSequence: 0, outcome: 'exact' };
    this.durable.active = null;
    this.durable.phase = null;
    return this.durable.proof;
  }

  retryPersistedProof(generation) {
    assert.equal(this.durable.proof?.generation, generation);
    if (this.durable.registeredGeneration === generation) {
      this.durable.registeredGeneration = null;
      this.durable.taskPersisted = false;
    }
    const proof = structuredClone(this.durable.proof);
    return {
      ...proof,
      outcome: proof.outcome ?? 'discard-only',
    };
  }
}

test('behavioral model replays an exact durable batch after a process crash', () => {
  const firstProcess = new CollectorCrashModel();
  assert.equal(firstProcess.reserve(41), 41);
  firstProcess.persistTask();
  firstProcess.authorizedStart(41);
  firstProcess.persist('b', [{ latitude: -31.9 }, { latitude: -31.8 }]);
  const beforeCrash = firstProcess.replayOne();

  const relaunched = firstProcess.recover();
  assert.equal(relaunched.sensorStarted, false, 'relaunch must not restart the sensor');
  assert.deepEqual(relaunched.replayOne(), beforeCrash);
  relaunched.finishDispatch('b');
  relaunched.acknowledge(41, 'b');
  assert.deepEqual(relaunched.drain(41), { generation: 41, throughSequence: 2, outcome: 'exact' });
  assert.doesNotThrow(() => relaunched.acknowledge(41, 'b', 2));
});

test('behavioral model serializes two batches and cannot drain before exact acknowledgement', () => {
  const model = new CollectorCrashModel();
  assert.equal(model.reserve(42), 42);
  model.persistTask();
  model.authorizedStart(42);
  model.persist('a', [{ latitude: 1 }]);
  model.persist('b', [{ latitude: 2 }]);
  assert.equal(model.replayOne().batchId, 'a');
  assert.equal(model.replayOne(), null);
  model.finishDispatch('a');
  model.acknowledge(42, 'a');
  assert.throws(() => model.drain(42), /not drained/);
  assert.equal(model.replayOne().batchId, 'b');
  model.finishDispatch('b');
  model.acknowledge(42, 'b');
  assert.deepEqual(model.drain(42), { generation: 42, throughSequence: 2, outcome: 'exact' });
});

test('behavioral model is inert at every crash boundary after durable task registration', () => {
  const afterTaskPersist = new CollectorCrashModel();
  assert.equal(afterTaskPersist.reserve(44), 44);
  afterTaskPersist.persistTask();
  const taskRecovery = afterTaskPersist.recover();
  assert.equal(taskRecovery.startCalls, 0);
  assert.deepEqual(taskRecovery.drain(44), { generation: 44, throughSequence: 0, outcome: 'exact' });

  const beforeRequest = new CollectorCrashModel();
  assert.equal(beforeRequest.reserve(45), 45);
  beforeRequest.persistTask();
  beforeRequest.beginAuthorizedStart(45);
  const preRequestRecovery = beforeRequest.recover();
  assert.equal(preRequestRecovery.startCalls, 0);
  assert.deepEqual(preRequestRecovery.drain(45), { generation: 45, throughSequence: 0, outcome: 'exact' });

  const effectiveRequest = new CollectorCrashModel();
  assert.equal(effectiveRequest.reserve(46), 46);
  effectiveRequest.persistTask();
  effectiveRequest.beginAuthorizedStart(46);
  effectiveRequest.makeSourceEffective();
  assert.equal(effectiveRequest.durable.sourceEffective, true);
  const effectiveRecovery = effectiveRequest.recover();
  assert.equal(effectiveRecovery.startCalls, 0);
  assert.deepEqual(effectiveRecovery.drain(46), { generation: 46, throughSequence: 0, outcome: 'exact' });
  assert.equal(effectiveRecovery.durable.sourceEffective, false);
});

test('behavioral model cannot activate after task persistence fails', () => {
  const model = new CollectorCrashModel();
  assert.equal(model.reserve(47), 47);
  assert.throws(() => model.persistTask(false), /persistence failed/);
  assert.throws(() => model.beginAuthorizedStart(47));
  assert.equal(model.startCalls, 0);
  assert.equal(model.durable.sourceEffective, false);
  assert.deepEqual(model.abortClaim(47), { generation: 47, throughSequence: 0, outcome: 'exact' });
});

test('behavioral model persists a recovered callback before exact drain', () => {
  const firstProcess = new CollectorCrashModel();
  assert.equal(firstProcess.reserve(48), 48);
  firstProcess.persistTask();
  firstProcess.beginAuthorizedStart(48);
  firstProcess.makeSourceEffective();

  const relaunched = firstProcess.recover();
  assert.equal(relaunched.startCalls, 0);
  relaunched.persist('queued-before-crash', [{ latitude: -31.95 }]);
  assert.equal(relaunched.replayOne().batchId, 'queued-before-crash');
  relaunched.finishDispatch('queued-before-crash');
  relaunched.acknowledge(48, 'queued-before-crash');
  assert.deepEqual(relaunched.drain(48), { generation: 48, throughSequence: 1, outcome: 'exact' });
});

test('behavioral model exposes and drains native lineage when JS state is lost', () => {
  const firstProcess = new CollectorCrashModel();
  assert.equal(firstProcess.reserve(49), 49);
  firstProcess.persistTask();
  firstProcess.beginAuthorizedStart(49);
  firstProcess.makeSourceEffective();

  const relaunchedWithoutJsLineage = firstProcess.recover();
  assert.deepEqual(relaunchedWithoutJsLineage.collectorState(), {
    running: true,
    generation: 49,
    highWater: 49,
  });
  assert.equal(relaunchedWithoutJsLineage.startCalls, 0);
  assert.deepEqual(relaunchedWithoutJsLineage.drain(49), {
    generation: 49,
    throughSequence: 0,
    outcome: 'exact',
  });
  assert.equal(relaunchedWithoutJsLineage.durable.sourceEffective, false);
});

test('behavioral model removes the exact source before failing on corrupt claim metadata', () => {
  const firstProcess = new CollectorCrashModel();
  assert.equal(firstProcess.reserve(50), 50);
  firstProcess.persistTask();
  firstProcess.beginAuthorizedStart(50);
  firstProcess.makeSourceEffective();
  firstProcess.durable.active = null;

  const corruptRecovery = firstProcess.recover();
  assert.throws(() => corruptRecovery.drain(50), /claim is corrupt/);
  assert.equal(corruptRecovery.durable.sourceEffective, false);
  assert.equal(corruptRecovery.startCalls, 0);
});

test('behavioral model drains a conclusive inactive claim without starting a sensor', () => {
  const firstProcess = new CollectorCrashModel();
  assert.equal(firstProcess.reserve(43), 43);
  assert.throws(() => firstProcess.reserve(43), /active/);
  const relaunched = firstProcess.recover();
  assert.equal(relaunched.sensorStarted, false);
  assert.deepEqual(relaunched.collectorState(), {
    running: true,
    generation: 43,
    highWater: 43,
  });
  assert.deepEqual(relaunched.abortClaim(43), { generation: 43, throughSequence: 0, outcome: 'exact' });
  assert.equal(relaunched.sensorStarted, false);
  assert.equal(relaunched.reserve(43), 44);
});

test('behavioral model allocates above native high-water after every JS store is reset', () => {
  const ownerA = new CollectorCrashModel();
  assert.equal(ownerA.reserve(77), 77);
  ownerA.persistTask();
  ownerA.authorizedStart(77);
  assert.deepEqual(ownerA.drain(77), {
    generation: 77,
    throughSequence: 0,
    outcome: 'exact',
  });

  const ownerBAfterJsReset = ownerA.recover();
  const nativeState = ownerBAfterJsReset.collectorState();
  assert.deepEqual(nativeState, {
    running: false,
    generation: null,
    highWater: 77,
  });
  assert.equal(ownerBAfterJsReset.reserve(1), 78);
  assert.equal(ownerBAfterJsReset.durable.active, 78);
});

test('behavioral model gives two racing runtimes distinct atomic reservations', () => {
  const firstRuntime = new CollectorCrashModel();
  const secondRuntime = firstRuntime.recover();

  assert.equal(firstRuntime.reserve(1), 1);
  assert.throws(() => secondRuntime.reserve(1), /active/);
  assert.deepEqual(firstRuntime.abortClaim(1), {
    generation: 1,
    throughSequence: 0,
    outcome: 'exact',
  });
  assert.equal(secondRuntime.reserve(1), 2);
});

test('behavioral model never manufactures proof zero over a claimed outbox', () => {
  const model = new CollectorCrashModel();
  assert.equal(model.reserve(1), 1);
  model.persist('unexpected-queued-callback', [{ latitude: -31.95 }]);

  assert.throws(() => model.abortClaim(1), /activation is ambiguous/);
  assert.equal(model.durable.active, 1);
  assert.equal(model.durable.pending.size, 1);
});

test('behavioral model never certifies a claimed generation with stray durable batch bytes', () => {
  const model = new CollectorCrashModel();
  assert.equal(model.reserve(15), 15);
  model.durable.strayBatch = true;

  assert.throws(() => model.abortClaim(15), /activation is ambiguous/);
  assert.equal(model.durable.active, 15);
  assert.equal(model.durable.proof, null);
});

test('behavioral model fail-stops at bounded native outbox capacity, then recovers after exact acknowledgements', () => {
  const model = new CollectorCrashModel();
  assert.equal(model.reserve(2), 2);
  model.persistTask();
  model.authorizedStart(2);
  model.persist('a', [{ latitude: 1 }]);
  model.persist('b', [{ latitude: 2 }]);
  const exactPending = structuredClone([...model.durable.pending]);

  assert.throws(
    () => model.persist('rejected', [{ latitude: 3 }]),
    /outbox capacity exceeded/,
  );
  assert.equal(model.durable.sourceEffective, false, 'capacity overflow must deactivate the source');
  assert.deepEqual([...model.durable.pending], exactPending, 'unacknowledged durable batches must remain exact');
  assert.equal(model.durable.pending.has('rejected'), false);

  const relaunched = model.recover();
  assert.throws(() => relaunched.drain(2), /not drained/);
  assert.equal(relaunched.durable.proof, null, 'terminal generations must never manufacture a proof');
  assert.equal(relaunched.replayOne().batchId, 'a');
  relaunched.finishDispatch('a');
  relaunched.acknowledge(2, 'a');
  assert.equal(relaunched.replayOne().batchId, 'b');
  relaunched.finishDispatch('b');
  relaunched.acknowledge(2, 'b');
  assert.deepEqual(relaunched.drain(2), { generation: 2, throughSequence: 2, outcome: 'discard-only' });
  assert.equal(relaunched.durable.terminalFailure, null);
});

test('behavioral model fail-stops generic native persistence and source errors without losing prior outbox data', () => {
  const model = new CollectorCrashModel();
  assert.equal(model.reserve(3), 3);
  model.persistTask();
  model.authorizedStart(3);
  model.persist('durable-before-failure', [{ latitude: -31.9 }]);
  const exactPending = structuredClone([...model.durable.pending]);

  model.failStop('native persistence or source failure');
  assert.equal(model.durable.sourceEffective, false);
  assert.deepEqual([...model.durable.pending], exactPending);

  const relaunched = model.recover();
  assert.equal(relaunched.replayOne().batchId, 'durable-before-failure');
  relaunched.finishDispatch('durable-before-failure');
  relaunched.acknowledge(3, 'durable-before-failure');
  assert.deepEqual(relaunched.drain(3), { generation: 3, throughSequence: 1, outcome: 'discard-only' });
});

test('behavioral model persisted-proof retry removes an exact stale registered task without restarting', () => {
  const model = new CollectorCrashModel();
  assert.equal(model.reserve(4), 4);
  model.persistTask();
  model.authorizedStart(4);
  assert.deepEqual(model.drain(4), { generation: 4, throughSequence: 0, outcome: 'exact' });

  // Crash after the proof commit but before TaskManager unregister completes.
  model.durable.taskPersisted = true;
  model.durable.registeredGeneration = 4;
  const relaunched = model.recover();
  assert.deepEqual(relaunched.retryPersistedProof(4), {
    generation: 4,
    throughSequence: 0,
    outcome: 'exact',
  });
  assert.equal(relaunched.durable.registeredGeneration, null);
  assert.equal(relaunched.startCalls, 0);
});

test('behavioral model compacts arbitrarily many ACK receipts into one durable high-water', () => {
  const model = new CollectorCrashModel();
  assert.equal(model.reserve(5), 5);
  model.persistTask();
  model.authorizedStart(5);

  for (let sequence = 1; sequence <= 1_000; sequence += 1) {
    const batchId = `batch-${sequence}`;
    model.persist(batchId, [{ latitude: sequence }]);
    model.acknowledge(5, batchId, sequence);
    assert.doesNotThrow(() => model.acknowledge(5, batchId, sequence));
  }

  assert.equal(model.durable.pending.size, 0);
  assert.equal(model.durable.acknowledgedThrough, 1_000);
  assert.equal('acknowledgements' in model.durable, false);
  assert.deepEqual(model.drain(5), {
    generation: 5,
    throughSequence: 1_000,
    outcome: 'exact',
  });
});

test('behavioral model migrates a legacy proof without integrity metadata as discard-only', () => {
  const model = new CollectorCrashModel();
  model.durable.proof = { generation: 6, throughSequence: 10 };
  model.durable.taskPersisted = true;
  model.durable.registeredGeneration = 6;

  assert.deepEqual(model.retryPersistedProof(6), {
    generation: 6,
    throughSequence: 10,
    outcome: 'discard-only',
  });
  assert.equal(model.durable.registeredGeneration, null);
  assert.equal(model.startCalls, 0);
});

test('behavioral model durably taints and atomically discards an oversized restored outbox after source removal', () => {
  const model = new CollectorCrashModel();
  assert.equal(model.reserve(7), 7);
  model.persistTask();
  model.authorizedStart(7);
  model.durable.pending.set('legacy-a', [{ nativeSequence: 1 }]);
  model.durable.pending.set('legacy-b', [{ nativeSequence: 2 }]);
  model.durable.pending.set('legacy-c', [{ nativeSequence: 3 }]);
  model.durable.sequence = 3;

  const relaunched = model.recover();
  assert.equal(relaunched.validateRestoredOutbox(), false);
  assert.equal(relaunched.durable.sourceEffective, false);
  assert.equal(relaunched.replayOne(), null);
  assert.match(relaunched.durable.terminalFailure, /exceeds capacity/);
  assert.equal(relaunched.durable.recoveryTainted, true);
  assert.equal(relaunched.durable.pending.size, 3, 'taint must be durable before any PII is deleted');
  assert.deepEqual(relaunched.drain(7), {
    generation: 7,
    throughSequence: 3,
    outcome: 'discard-only',
  });
  assert.equal(relaunched.durable.pending.size, 0);
  assert.equal(relaunched.durable.active, null);
  assert.deepEqual(relaunched.retryPersistedProof(7), {
    generation: 7,
    throughSequence: 3,
    outcome: 'discard-only',
  });
});

test('behavioral model recovers a structurally corrupt restored outbox only as discard-only', () => {
  const model = new CollectorCrashModel();
  assert.equal(model.reserve(8), 8);
  model.persistTask();
  model.authorizedStart(8);
  model.durable.sequence = 0;
  model.durable.outboxCorrupt = true;

  const relaunched = model.recover();
  assert.equal(relaunched.validateRestoredOutbox(), false);
  assert.equal(relaunched.durable.recoveryTainted, true);
  assert.equal(relaunched.durable.sourceEffective, false);
  assert.deepEqual(relaunched.drain(8), {
    generation: 8,
    throughSequence: 0,
    outcome: 'discard-only',
  });
  assert.equal(relaunched.durable.outboxCorrupt, false);
});

test('behavioral model rejects corrupt native generation high-water instead of repairing it', () => {
  const negative = new CollectorCrashModel();
  negative.durable.highWater = -1;
  assert.throws(() => negative.reserve(1), /high-water is corrupt/);

  const outOfRange = new CollectorCrashModel();
  outOfRange.durable.highWater = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => outOfRange.reserve(1), /high-water is corrupt/);
});

test('behavioral model never certifies a stray unindexed native batch as exact', () => {
  const model = new CollectorCrashModel();
  assert.equal(model.reserve(11), 11);
  model.persistTask();
  model.authorizedStart(11);
  model.durable.strayBatch = true;

  const relaunched = model.recover();
  assert.equal(relaunched.validateRestoredOutbox(), false);
  assert.equal(relaunched.durable.recoveryTainted, true);
  assert.deepEqual(relaunched.drain(11), {
    generation: 11,
    throughSequence: 0,
    outcome: 'discard-only',
  });
  assert.equal(relaunched.durable.strayBatch, false);
});

test('behavioral model rejects restored batches with oversized or noncontiguous sample payloads', () => {
  const oversized = new CollectorCrashModel();
  assert.equal(oversized.reserve(12), 12);
  oversized.persistTask();
  oversized.authorizedStart(12);
  oversized.durable.pending.set(
    'oversized',
    Array.from({ length: 129 }, (_, index) => ({ nativeSequence: index + 1 })),
  );
  oversized.durable.sequence = 129;
  assert.equal(oversized.recover().validateRestoredOutbox(), false);

  const noncontiguous = new CollectorCrashModel();
  assert.equal(noncontiguous.reserve(13), 13);
  noncontiguous.persistTask();
  noncontiguous.authorizedStart(13);
  noncontiguous.durable.pending.set('gap', [
    { nativeSequence: 1 },
    { nativeSequence: 3 },
  ]);
  noncontiguous.durable.sequence = 3;
  const relaunched = noncontiguous.recover();
  assert.equal(relaunched.validateRestoredOutbox(), false);
  assert.deepEqual(relaunched.drain(13), {
    generation: 13,
    throughSequence: 3,
    outcome: 'discard-only',
  });
});

test('behavioral model quarantines noncanonical IDs, invalid timestamps, and unaccounted sequence state', () => {
  const malformed = new CollectorCrashModel();
  assert.equal(malformed.reserve(16), 16);
  malformed.persistTask();
  malformed.authorizedStart(16);
  malformed.durable.malformedPayload = true;
  assert.equal(malformed.recover().validateRestoredOutbox(), false);

  const missing = new CollectorCrashModel();
  assert.equal(missing.reserve(17), 17);
  missing.persistTask();
  missing.authorizedStart(17);
  missing.durable.sequence = 2;
  missing.durable.acknowledgedThrough = 1;
  missing.durable.unaccountedSequence = true;
  const relaunched = missing.recover();
  assert.equal(relaunched.validateRestoredOutbox(), false);
  assert.deepEqual(relaunched.drain(17), {
    generation: 17,
    throughSequence: 2,
    outcome: 'discard-only',
  });
});

test('behavioral model preserves a generation task and recovers discard-only after app-loader failure', () => {
  const model = new CollectorCrashModel();
  assert.equal(model.reserve(9), 9);
  model.persistTask();
  model.authorizedStart(9);
  model.persist('loader-failure-batch', [{ latitude: -31.9 }]);
  assert.equal(model.replayOne().batchId, 'loader-failure-batch');

  // TaskManager durably taints/fail-stops, completes the exact native callback,
  // and intentionally preserves task config for cold-start replay.
  model.failStop('headless app loader failed');
  model.finishDispatch('loader-failure-batch');
  assert.equal(model.durable.taskPersisted, true);
  assert.equal(model.durable.registeredGeneration, 9);
  assert.equal(model.durable.sourceEffective, false);

  const relaunched = model.recover();
  assert.equal(relaunched.replayOne().batchId, 'loader-failure-batch');
  relaunched.finishDispatch('loader-failure-batch');
  relaunched.acknowledge(9, 'loader-failure-batch');
  assert.deepEqual(relaunched.drain(9), {
    generation: 9,
    throughSequence: 1,
    outcome: 'discard-only',
  });
});

test('behavioral model bounds a missing JS completion by fail-stopping without deleting its durable batch', () => {
  const model = new CollectorCrashModel();
  assert.equal(model.reserve(10), 10);
  model.persistTask();
  model.authorizedStart(10);
  model.persist('callback-timeout', [{ latitude: -31.8 }]);
  assert.equal(model.replayOne().batchId, 'callback-timeout');

  model.failStop('generation task completion timed out');
  model.finishDispatch('callback-timeout');
  assert.equal(model.durable.pending.has('callback-timeout'), true);
  assert.equal(model.durable.sourceEffective, false);
  assert.equal(model.durable.taskPersisted, true);
});

test('behavioral model reconstructs source identity before rejecting corrupt restored options', () => {
  const model = new CollectorCrashModel();
  assert.equal(model.reserve(14), 14);
  model.persistTask();
  model.beginAuthorizedStart(14);
  model.makeSourceEffective();

  const relaunched = model.recover();
  assert.throws(() => relaunched.restoreSourceIdentity(false), /options are corrupt/);
  assert.equal(relaunched.sourceIdentityPrepared, true);
  assert.equal(relaunched.durable.sourceEffective, false);
  assert.equal(relaunched.startCalls, 0);
});

test('clean installs apply the bridge only to locked Expo Location 56.0.22', async () => {
  const packageJson = JSON.parse(await source('package'));
  const taskManagerPatch = await source('taskManagerPatch');
  assert.equal(packageJson.dependencies['expo-asset'], '56.0.21');
  assert.equal(packageJson.dependencies['expo-location'], '56.0.22');
  assert.equal(packageJson.dependencies['expo-task-manager'], '56.0.23');
  assert.equal(packageJson.devDependencies['patch-package'], '8.0.0');
  assert.equal(packageJson.scripts.postinstall, 'patch-package --error-on-fail');
  assert.equal(
    packageJson.scripts['eas-build-post-install'],
    'node --test scripts/location-drain-bridge-patch.test.mjs',
  );
  assert.deepEqual(
    packageJson.expo?.autolinking?.android?.buildFromSource,
    ['expo-location', 'expo-task-manager', 'unimodules-app-loader'],
  );
  assert.deepEqual(
    packageJson.expo?.autolinking?.ios?.buildFromSource,
    ['expo-location', 'expo-task-manager'],
  );
  assert.match(await source('patch'), /node_modules\/expo-location/);
  assert.match(taskManagerPatch, /node_modules\/expo-task-manager/);
  assert.match(taskManagerPatch, /GENERATION_TASK_OPTION/);
  assert.match(taskManagerPatch, /didFailToLoadTaskApp/);
  assert.match(taskManagerPatch, /Task registration could not be durably persisted/);
  assert.match(taskManagerPatch, /BareTasksAndEventsRepository\.java/);
  assert.match(taskManagerPatch, /ManagedTasksAndEventsRepository\.java/);
  assert.match(
    taskManagerPatch,
    /public boolean persistTasksForAppScopeKey[\s\S]{0,220}return tasksPersistence\.persistTasksForAppScopeKey/,
  );
  assert.match(taskManagerPatch, /UIBackgroundFetchResultFailed/);
  assert.match(taskManagerPatch, /\.commit\(\)/);
  assert.match(taskManagerPatch, /return \[userDefaults synchronize\];/);
});

test('Expo autolinking resolves patched Android modules from source', async () => {
  const cli = fileURLToPath(
    new URL(
      '../node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js',
      import.meta.url,
    ),
  );
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const { stdout } = await execFile(
    process.execPath,
    [cli, 'resolve', '--platform', 'android', '--json'],
    { cwd },
  );
  const resolution = JSON.parse(stdout);

  assert.deepEqual(resolution.configuration?.buildFromSource, [
    'expo-location',
    'expo-task-manager',
    'unimodules-app-loader',
  ]);
});

test('Android generation collector awaits source removal and JS task acknowledgements', async () => {
  const [module, consumer, options] = await Promise.all([
    source('androidModule'),
    source('androidConsumer'),
    source('androidOptions'),
  ]);

  assert.match(module, /getLocationCollectorDrainCapabilityAsync/);
  assert.match(module, /"version" to 3/);
  assert.match(module, /reserveLocationCollectorGenerationAsync/);
  assert.match(module, /startLocationUpdatesWithGenerationAsync/);
  assert.match(module, /stopLocationUpdatesAndDrainAsync/);
  assert.match(module, /acknowledgeLocationCollectorBatchAsync/);
  assert.match(module, /taintAndAcknowledgeLocationCollectorBatchAsync/);
  assert.match(module, /stopLegacyLocationCollectorAsync/);
  assert.match(options, /collectorGeneration/);
  assert.match(consumer, /removeLocationUpdates/);
  assert.match(consumer, /awaitTaskAcknowledgements/);
  assert.match(consumer, /collectorGeneration/);
  assert.match(consumer, /nativeSequence/);
  assert.match(consumer, /collectorBatchId/);
  assert.match(consumer, /replayPersistedCollectorBatches/);
  assert.match(consumer, /reserveCollectorGeneration/);
  assert.match(consumer, /requireReservedCollectorGeneration/);
  assert.match(consumer, /generationHighWaterKey/);
  assert.match(consumer, /highWater \+ 1L/);
  assert.match(consumer, /MAX_COLLECTOR_SAMPLES_PER_BATCH\s*=\s*128/);
  assert.match(consumer, /chunked\(MAX_COLLECTOR_SAMPLES_PER_BATCH\)/);
  assert.match(consumer, /MAX_COLLECTOR_ENCODED_BATCH_BYTES/);
  assert.match(consumer, /MAX_COLLECTOR_PENDING_BATCHES\s*=\s*64/);
  assert.match(consumer, /MAX_COLLECTOR_PENDING_ENCODED_BYTES\s*=\s*4L \* 1024L \* 1024L/);
  assert.match(consumer, /pending\.size > MAX_COLLECTOR_PENDING_BATCHES/);
  assert.match(consumer, /encodedBytes > MAX_COLLECTOR_PENDING_ENCODED_BYTES/);
  assert.match(consumer, /terminalFailureKey/);
  assert.match(consumer, /persistCollectorCapacityFailure/);
  assert.match(consumer, /failStopCollector/);
  assert.match(consumer, /failStopLocationUpdates/);
  assert.match(consumer, /\.remove\(terminalFailureKey/);
  const androidPersistFailure = consumer.slice(
    consumer.indexOf('private fun executeGenerationLocationBatches'),
    consumer.indexOf('fun confirmedGeneration'),
  );
  assert.match(androidPersistFailure, /catch \(error: Throwable\)[\s\S]{0,280}failStopCollector\(error\)/);
  assert.doesNotMatch(androidPersistFailure, /catch \(error: Throwable\)[\s\S]{0,280}failCollector\(error\)/);
  assert.match(consumer, /collectorStartFailure/);
  assert.match(consumer, /activateCollectorStart/);
  assert.match(consumer, /collectorRecoveredInactive/);
  assert.match(consumer, /collectorRecoveredInactive = true[\s\S]{0,500}collectorAcceptingEvents = collectorTerminalFailure == null/);
  assert.match(consumer, /abortInactiveCollectorClaim/);
  assert.match(consumer, /COLLECTOR_PHASE_CLAIMED/);
  assert.match(module, /consumer\.activateCollectorStart\(exactGeneration\)/);
  assert.match(module, /abortInactiveCollectorClaim/);
  assert.match(module, /confirmedGeneration\(\) \?: registeredGeneration/);
  assert.match(module, /generationHighWater/);
  assert.match(module, /persistedActiveGeneration/);
  assert.match(consumer, /override fun didRegister[\s\S]{0,1600}verifyCollectorGenerationClaim/);
  assert.ok(
    consumer.indexOf('prepareCollectorSourceIdentity()') <
      consumer.indexOf('verifyCollectorGenerationClaim(context, task.appScopeKey, task.name, generation)'),
    'Android must reconstruct exact source identity before claim validation',
  );
  const androidIdentity = consumer.slice(
    consumer.indexOf('private fun prepareCollectorSourceIdentity'),
    consumer.indexOf('private fun stopLocationUpdates'),
  );
  assert.ok(
    androidIdentity.indexOf('mPendingIntent = preparePendingIntent()') <
      androidIdentity.indexOf('LocationOptions(task.options)'),
    'Android must reconstruct deterministic source identity before parsing restored options',
  );
  assert.match(consumer, /try \{[\s\S]{0,120}prepareCollectorSourceIdentity\(\)[\s\S]{0,900}catch \(error: Throwable\)[\s\S]{0,160}failStopCollector\(error\)/);
  assert.match(consumer, /lastLocation\.addOnCompleteListener[\s\S]{0,420}catch \(e: Throwable\)[\s\S]{0,160}finishNativeCollectorCallback\(\)/);
  assert.match(consumer, /prepareAndPersistCollectorBatches/);
  assert.match(consumer, /acknowledgementThroughKey/);
  assert.doesNotMatch(consumer, /ack-index:|"ack:/);
  assert.match(consumer, /taintAndAcknowledgePersistedCollectorBatch/);
  assert.match(consumer, /drainProofTaintedKey/);
  assert.match(consumer, /null -> true/);
  assert.match(module, /"outcome" to if \(.*\.tainted\) "discard-only" else "exact"/);
  assert.match(consumer, /pendingBatchIds/);
  assert.match(consumer, /collectorDiscardCorruptOutbox/);
  assert.match(consumer, /armRestoredOutboxDiscardOnly/);
  assert.match(consumer, /completeDiscardOnlyRecoveryLocked/);
  assert.match(consumer, /exactBatchDataPrefix/);
  assert.match(consumer, /exactBatchKeys != indexedBatchKeys/);
  const androidAbort = consumer.slice(
    consumer.indexOf('fun abortInactiveCollectorClaim'),
    consumer.indexOf('private fun generationFrom'),
  );
  assert.match(androidAbort, /exactBatchDataPrefix/);
  assert.match(consumer, /locations\.size > MAX_COLLECTOR_SAMPLES_PER_BATCH/);
  assert.match(consumer, /nativeSequence != \(firstSequence \+ index\)\.toDouble\(\)/);
  assert.match(consumer, /timestamp < 0\.0/);
  assert.match(consumer, /UUID\.fromString\(batchId\)\.toString\(\) != batchId/);
  assert.match(consumer, /maximumAccountedSequence != collectorSequence/);
  assert.match(consumer, /batch sequences overlap/);
  assert.match(consumer, /for \(batchKey in exactBatchKeys\)[\s\S]{0,100}editor\.remove\(batchKey\)/);
  assert.match(
    consumer,
    /putString\(terminalFailureKey[\s\S]{0,500}commit\(\)[\s\S]{0,1200}collectorDiscardCorruptOutbox = true/,
  );
  assert.match(
    consumer,
    /putBoolean\(drainProofTaintedKey[\s\S]{0,160}true\)[\s\S]{0,1200}remove\(batchKey\)[\s\S]{0,400}commit\(\)/,
  );
  assert.match(
    consumer,
    /highWater < 0L \|\| highWater > MAX_SAFE_INTEGER[\s\S]{0,220}high-water is corrupt/,
  );
  assert.match(consumer, /drainProofThroughSequenceKey/);
  assert.match(consumer, /\.remove\(sequenceKey/);
  assert.ok(
    consumer.indexOf('prepareAndPersistCollectorBatches(locationBundles, generation)') <
      consumer.indexOf('dispatchPersistedCollectorBatch(batchId, data) {'),
    'Android must durably persist a batch before dispatching it to JavaScript',
  );
  const androidStop = consumer.slice(
    consumer.indexOf('suspend fun stopAndDrain'),
    consumer.indexOf('private suspend fun awaitTaskAcknowledgements'),
  );
  assert.doesNotMatch(androidStop, /startLocationUpdates|ensureCollectorStarted/);
  assert.ok(
    module.indexOf('mTaskManager.registerTask(taskName, LocationTaskConsumer::class.java') <
      module.indexOf('consumer.activateCollectorStart(exactGeneration)'),
    'Android must durably register an inert task before source activation',
  );
  const androidStart = module.slice(
    module.indexOf('AsyncFunction("startLocationUpdatesWithGenerationAsync")'),
    module.indexOf('AsyncFunction("acknowledgeLocationCollectorBatchAsync")'),
  );
  assert.doesNotMatch(androidStart, /unregisterTask/);
  assert.ok(
    androidStart.indexOf('requireReservedCollectorGeneration(') <
      androidStart.indexOf('mTaskManager.registerTask('),
    'Android start must consume an atomic native reservation before registration',
  );
  assert.ok(
    consumer.indexOf('removeLocationUpdatesAndAwait()') <
      consumer.indexOf('sealCollectorSourceOnMainThread()'),
    'Android must await source removal before attempting the drain proof',
  );
  assert.doesNotMatch(consumer, /LOCATION_DRAIN_TIMEOUT/);
  assert.doesNotMatch(consumer, /withTimeout|delay\([^)]*drain/i);
  const generationReport = consumer.slice(
    consumer.indexOf('private fun reportGenerationLocations'),
    consumer.indexOf('private fun executeTaskWithLocationBundles'),
  );
  assert.doesNotMatch(generationReport, /location\.time|collectorLastTimestamp/);
});

test('iOS generation collector stops Core Location and awaits TaskManager didFinish', async () => {
  const [module, consumer, header] = await Promise.all([
    source('iosModule'),
    source('iosConsumer'),
    source('iosHeader'),
  ]);

  assert.match(module, /getLocationCollectorDrainCapabilityAsync/);
  assert.match(module, /"version": 3/);
  assert.match(module, /reserveLocationCollectorGenerationAsync/);
  assert.match(module, /startLocationUpdatesWithGenerationAsync/);
  assert.match(module, /stopLocationUpdatesAndDrainAsync/);
  assert.match(module, /acknowledgeLocationCollectorBatchAsync/);
  assert.match(module, /taintAndAcknowledgeLocationCollectorBatchAsync/);
  assert.match(module, /stopLegacyLocationCollectorAsync/);
  assert.match(
    module,
    /return \["running": true, "generation": registered, "highWater": highWater\]/,
  );
  assert.match(header, /stopAndDrainTaskName/);
  assert.match(consumer, /stopUpdatingLocation/);
  assert.match(consumer, /didFinish/);
  assert.match(consumer, /collectorGeneration/);
  assert.match(consumer, /nativeSequence/);
  assert.match(consumer, /collectorBatchId/);
  assert.match(consumer, /replayPersistedCollectorBatches/);
  assert.match(module, /reserveGeneration/);
  assert.match(module, /requireReservedGeneration/);
  assert.match(module, /acknowledgeLocationCollectorBatchAsync/);
  assert.match(module, /stopLegacyLocationCollectorAsync/);
  assert.match(header, /registeredGenerationForTaskName/);
  assert.match(header, /generationHighWaterForTaskName/);
  assert.match(header, /persistedActiveGenerationForTaskName/);
  assert.match(header, /isLegacyTaskName/);
  assert.match(header, /acknowledgeTaskName/);
  assert.match(header, /taintAndAcknowledgeTaskName/);
  assert.match(header, /persistedDrainProofTaintedForTaskName/);
  assert.match(header, /stopLegacyTaskName/);
  assert.match(header, /startTaskName/);
  assert.match(header, /abortInactiveClaimForTaskName/);
  assert.match(consumer, /EXLocationCollectorStateHighWater/);
  assert.match(consumer, /EXLocationCollectorStatePhase/);
  assert.match(consumer, /EXLocationCollectorPhaseClaimed/);
  assert.match(consumer, /activateCollectorStartGeneration/);
  assert.match(consumer, /collectorRecoveredInactive/);
  assert.match(consumer, /_collectorRecoveredInactive = YES;[\s\S]{0,520}_collectorAcceptingEvents = self->_collectorTerminalFailure == nil;/);
  assert.match(consumer, /highWater\.longLongValue \+ 1/);
  assert.match(consumer, /EXLocationCollectorMaxSamplesPerBatch = 128/);
  assert.match(consumer, /EXLocationCollectorMaxEncodedBatchBytes/);
  assert.match(consumer, /EXLocationCollectorMaxPendingBatches = 64/);
  assert.match(consumer, /EXLocationCollectorMaxPendingEncodedBytes = 4 \* 1024 \* 1024/);
  assert.match(consumer, /pending\.count > EXLocationCollectorMaxPendingBatches/);
  assert.match(consumer, /EXLocationCollectorMaxPendingEncodedBytes - pendingEncodedBytes/);
  assert.match(consumer, /locations\.count > EXLocationCollectorMaxSamplesPerBatch/);
  assert.match(consumer, /firstSequence \+ \(long long\)index/);
  assert.match(consumer, /EXLocationCollectorIsFiniteNumber\(latitude\)/);
  assert.match(consumer, /\[timestamp doubleValue\] < 0/);
  assert.match(consumer, /canonicalBatchId\.UUIDString\.lowercaseString/);
  assert.match(consumer, /maximumAccountedSequence != sequence\.longLongValue/);
  assert.match(consumer, /pendingSequenceRanges/);
  assert.match(consumer, /EXLocationCollectorOutboxTerminalFailure/);
  assert.match(consumer, /EXLocationCollectorStateRecoveryTainted/);
  assert.match(consumer, /collectorDiscardCorruptOutbox/);
  assert.match(consumer, /armDiscardOnlyRecoveryForTask/);
  assert.match(
    consumer,
    /EXLocationCollectorStateRecoveryTainted\] = @YES[\s\S]{0,260}persistCollectorState/,
  );
  assert.match(
    consumer,
    /EXLocationCollectorStateDrainTainted\] = @\(.*collectorTerminalFailure != nil.*\)[\s\S]{0,520}removeObjectForKey:\[EXLocationTaskConsumer outboxKeyForAppId/,
  );
  assert.match(consumer, /persistTerminalFailureMessage/);
  assert.match(consumer, /failStopCollectorSource/);
  assert.match(consumer, /didFailWithError[\s\S]{0,900}persistTerminalFailureMessage[\s\S]{0,420}failStopCollectorSource/);
  const iosStopAndDrain = module.slice(
    module.indexOf('AsyncFunction("stopLocationUpdatesAndDrainAsync")'),
    module.indexOf('// Geofencing'),
  );
  assert.match(
    iosStopAndDrain,
    /persistedDrainProof[\s\S]{0,760}registeredGeneration[\s\S]{0,420}unregisterTask/,
  );
  assert.match(consumer, /persistCollectorBatches/);
  assert.match(consumer, /EXLocationCollectorOutboxPending/);
  assert.match(consumer, /EXLocationCollectorOutboxAcknowledgedThrough/);
  assert.doesNotMatch(consumer, /EXLocationCollectorOutboxAcknowledgements/);
  assert.match(consumer, /return @YES;[\s\S]{0,120}pre-v3|pre-v3[\s\S]{0,180}return @YES;/);
  assert.match(module, /"outcome": tainted\.boolValue \? "discard-only" : "exact"/);
  assert.match(consumer, /collectorDispatchedBatchIds\.count != 0/);
  const iosAbort = consumer.slice(
    consumer.indexOf('+ (nullable NSNumber *)abortInactiveClaimForTaskName'),
    consumer.indexOf('+ (void)acknowledgeTaskName'),
  );
  assert.match(iosAbort, /EXLocationCollectorOutboxSequence/);
  assert.match(iosAbort, /EXLocationCollectorOutboxPending/);
  assert.match(iosAbort, /EXLocationCollectorStateRecoveryTainted/);
  assert.match(iosAbort, /sequence\.longLongValue != 0/);
  assert.match(iosAbort, /removeObjectForKey:outboxKey/);
  assert.match(consumer, /sortedArrayUsingSelector/);
  const iosExecute = consumer.slice(
    consumer.indexOf('- (void)executeTaskWithDeferredLocations'),
    consumer.indexOf('- (void)maybeReportDeferredLocations'),
  );
  const iosPersistIndex = iosExecute.indexOf('persistCollectorBatches:batches throughSequence:nextSequence');
  assert.ok(
    iosPersistIndex >= 0 &&
      iosPersistIndex < iosExecute.indexOf('replayPersistedCollectorBatches];', iosPersistIndex),
    'iOS must durably persist a batch before dispatching it to JavaScript',
  );
  assert.ok(
    iosPersistIndex <
      iosExecute.indexOf('_collectorSequence = nextSequence;'),
    'iOS must not advance durable sequence for a rejected batch',
  );
  assert.doesNotMatch(consumer, /nextNativeSequence/);
  assert.doesNotMatch(consumer, /LOCATION_DRAIN_TIMEOUT/);
  assert.doesNotMatch(consumer, /dispatch_after[^\n]*drain/i);
  const iosStop = consumer.slice(
    consumer.indexOf('- (void)beginStopAndDrainGeneration'),
    consumer.indexOf('- (void)maybeCompleteCollectorDrain'),
  );
  assert.doesNotMatch(iosStop, /startUpdatingLocation|startMonitoringSignificantLocationChanges/);
  assert.ok(
    module.indexOf('try manager.registerTask(') <
      module.indexOf('EXLocationTaskConsumer.start('),
    'iOS must durably register an inert task before source activation',
  );
  const iosStart = module.slice(
    module.indexOf('AsyncFunction("startLocationUpdatesWithGenerationAsync")'),
    module.indexOf('AsyncFunction("acknowledgeLocationCollectorBatchAsync")'),
  );
  assert.doesNotMatch(iosStart, /unregisterTask/);
  assert.ok(
    iosStart.indexOf('requireReservedGeneration(') <
      iosStart.indexOf('try manager.registerTask('),
    'iOS start must consume an atomic native reservation before registration',
  );
});

test('TaskManager consumes native completion callbacks exactly once', async () => {
  const [android, androidPersistence, ios] = await Promise.all([
    source('androidTaskService'),
    source('androidTaskPersistence'),
    source('iosTaskService'),
  ]);

  assert.match(android, /!appEvents\.remove\(eventId\)/);
  assert.match(android, /sTaskCallbacks\.remove\(eventId\)/);
  assert.match(androidPersistence, /return preferences[\s\S]{0,180}\.commit\(\);/);
  assert.doesNotMatch(androidPersistence, /putString\([\s\S]{0,160}\.apply\(\)/);
  assert.match(android, /if \(!mTasksAndEventsRepository\.persistTasksForAppScopeKey/);
  assert.match(android, /Task registration could not be durably persisted/);
  assert.match(android, /GENERATION_TASK_OPTION/);
  assert.match(android, /failGenerationTaskExecution/);
  assert.match(android, /scheduleGenerationTaskWatchdog/);
  assert.match(android, /didFailToLoadTaskApp/);
  assert.match(android, /GENERATION_TASK_EXECUTION_TIMEOUT_MS/);
  const loaderFailure = android.slice(
    android.indexOf('success ->'),
    android.indexOf('private boolean isGenerationTask', android.indexOf('success ->')),
  );
  assert.match(loaderFailure, /failAllEventsForAppLoad/);
  assert.doesNotMatch(loaderFailure, /unregisterAllTasksForAppScopeKey/);
  const missingExecution = android.slice(
    android.indexOf('if (executionInfo == null)'),
    android.indexOf('String eventId', android.indexOf('if (executionInfo == null)')),
  );
  assert.match(missingExecution, /failGenerationTaskExecution/);
  assert.match(ios, /!\[appEvents containsObject:eventId\]/);
  assert.match(ios, /\[appEvents removeObject:eventId\]/);
  assert.match(ios, /if \(!\[self _addTaskToConfig:task\]\)/);
  assert.match(ios, /return \[userDefaults synchronize\];/);
  assert.match(ios, /Task registration could not be durably persisted/);
  assert.match(ios, /EXGenerationTaskOption/);
  assert.match(ios, /_failGenerationTask/);
  assert.match(ios, /_scheduleGenerationTaskWatchdog/);
  assert.match(ios, /didFailToLoadTaskApp:/);
  assert.match(ios, /EXGenerationTaskExecutionTimeout/);
  const iosGenerationFailureStart = ios.lastIndexOf('- (BOOL)_failGenerationTask:');
  const iosGenerationFailure = ios.slice(
    iosGenerationFailureStart,
    ios.indexOf('- (void)_scheduleGenerationTaskWatchdog:', iosGenerationFailureStart),
  );
  assert.match(
    iosGenerationFailure,
    /isIncludingTask:task[\s\S]{0,180}UIBackgroundFetchResultFailed/,
  );
  const iosLoaderFailure = ios.slice(
    ios.indexOf('if (!success)'),
    ios.indexOf('/**', ios.indexOf('if (!success)')),
  );
  assert.match(iosLoaderFailure, /_failAllEventsForAppLoad/);
  assert.doesNotMatch(iosLoaderFailure, /unregisterAllTasksForAppId/);
});
