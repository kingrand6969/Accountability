import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { getPublicProfile, getPublicProfiles } from './publicProfiles';

const mockResolveMediaUrl = jest.fn<(value: string) => Promise<string>>();
const mockResolveMediaUrls = jest.fn<
  (values: string[]) => Promise<Map<string, string>>
>();
const mockMaybeSingle = jest.fn<() => Promise<{ data: unknown; error: unknown }>>();
const mockIn = jest.fn<() => Promise<{ data: unknown[]; error: unknown }>>();
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ in: mockIn, eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));

jest.mock('../lib/supabase', () => ({
  supabase: { from: () => mockFrom() },
}));

jest.mock('../media/privateMedia', () => ({
  resolveMediaUrl: (value: string) => mockResolveMediaUrl(value),
  resolveMediaUrls: (values: string[]) => mockResolveMediaUrls(values),
}));

const PRIVATE_AVATAR = 'r2://avatars/member/dog.jpg';
const SIGNED_AVATAR =
  'https://media.example/dog.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256';

describe('public profile media references', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveMediaUrl.mockResolvedValue(SIGNED_AVATAR);
    mockResolveMediaUrls.mockResolvedValue(
      new Map([[PRIVATE_AVATAR, SIGNED_AVATAR]]),
    );
  });

  it('warms batch authorization without replacing durable private avatar refs', async () => {
    mockIn.mockResolvedValue({
      data: [
        {
          id: 'member-1',
          display_name: 'Kin Grand',
          avatar_url: PRIVATE_AVATAR,
          area: 'Las Pinas',
          buddy_opt_in: true,
          last_active_at: null,
        },
      ],
      error: null,
    });

    const profiles = await getPublicProfiles(['member-1']);

    expect(mockResolveMediaUrls).toHaveBeenCalledWith([PRIVATE_AVATAR]);
    expect(profiles.get('member-1')?.avatar_url).toBe(PRIVATE_AVATAR);
    expect(profiles.get('member-1')?.avatar_url).not.toBe(SIGNED_AVATAR);
  });

  it('warms singular authorization without discarding the durable ref', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'member-1',
        display_name: 'Kin Grand',
        avatar_url: PRIVATE_AVATAR,
        area: 'Las Pinas',
        buddy_opt_in: true,
        last_active_at: null,
      },
      error: null,
    });

    const profile = await getPublicProfile('member-1');

    expect(mockResolveMediaUrl).toHaveBeenCalledWith(PRIVATE_AVATAR);
    expect(profile?.avatar_url).toBe(PRIVATE_AVATAR);
  });
});
