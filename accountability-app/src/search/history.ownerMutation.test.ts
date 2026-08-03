/* eslint-disable @typescript-eslint/no-require-imports -- API loads after Supabase mock */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockFrom = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

const {
  clearSearchHistory,
  deleteSearchEntry,
  listSearchHistory,
  recordSearch,
} = require('./history') as typeof import('./history');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('search history mutation ownership', () => {
  test.each([
    ['A-to-B', ['owner-a', 'owner-b']],
    ['A-to-B-to-A', ['owner-a', 'owner-b', 'owner-a']],
  ])(
    'uses the same captured owner for record delete and insert during %s',
    async (_label, owners) => {
      const deletePending = deferred<{ error: null }>();
      const deleteFilters: [string, unknown][] = [];
      const inserts: unknown[] = [];
      const deleteBuilder = {
        delete: jest.fn(() => deleteBuilder),
        eq: jest.fn((column: string, value: unknown) => {
          deleteFilters.push([column, value]);
          return deleteBuilder;
        }),
        ilike: jest.fn(() => deletePending.promise),
      };
      const insertBuilder = {
        insert: jest.fn((value: unknown) => {
          inserts.push(value);
          return Promise.resolve({ error: null });
        }),
      };
      mockFrom.mockReturnValueOnce(deleteBuilder).mockReturnValueOnce(insertBuilder);

      let currentOwner = owners[0];
      const mutation = recordSearch(' morning run ', currentOwner);
      currentOwner = owners[1];
      if (owners.length === 3) currentOwner = owners[2];
      expect(inserts).toEqual([]);
      deletePending.resolve({ error: null });
      await mutation;

      expect(deleteFilters).toContainEqual(['user_id', 'owner-a']);
      expect(deleteFilters).not.toContainEqual(['user_id', 'owner-b']);
      expect(inserts).toEqual([{ user_id: 'owner-a', query: 'morning run' }]);
      expect(currentOwner).toBe(owners.at(-1));
    },
  );

  test.each([
    ['A-to-B', ['owner-a', 'owner-b']],
    ['A-to-B-to-A', ['owner-a', 'owner-b', 'owner-a']],
  ])(
    'keeps delete-entry and clear constrained to captured owner during %s',
    async (_label, owners) => {
      const deletePending = deferred<{ error: null }>();
      const clearPending = deferred<{ error: null }>();
      const deleteFilters: [string, unknown][] = [];
      const clearFilters: [string, unknown][] = [];
      const deleteBuilder = {
        delete: jest.fn(() => deleteBuilder),
        eq: jest.fn((column: string, value: unknown) => {
          deleteFilters.push([column, value]);
          return deleteFilters.length === 2 ? deletePending.promise : deleteBuilder;
        }),
      };
      const clearBuilder = {
        delete: jest.fn(() => clearBuilder),
        eq: jest.fn((column: string, value: unknown) => {
          clearFilters.push([column, value]);
          return clearBuilder;
        }),
        gte: jest.fn((column: string, value: unknown) => {
          clearFilters.push([column, value]);
          return clearPending.promise;
        }),
      };
      mockFrom.mockReturnValueOnce(deleteBuilder).mockReturnValueOnce(clearBuilder);

      let currentOwner = owners[0];
      const deleting = deleteSearchEntry('history-a', currentOwner);
      currentOwner = owners[1];
      if (owners.length === 3) currentOwner = owners[2];
      deletePending.resolve({ error: null });
      await deleting;

      const clearing = clearSearchHistory('owner-a');
      currentOwner = 'owner-b';
      if (owners.length === 3) currentOwner = 'owner-a';
      clearPending.resolve({ error: null });
      await clearing;

      expect(deleteFilters).toEqual([
        ['user_id', 'owner-a'],
        ['id', 'history-a'],
      ]);
      expect(clearFilters).toEqual([
        ['user_id', 'owner-a'],
        ['created_at', '1970-01-01'],
      ]);
      expect(deleteFilters).not.toContainEqual(['user_id', 'owner-b']);
      expect(clearFilters).not.toContainEqual(['user_id', 'owner-b']);
      expect(currentOwner).toBe(owners.at(-1));
    },
  );

  test('binds free-window purge and history select to the expected owner', async () => {
    const statements: { kind: string; filters: [string, unknown][] }[] = [];
    const purge = {
      delete: jest.fn(() => purge),
      eq: jest.fn((column: string, value: unknown) => {
        statements[0].filters.push([column, value]);
        return purge;
      }),
      lt: jest.fn((column: string, value: unknown) => {
        statements[0].filters.push([column, value]);
        return Promise.resolve({ error: null });
      }),
    };
    const select = {
      select: jest.fn(() => select),
      eq: jest.fn((column: string, value: unknown) => {
        statements[1].filters.push([column, value]);
        return select;
      }),
      order: jest.fn(() => select),
      limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
    };
    statements.push({ kind: 'purge', filters: [] }, { kind: 'select', filters: [] });
    mockFrom.mockReturnValueOnce(purge).mockReturnValueOnce(select);

    await expect(listSearchHistory(false, 'owner-a')).resolves.toEqual([]);
    expect(statements[0].filters).toContainEqual(['user_id', 'owner-a']);
    expect(statements[1].filters).toEqual([['user_id', 'owner-a']]);
  });
});
