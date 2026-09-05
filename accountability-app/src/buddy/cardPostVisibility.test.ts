import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { listCardPosts } from './card';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

const mockedFrom = supabase.from as jest.Mock;

describe('Buddy Card post visibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([false, true])(
    'requires public plus show-on-card even when buddy access is %p',
    async (isBuddy) => {
      const calls: [string, unknown][] = [];
      const query: Record<string, unknown> = {};
      query.select = jest.fn(() => query);
      query.eq = jest.fn((column: string, value: unknown) => {
        calls.push([column, value]);
        return query;
      });
      query.is = jest.fn(() => query);
      query.order = jest.fn(() => query);
      query.limit = jest.fn(() => query);
      query.then = (
        resolve: (value: { data: unknown[]; error: null }) => unknown,
      ) => Promise.resolve({ data: [], error: null }).then(resolve);
      mockedFrom.mockReturnValue(query);

      await listCardPosts('owner-1', isBuddy);

      expect(calls).toEqual(expect.arrayContaining([
        ['user_id', 'owner-1'],
        ['audience', 'public'],
        ['show_on_card', true],
      ]));
    },
  );
});
