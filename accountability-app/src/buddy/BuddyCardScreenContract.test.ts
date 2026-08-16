/* eslint-disable @typescript-eslint/no-require-imports -- relationship API loads after the Supabase mock */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const mockGetUser = jest.fn<(...args: unknown[]) => Promise<any>>();
const mockFrom = jest.fn<(...args: unknown[]) => any>();
const mockRpc = jest.fn<(...args: unknown[]) => Promise<any>>();

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

function relationship(): typeof import('./buddyCardRelationship') {
  return require('./buddyCardRelationship');
}

const screenSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/app/buddy-card/[id].tsx'),
  'utf8',
);
const feedSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/app/(app)/index.tsx'),
  'utf8',
);
const fullProfileSql = fs.readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/0098_buddy_full_profile.sql'),
  'utf8',
);

function authUser(id: string | null) {
  return { data: { user: id ? { id } : null } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Buddy Card viewer state', () => {
  test('owner, buddy, and public modes are mutually exclusive', () => {
    const { buddyCardViewerMode } = relationship();
    expect(buddyCardViewerMode('owner', 'owner', true)).toBe('owner');
    expect(buddyCardViewerMode('viewer', 'owner', true)).toBe('buddy');
    expect(buddyCardViewerMode('viewer', 'owner', false)).toBe('public');
    expect(buddyCardViewerMode(null, 'owner', true)).toBe('public');
  });

  test('owner renders an edit action and never renders Connect-to-self or profile options', () => {
    expect(screenSource).toContain('const ownerView = currentUserId === id');
    expect(screenSource).toContain("router.push('/buddy-card-edit' as never)");
    expect(screenSource).toContain('!ownerView && !isBuddy');
    expect(screenSource).toContain('headerRight: ownerView');
  });

  test('buddy receives the full profile branch while a non-buddy receives only the public branch', () => {
    expect(screenSource).toContain('const fullBuddyView = isBuddy && !ownerView');
    expect(screenSource).toContain('fullBuddyView ? (');
    expect(screenSource).toContain('<BuddyCardFace');
    expect(screenSource).toContain('<PublicBuddyCardFace');
    expect(screenSource).toContain('ownerView={ownerView}');
    expect(screenSource).toContain('getAuthorizedBuddyCard(targetId, viewerId)');
  });

  test('the signed-in feed avatar is a separate 48-point route to the owner Buddy Card', () => {
    expect(feedSource).toContain('accessibilityLabel="View your Buddy Card"');
    expect(feedSource).toContain("pathname: '/buddy-card/[id]'");
    expect(feedSource).toContain('params: { id: ownerId }');
    expect(feedSource).toContain('avatarButton: { minWidth: 48, minHeight: 48');
  });

  test('screen exposes truthful error and retry UI and restarts after account changes', () => {
    expect(screenSource).toContain('Could not load Buddy Card');
    expect(screenSource).toContain('accessibilityLabel="Retry loading Buddy Card"');
    expect(screenSource).toContain('setReloadKey((value) => value + 1)');
    expect(screenSource).toContain('setAccountEpoch((value) => value + 1)');
  });
});

describe('full Buddy profile privacy boundary', () => {
  test('PostgreSQL releases the full profile only to self or an accepted buddy pair', () => {
    expect(fullProfileSql).toContain('create or replace function public.buddy_full_profile');
    expect(fullProfileSql).toContain('security definer');
    expect(fullProfileSql).toContain('auth.uid()');
    expect(fullProfileSql).toContain('from public.buddy_links');
    expect(fullProfileSql).toContain('revoke execute on function public.buddy_full_profile(uuid) from public, anon');
    expect(fullProfileSql).toContain('grant execute on function public.buddy_full_profile(uuid) to authenticated');
  });

  test('the client loader is owner-bound before and after the authorized RPC', async () => {
    const viewerId = '11111111-1111-4111-8111-111111111111';
    const targetId = '22222222-2222-4222-8222-222222222222';
    mockGetUser.mockResolvedValue(authUser(viewerId));
    mockRpc.mockResolvedValue({
      data: [{
        id: targetId,
        display_name: 'Training buddy',
        avatar_url: null,
        area: 'Perth',
        bio: 'Full buddy bio',
        created_at: '2026-01-01T00:00:00.000Z',
        last_active_at: null,
        buddy_card: { headline: 'Private buddy focus' },
      }],
      error: null,
    });

    const { getAuthorizedBuddyCard } = require('./card') as typeof import('./card');
    await expect(getAuthorizedBuddyCard(targetId, viewerId)).resolves.toMatchObject({
      id: targetId,
      bio: 'Full buddy bio',
      card: { headline: 'Private buddy focus' },
    });
    expect(mockRpc).toHaveBeenCalledWith('buddy_full_profile', { p_target: targetId });
    expect(mockGetUser).toHaveBeenCalledTimes(2);
  });
});

describe('Buddy Card connection lifecycle', () => {
  test('relationship lookup stays bound to the initiating viewer and target', async () => {
    const viewerId = '11111111-1111-4111-8111-111111111111';
    const targetId = '22222222-2222-4222-8222-222222222222';
    const limit = jest.fn<(...args: unknown[]) => Promise<any>>()
      .mockResolvedValue({ data: [{ user_a: viewerId }], error: null });
    const or = jest.fn<(...args: unknown[]) => any>().mockReturnValue({ limit });
    const select = jest.fn<(...args: unknown[]) => any>().mockReturnValue({ or });
    mockFrom.mockReturnValue({ select });
    mockGetUser.mockResolvedValue(authUser(viewerId));

    await expect(relationship().areBuddiesAsOwner(viewerId, targetId)).resolves.toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('buddy_links');
    expect(or).toHaveBeenCalledWith(
      `and(user_a.eq.${viewerId},user_b.eq.${targetId}),` +
      `and(user_a.eq.${targetId},user_b.eq.${viewerId})`,
    );
    expect(mockGetUser).toHaveBeenCalledTimes(2);
  });

  test('account replacement during relationship lookup rejects the stale relationship', async () => {
    const viewerId = '11111111-1111-4111-8111-111111111111';
    const targetId = '22222222-2222-4222-8222-222222222222';
    const limit = jest.fn<(...args: unknown[]) => Promise<any>>()
      .mockResolvedValue({ data: [{ user_a: viewerId }], error: null });
    const or = jest.fn<(...args: unknown[]) => any>().mockReturnValue({ limit });
    const select = jest.fn<(...args: unknown[]) => any>().mockReturnValue({ or });
    mockFrom.mockReturnValue({ select });
    mockGetUser
      .mockResolvedValueOnce(authUser(viewerId))
      .mockResolvedValueOnce(authUser('33333333-3333-4333-8333-333333333333'));

    await expect(relationship().areBuddiesAsOwner(viewerId, targetId))
      .rejects.toThrow(/account changed/i);
  });

  test('a synchronous lock closes same-tick duplicate Connect taps', async () => {
    const { createBuddyCardConnectLock } = relationship();
    const lock = createBuddyCardConnectLock();
    const pending = deferred<void>();
    let calls = 0;

    const connect = () => {
      const token = lock.tryAcquire('viewer', 'target');
      if (!token) return Promise.resolve();
      calls += 1;
      return pending.promise.finally(() => lock.release(token));
    };

    const first = connect();
    const second = connect();
    expect(calls).toBe(1);
    pending.resolve();
    await Promise.all([first, second]);
  });

  test('a stale completion cannot release a newer target action', () => {
    const { createBuddyCardConnectLock } = relationship();
    const lock = createBuddyCardConnectLock();
    const stale = lock.tryAcquire('viewer', 'target-a')!;
    lock.cancel(stale);
    const current = lock.tryAcquire('viewer', 'target-b')!;
    lock.release(stale);
    expect(lock.owns(current, 'viewer', 'target-b')).toBe(true);
  });

  test('self requests stop before authentication or database access', async () => {
    const { sendBuddyRequestAsOwner } = relationship();
    await expect(sendBuddyRequestAsOwner('same', 'same')).rejects.toThrow(/yourself/i);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('request insertion is bound to immutable initiating owner and target', async () => {
    const insert = jest.fn<(...args: unknown[]) => Promise<any>>().mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue(authUser('11111111-1111-4111-8111-111111111111'));
    mockFrom.mockReturnValue({ insert });

    await relationship().sendBuddyRequestAsOwner(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    );

    expect(mockFrom).toHaveBeenCalledWith('buddy_requests');
    expect(insert).toHaveBeenCalledWith({
      from_user: '11111111-1111-4111-8111-111111111111',
      to_user: '22222222-2222-4222-8222-222222222222',
    });
  });

  test('an account change after the insert rejects stale success', async () => {
    const insert = jest.fn<(...args: unknown[]) => Promise<any>>().mockResolvedValue({ error: null });
    mockGetUser
      .mockResolvedValueOnce(authUser('11111111-1111-4111-8111-111111111111'))
      .mockResolvedValueOnce(authUser('33333333-3333-4333-8333-333333333333'));
    mockFrom.mockReturnValue({ insert });

    await expect(relationship().sendBuddyRequestAsOwner(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    )).rejects.toThrow(/account changed/i);
  });
});
