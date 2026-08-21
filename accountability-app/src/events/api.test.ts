import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { attendEvent, createEvent } from './api';

const mockRpc = jest.fn<(
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>>();
const mockFrom = jest.fn();
const mockCreateGroup = jest.fn();
const mockCreatePost = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'owner-1' } } })) },
    rpc: (name: string, args: Record<string, unknown>) => mockRpc(name, args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));
jest.mock('../groups/api', () => ({
  createGroup: (...args: unknown[]) => mockCreateGroup(...args),
  joinGroup: jest.fn(),
}));
jest.mock('../feed/api', () => ({
  createPost: (...args: unknown[]) => mockCreatePost(...args),
}));

const input = {
  expectedOwnerId: '11111111-1111-4111-8111-111111111111',
  operationId: '22222222-2222-4222-8222-222222222222',
  title: 'Saturday 5k',
  startsAtIso: '2026-08-22T10:00:00.000Z',
  location: 'Kings Park',
  message: 'Easy social pace',
  audience: 'public' as const,
  showOnCard: true,
};

const visibilityCases: [boolean, 'buddies' | 'public', boolean][] = [
  [false, 'buddies', false],
  [true, 'public', true],
];

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockCreateGroup.mockReset();
  mockCreatePost.mockReset();
});

describe('createEvent', () => {
  test('uses one owner-bound atomic RPC and returns every committed id', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        result_group_id: 'group-1',
        result_event_id: 'event-1',
        result_post_id: 'post-1',
      }],
      error: null,
    });

    await expect(createEvent(input)).resolves.toEqual({
      groupId: 'group-1',
      eventId: 'event-1',
      postId: 'post-1',
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('create_event_announcement', {
      p_expected_owner: input.expectedOwnerId,
      p_operation_id: input.operationId,
      p_title: input.title,
      p_starts_at: input.startsAtIso,
      p_location: input.location,
      p_message: input.message,
      p_audience: 'public',
      p_show_on_card: true,
    });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockCreateGroup).not.toHaveBeenCalled();
    expect(mockCreatePost).not.toHaveBeenCalled();
  });

  test('normalizes Buddy Card featuring off for a Buddies event', async () => {
    mockRpc.mockResolvedValue({
      data: [{ result_group_id: 'g', result_event_id: 'e', result_post_id: 'p' }],
      error: null,
    });

    await createEvent({ ...input, audience: 'buddies', showOnCard: true });

    expect(mockRpc).toHaveBeenCalledWith('create_event_announcement', expect.objectContaining({
      p_audience: 'buddies',
      p_show_on_card: false,
    }));
  });

  test.each(visibilityCases)('maps the event visibility switch %p to one canonical RPC pair', async (
    showPublicly,
    audience,
    showOnCard,
  ) => {
    mockRpc.mockResolvedValue({
      data: [{ result_group_id: 'g', result_event_id: 'e', result_post_id: 'p' }],
      error: null,
    });

    await createEvent({ ...input, showPublicly });

    expect(mockRpc).toHaveBeenCalledWith('create_event_announcement', expect.objectContaining({
      p_audience: audience,
      p_show_on_card: showOnCard,
    }));
  });

  test('normalizes a tampered legacy public-without-card event toward Buddies only', async () => {
    mockRpc.mockResolvedValue({
      data: [{ result_group_id: 'g', result_event_id: 'e', result_post_id: 'p' }],
      error: null,
    });

    await createEvent({ ...input, audience: 'public', showOnCard: false });

    expect(mockRpc).toHaveBeenCalledWith('create_event_announcement', expect.objectContaining({
      p_audience: 'buddies',
      p_show_on_card: false,
    }));
  });

  test('does not swallow an RPC failure or invent a successful result', async () => {
    const error = { code: '42501', message: 'account changed' };
    mockRpc.mockResolvedValue({ data: null, error });

    await expect(createEvent(input)).rejects.toBe(error);
  });
});

describe('attendEvent', () => {
  test('joins only through the owner-bound event visibility RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    await expect(attendEvent('event-1', 'post-owner-1')).resolves.toBeUndefined();

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('attend_event', {
      p_event_id: 'event-1',
      p_expected_owner: 'post-owner-1',
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('surfaces an event visibility rejection without falling back to a direct group join', async () => {
    const error = { code: '42501', message: 'Event is not available.' };
    mockRpc.mockResolvedValue({ data: null, error });

    await expect(attendEvent('event-private', 'owner-private')).rejects.toBe(error);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
