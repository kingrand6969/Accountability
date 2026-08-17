import { describe, expect, test } from '@jest/globals';
import { createItemDetailGeneration } from './itemDetailGeneration';

describe('item detail generation', () => {
  test('rejects stale load completion after blur and accepts the current replay', () => {
    const guard = createItemDetailGeneration();
    const first = guard.begin('owner-a:item-1');
    guard.invalidate();
    expect(guard.isCurrent(first, 'owner-a:item-1')).toBe(false);

    const replay = guard.begin('owner-a:item-1');
    expect(guard.isCurrent(replay, 'owner-a:item-1')).toBe(true);
    expect(guard.isCurrent(replay, 'owner-b:item-1')).toBe(false);
    expect(guard.isCurrent(replay, 'owner-a:item-2')).toBe(false);
  });
});
