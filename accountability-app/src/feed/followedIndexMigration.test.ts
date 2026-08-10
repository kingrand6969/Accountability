import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('buddy stars followed-feed index migration', () => {
  test('adds only the starrer-target composite index in query column order', () => {
    const source = readFileSync(
      require.resolve('../../supabase/migrations/0099_buddy_stars_starrer_index.sql'),
      'utf8',
    ).trim();

    expect(source).toBe(
      'create index if not exists buddy_stars_starrer_target_idx on public.buddy_stars (starrer, target);',
    );
  });
});
