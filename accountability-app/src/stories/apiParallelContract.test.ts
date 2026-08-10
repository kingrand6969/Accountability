import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(require.resolve('./api'), 'utf8');

describe('listStoryGroups independent hydration', () => {
  test('loads media URLs, profiles, and viewer receipts in parallel after stories', () => {
    expect(source).toContain('await Promise.all([');
    expect(source).toContain('resolveMediaUrls(');
    expect(source).toContain('getPublicProfiles(');
    expect(source).toContain('listViewedStoryIds(');
  });
});
