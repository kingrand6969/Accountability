import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(require.resolve('../app/story/[userId]'), 'utf8');

describe('story viewer receipt contract', () => {
  test('marks the actually displayed story without blocking viewing or advancing', () => {
    expect(source).toContain('markStoryViewed');
    expect(source).toContain('dataViewKey !== viewKey');
    expect(source).toContain('void markStoryViewed(story.id, ownerId).catch(() => {})');
    expect(source).toContain('}, [story?.id, ownerId, viewKey, dataViewKey]);');
  });
});
