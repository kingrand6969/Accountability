import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockGetItem = jest.fn<() => Promise<string | null>>();
const mockRemoveItem = jest.fn<() => Promise<void>>();
const mockGetUser = jest.fn<() => Promise<{ data: { user: { id: string } | null } }>>();
const mockInsert = jest.fn<
  (value: { referred_id: string; referrer_id: string }) => Promise<{ error: Error | null }>
>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: () => mockGetItem(),
    removeItem: () => mockRemoveItem(),
  },
}));
jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(),
  parse: jest.fn(),
  createURL: jest.fn(),
}));
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: () => ({
      insert: (value: { referred_id: string; referrer_id: string }) => mockInsert(value),
    }),
  },
}));

// eslint-disable-next-line import/first -- module loads after dependency mocks
import { redeemPendingReferral } from './referrals';

beforeEach(() => {
  mockGetItem.mockReset().mockResolvedValue('referrer-id');
  mockRemoveItem.mockReset().mockResolvedValue(undefined);
  mockGetUser.mockReset();
  mockInsert.mockReset().mockResolvedValue({ error: null });
});

describe('pending referral redemption owner boundary', () => {
  test('does not spend or attribute a referral after the session owner changes', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'owner-b' } } });

    await redeemPendingReferral('owner-a');

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });

  test('attributes and clears a pending referral for the expected current owner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'owner-a' } } });

    await redeemPendingReferral('owner-a');

    expect(mockInsert).toHaveBeenCalledWith({
      referred_id: 'owner-a',
      referrer_id: 'referrer-id',
    });
    expect(mockRemoveItem).toHaveBeenCalledTimes(1);
  });
});
