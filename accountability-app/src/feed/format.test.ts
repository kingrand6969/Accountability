import { describe, expect, test } from '@jest/globals';
import { authorLabel, selfAuthorLabel } from './format';

describe('feed identity labels', () => {
  test('keeps unknown people anonymous but identifies the current composer as You', () => {
    expect(authorLabel(null)).toBe('Someone');
    expect(selfAuthorLabel(null)).toBe('You');
    expect(selfAuthorLabel('   ')).toBe('You');
    expect(selfAuthorLabel('  Kin Grand  ')).toBe('Kin Grand');
  });
});
