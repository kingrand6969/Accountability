import { describe, expect, test } from '@jest/globals';
import {
  ACHIEVEMENT_COMPLETION_KINDS,
  achievementPayloadKey,
  retainAchievementStoryOperation,
} from './achievementCompletion';

describe('achievement completion identity', () => {
  test('keeps the concrete identity of every Flex completion', () => {
    expect(ACHIEVEMENT_COMPLETION_KINDS).toEqual([
      'manual',
      'streak',
      'workout',
      'challenge',
      'medal',
      'rank',
      'leaderboard',
      'run',
    ]);
  });

  test('reuses the operation for retry and resets it for a new concrete completion', () => {
    let serial = 0;
    const create = () => `operation-${++serial}`;
    const run = { kind: 'run' as const, sourceId: 'run-1', text: '5 km', mediaUri: null };
    const first = retainAchievementStoryOperation(null, run, create);
    expect(retainAchievementStoryOperation(first, { ...run, text: 'updated caption' }, create)).toBe(first);
    expect(retainAchievementStoryOperation(first, { ...run, sourceId: 'run-2' }, create).operationId)
      .toBe('operation-2');
    expect(achievementPayloadKey(run)).toBe('run:run-1');
  });
});
