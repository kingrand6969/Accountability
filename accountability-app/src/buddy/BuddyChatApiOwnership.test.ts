import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { blockUser, reportUser, sendMessage } from './api';

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';
const TARGET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

let authOwner: string | null = OWNER_A;
const mockFrom = jest.fn();
const mockGetUser = jest.fn(async () => ({
  data: { user: authOwner ? { id: authOwner } : null },
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));
jest.mock('../profiles/publicProfiles', () => ({ getPublicProfiles: jest.fn() }));

function messageInsert() {
  const single = jest.fn(async () => ({
    data: {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      sender: OWNER_A,
      body: 'Strong work',
      created_at: '2026-08-18T00:00:00.000Z',
    },
    error: null,
  }));
  const select = jest.fn(() => ({ single }));
  const insert = jest.fn(() => ({ select }));
  return { insert, select, single };
}

describe('BuddyChat write ownership', () => {
  beforeEach(() => {
    authOwner = OWNER_A;
    mockFrom.mockReset();
    mockGetUser.mockClear();
  });

  test('sends with the immutable initiating owner in the payload', async () => {
    const chain = messageInsert();
    mockFrom.mockReturnValue(chain);
    await sendMessage(TARGET, 'Strong work', OWNER_A);

    expect(mockFrom).toHaveBeenCalledWith('buddy_messages');
    expect(chain.insert).toHaveBeenCalledWith({
      sender: OWNER_A,
      recipient: TARGET,
      body: 'Strong work',
    });
    expect(mockGetUser).toHaveBeenCalledTimes(2);
  });

  test('rejects a changed account before any message write', async () => {
    authOwner = OWNER_B;
    await expect(sendMessage(TARGET, 'Strong work', OWNER_A)).rejects.toThrow('Account changed');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('rejects a switch after validation and never substitutes the new owner in the row', async () => {
    const single = jest.fn(async () => ({
      data: {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        sender: OWNER_A,
        body: 'Strong work',
        created_at: '2026-08-18T00:00:00.000Z',
      },
      error: null,
    }));
    const insert = jest.fn((row: unknown) => {
      authOwner = OWNER_B;
      return { select: () => ({ single }) };
    });
    mockFrom.mockReturnValue({ insert });

    await expect(sendMessage(TARGET, 'Strong work', OWNER_A)).rejects.toThrow('Account changed');
    expect(insert).toHaveBeenCalledWith({
      sender: OWNER_A,
      recipient: TARGET,
      body: 'Strong work',
    });
  });

  test.each([
    ['block', () => blockUser(TARGET, OWNER_A), 'buddy_blocks', { blocker: OWNER_A, blocked: TARGET }],
    [
      'report',
      () => reportUser(TARGET, 'Reported from chat', OWNER_A),
      'buddy_reports',
      { reporter: OWNER_A, reported: TARGET, reason: 'Reported from chat' },
    ],
  ])('%s validates before writing and binds the owner into the row', async (_name, action, table, row) => {
    const insert = jest.fn(async () => ({ error: null }));
    mockFrom.mockReturnValue({ insert });
    await action();

    expect(mockFrom).toHaveBeenCalledWith(table);
    expect(insert).toHaveBeenCalledWith(row);
    expect(mockGetUser).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['block', () => blockUser(TARGET, OWNER_A)],
    ['report', () => reportUser(TARGET, 'Reported from chat', OWNER_A)],
  ])('%s rejects an account switch before the write', async (_name, action) => {
    authOwner = OWNER_B;
    await expect(action()).rejects.toThrow('Account changed');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
