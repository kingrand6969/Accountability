import { describe, expect, test } from '@jest/globals';
import { createShareOperationGate } from './shareOperationGate';

describe('share operation gate', () => {
  test('blocks overlapping operations but permits later operations after completion', async () => {
    const gate = createShareOperationGate();
    let releaseFirst!: () => void;
    const firstOperation = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let secondRan = false;

    const firstResult = gate.run(() => firstOperation);
    const overlappingResult = await gate.run(() => {
      secondRan = true;
    });

    expect(overlappingResult).toBe(false);
    expect(secondRan).toBe(false);

    releaseFirst();
    await expect(firstResult).resolves.toBe(true);
    await expect(gate.run(() => {
      secondRan = true;
    })).resolves.toBe(true);
    expect(secondRan).toBe(true);
  });

  test('permits a later operation after cancellation', async () => {
    const gate = createShareOperationGate();

    await expect(gate.run(() => undefined)).resolves.toBe(true);
    await expect(gate.run(() => undefined)).resolves.toBe(true);
  });

  test('permits a later operation after an error', async () => {
    const gate = createShareOperationGate();

    await expect(gate.run(() => {
      throw new Error('share failed');
    })).rejects.toThrow('share failed');
    await expect(gate.run(() => undefined)).resolves.toBe(true);
  });
});
