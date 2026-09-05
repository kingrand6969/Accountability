import { describe, expect, test } from '@jest/globals';
import { authorLabel, postTimestampLabel, selfAuthorLabel } from './format';

describe('feed identity labels', () => {
  test('keeps unknown people anonymous but identifies the current composer as You', () => {
    expect(authorLabel(null)).toBe('Someone');
    expect(selfAuthorLabel(null)).toBe('You');
    expect(selfAuthorLabel('   ')).toBe('You');
    expect(selfAuthorLabel('  Kin Grand  ')).toBe('Kin Grand');
  });
});

describe('feed post timestamps', () => {
  const now = new Date('2026-08-28T12:00:00.000Z').getTime();

  test('shows elapsed posting time for posts newer than one week', () => {
    expect(postTimestampLabel('2026-08-28T11:14:00.000Z', now)).toBe('· 46m');
    expect(postTimestampLabel('2026-08-28T10:00:00.000Z', now)).toBe('· 2h');
    expect(postTimestampLabel('2026-08-22T12:00:00.000Z', now)).toBe('· 6d');
  });

  test('switches to the posted date at the seven-day boundary', () => {
    const postedAt = '2026-08-21T12:00:00.000Z';
    const expectedDate = new Date(postedAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });

    expect(postTimestampLabel(postedAt, now)).toBe(`· ${expectedDate}`);
  });
});
