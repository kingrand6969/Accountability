import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const mockGetUser = jest.fn<() => Promise<any>>();
const mockRpc = jest.fn<(...args: any[]) => Promise<any>>();
const mockFrom = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import { MEDALS } from '../achievements/catalog';
import { listCompletedChallengesForMember } from '../compete/api';

const viewerId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const otherViewerId = '33333333-3333-4333-8333-333333333333';

const authUser = (id: string | null) => ({
  data: { user: id ? { id } : null },
  error: null,
});

const gallerySource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/app/buddy-medals/[id].tsx'),
  'utf8',
);
const layoutSource = fs.readFileSync(path.resolve(process.cwd(), 'src/app/_layout.tsx'), 'utf8');
const cardScreenSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/app/buddy-card/[id].tsx'),
  'utf8',
);
const completedChallengePath = path.resolve(
  process.cwd(),
  'supabase/migrations/0099_buddy_completed_challenges.sql',
);
const completedChallengeSql = fs.existsSync(completedChallengePath)
  ? fs.readFileSync(completedChallengePath, 'utf8')
  : '';

describe('complete Medals and Challenges gallery contract', () => {
  test('uses the exact route title and existing Buddy Card navigation', () => {
    expect(layoutSource).toContain(
      '<Stack.Screen name="buddy-medals/[id]" options={{ headerShown: true, title: \'Medals and Challenges\' }} />',
    );
    expect(cardScreenSource).toContain("pathname: '/buddy-medals/[id]'");
    expect(cardScreenSource).toContain('params: { id: id! }');
    expect(gallerySource).toContain("title: 'Medals and Challenges'");
  });

  test('shows the complete real medal catalog independently of the featured four', () => {
    expect(gallerySource).toContain('MEDALS.map');
    expect(gallerySource).toContain('<Medal');
    expect(gallerySource).not.toContain('featured_medal_ids');
    expect(MEDALS.length).toBeGreaterThan(4);
    expect(gallerySource).toContain('accessibilityHint="Shows medal details"');
    expect(gallerySource).toContain('Alert.alert');
  });

  test('virtualizes future medals and challenges and provides truthful section states', () => {
    expect(gallerySource).toContain('<FlatList');
    expect(gallerySource).toContain('Completed challenges');
    expect(gallerySource).toContain('No completed challenges yet.');
    expect(gallerySource).toContain('Could not load completed challenges.');
    expect(gallerySource).toContain('accessibilityLabel="Retry completed challenges"');
    expect(gallerySource).not.toMatch(/joined challenges/i);
    expect(gallerySource).not.toMatch(/challenges won/i);
  });

  test('uses the Task 6 access boundary and drops stale target or account completions', () => {
    expect(gallerySource).toContain('getBuddyCardAccessMode(targetId)');
    expect(gallerySource).toContain('getAuthorizedBuddyCard(targetId)');
    expect(gallerySource).toContain('getBuddyCard(targetId)');
    expect(gallerySource).toContain("mode === 'self' || mode === 'buddy'");
    expect(gallerySource).toContain("mode === 'public' && !nextView.card.show_medals");
    expect(gallerySource).toContain('listCompletedChallengesForMember(targetId, viewerId)');
    expect(gallerySource).toContain('BuddyCardLoadGuard');
    expect(gallerySource).toContain('latestTargetIdRef.current === token.targetId');
    expect(gallerySource).toContain('supabase.auth.onAuthStateChange');
    expect(gallerySource).toContain('guard.cancel');
  });

  test('settles a setup failure even if authentication was already bound', () => {
    expect(gallerySource).toContain(
      'activeToken && loadIsCurrent(activeToken)',
    );
    expect(gallerySource).toContain(
      'activeToken ?? guard.bindViewer(targetToken, null)',
    );
  });

  test('offers accessible 48-point medal, retry, and challenge actions in both app schemes', () => {
    expect(gallerySource).toContain('useColorScheme');
    expect(gallerySource).toContain("=== 'dark' ? 'dark' : 'light'");
    expect(gallerySource).toContain('minHeight: 48');
    expect(gallerySource).toContain('accessibilityRole="button"');
    expect(gallerySource).toContain('accessibilityLabel={`Open challenge ${item.challenge.title}`}');
  });
});

describe('completed-challenge server boundary', () => {
  test('authorizes with the block-aware Buddy Card mode and the public medal consent gate', () => {
    expect(completedChallengeSql).toContain(
      'create or replace function public.buddy_completed_challenges(p_target uuid)',
    );
    expect(completedChallengeSql).toContain('security definer');
    expect(completedChallengeSql).toContain("set search_path = ''");
    expect(completedChallengeSql).toContain('public.buddy_card_access_mode(p_target)');
    expect(completedChallengeSql).toContain("access.mode in ('self', 'buddy')");
    expect(completedChallengeSql).toContain("access.mode = 'public'");
    expect(completedChallengeSql).toContain("p.buddy_card -> 'show_medals' = 'true'::jsonb");
    expect(completedChallengeSql).toContain(
      'revoke execute on function public.buddy_completed_challenges(uuid) from public, anon',
    );
    expect(completedChallengeSql).toContain(
      'grant execute on function public.buddy_completed_challenges(uuid) to authenticated',
    );
  });

  test('returns only participation records whose challenge has actually ended', () => {
    expect(completedChallengeSql).toContain('cp.user_id = p_target');
    expect(completedChallengeSql).toContain('c.ends_at <= now()');
    expect(completedChallengeSql).toContain('cp.joined_at <= c.ends_at');
    expect(completedChallengeSql).toContain('order by c.ends_at desc');
    expect(completedChallengeSql).not.toMatch(/winner|rank\s*=\s*1/i);
  });
});

describe('listCompletedChallengesForMember', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue(authUser(viewerId));
  });

  test('loads the server-authorized completed set without a client table query', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          title: 'Morning Momentum',
          metric: 'consistency',
          ends_at: '2026-08-01T00:00:00.000Z',
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          title: 'Monthly 25K',
          metric: 'distance',
          ends_at: '2026-07-01T00:00:00.000Z',
        },
      ],
      error: null,
    });

    await expect(listCompletedChallengesForMember(targetId, viewerId)).resolves.toEqual([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        title: 'Morning Momentum',
        metric: 'consistency',
        endsAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        title: 'Monthly 25K',
        metric: 'distance',
        endsAt: '2026-07-01T00:00:00.000Z',
      },
    ]);
    expect(mockRpc).toHaveBeenCalledWith('buddy_completed_challenges', { p_target: targetId });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockGetUser).toHaveBeenCalledTimes(2);
  });

  test('rejects before querying when the active account is not the initiating viewer', async () => {
    mockGetUser.mockResolvedValue(authUser(otherViewerId));

    await expect(listCompletedChallengesForMember(targetId, viewerId)).rejects.toThrow(
      /account changed/i,
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('rejects a stale response when the account changes while it is loading', async () => {
    mockGetUser
      .mockResolvedValueOnce(authUser(viewerId))
      .mockResolvedValueOnce(authUser(otherViewerId));
    mockRpc.mockResolvedValue({ data: [], error: null });

    await expect(listCompletedChallengesForMember(targetId, viewerId)).rejects.toThrow(
      /account changed/i,
    );
  });

  test('surfaces the server error and preserves an authorized empty result', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    await expect(listCompletedChallengesForMember(targetId, viewerId)).rejects.toThrow('offline');

    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(listCompletedChallengesForMember(targetId, viewerId)).resolves.toEqual([]);
  });
});
