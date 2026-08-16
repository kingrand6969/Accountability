import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
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

import { createChallenge, getChallenge, joinChallenge, listChallenges } from './api';

const apiSource = fs.readFileSync(path.resolve(process.cwd(), 'src/compete/api.ts'), 'utf8');
const boundarySql = fs.readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/0099_buddy_completed_challenges.sql'),
  'utf8',
);

const viewerId = '11111111-1111-4111-8111-111111111111';
const challengeId = '22222222-2222-4222-8222-222222222222';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('challenge participant least-privilege boundary', () => {
  test('replaces the broad participant-row policy with self-only reads', () => {
    expect(boundarySql).toContain(
      'drop policy if exists "Participants are public" on public.challenge_participants',
    );
    expect(boundarySql).toContain(
      'create policy "Participants read own rows" on public.challenge_participants',
    );
    expect(boundarySql).toMatch(/for select\s+using \(auth\.uid\(\) = user_id\)/);
    expect(boundarySql).not.toMatch(
      /create policy "Participants are public"[\s\S]*?for select using \(auth\.role\(\) = 'authenticated'\)/,
    );
  });

  test('exposes only an authenticated aggregate and current-viewer join boolean', () => {
    expect(boundarySql).toContain(
      'create or replace function public.challenge_participation_summary(p_challenges uuid[])',
    );
    expect(boundarySql).toContain('participant_count bigint');
    expect(boundarySql).toContain('joined boolean');
    expect(boundarySql).toContain('count(cp.user_id)');
    expect(boundarySql).toContain('bool_or(cp.user_id = auth.uid())');
    expect(boundarySql).toContain("set search_path = ''");
    expect(boundarySql).toContain(
      'revoke execute on function public.challenge_participation_summary(uuid[]) from public, anon',
    );
    expect(boundarySql).toContain(
      'grant execute on function public.challenge_participation_summary(uuid[]) to authenticated',
    );
    expect(boundarySql).toMatch(/cardinality\(p_challenges\)[\s\S]*?> 100/);

    const signature = boundarySql.match(
      /create or replace function public\.challenge_participation_summary[\s\S]*?language/,
    )?.[0];
    expect(signature).toBeDefined();
    expect(signature).not.toMatch(/user_id uuid/);
  });

  test('mobile callers no longer select other participant rows or embed raw relations', () => {
    expect(apiSource).toMatch(/supabase\.rpc\(\s*'challenge_participation_summary'/);
    expect(apiSource).not.toContain('challenge_participants(count)');
    expect(apiSource).not.toMatch(
      /from\('challenge_participants'\)[\s\S]{0,180}\.select\(/,
    );
  });
});

describe('server-owned challenge enrollment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: viewerId } }, error: null });
    mockRpc.mockResolvedValue({ data: null, error: null });
  });

  test('removes direct inserts and permits enrollment only through the authenticated RPC', () => {
    expect(boundarySql).toContain(
      'drop policy if exists "Join a challenge" on public.challenge_participants',
    );
    expect(boundarySql).toContain(
      'revoke insert on table public.challenge_participants from public, anon, authenticated',
    );
    expect(boundarySql).toMatch(
      /create or replace function public\.join_challenge\(\s*p_challenge uuid,\s*p_timezone_offset integer\s*\)/,
    );
    expect(boundarySql).toContain(
      'revoke execute on function public.join_challenge(uuid, integer) from public, anon',
    );
    expect(boundarySql).toContain(
      'grant execute on function public.join_challenge(uuid, integer) to authenticated',
    );
  });

  test('uses database time for both the active window and joined_at', () => {
    expect(boundarySql).toContain('c.starts_at <= now()');
    expect(boundarySql).toContain('c.ends_at > now()');
    expect(boundarySql).toMatch(
      /insert into public\.challenge_participants[\s\S]*?joined_at[\s\S]*?now\(\)/,
    );
    expect(boundarySql).not.toMatch(/p_joined_at/);
    expect(boundarySql).toContain('on conflict (challenge_id, user_id) do nothing');
  });

  test('joinChallenge sends no client identity or timestamp and is replay-safe on the server', async () => {
    const timezone = jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(480);

    await expect(joinChallenge(challengeId)).resolves.toBeUndefined();

    expect(mockRpc).toHaveBeenCalledWith('join_challenge', {
      p_challenge: challengeId,
      p_timezone_offset: 480,
    });
    expect(mockFrom).not.toHaveBeenCalled();
    timezone.mockRestore();
  });

  test('ended enrollment rejection is surfaced while active enrollment succeeds', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('Challenge is not open.') });
    await expect(joinChallenge(challengeId)).rejects.toThrow('Challenge is not open.');

    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(joinChallenge(challengeId)).resolves.toBeUndefined();
  });

  test('keeps legitimately retained participation eligible for completed history', () => {
    expect(boundarySql).toContain('c.ends_at <= now()');
    expect(boundarySql).toContain('cp.joined_at <= c.ends_at');
    expect(boundarySql).toContain('public.buddy_card_access_mode(p_target)');
    expect(boundarySql).toContain("access.mode in ('self', 'buddy')");
    expect(boundarySql).toContain("p.buddy_card -> 'show_medals' = 'true'::jsonb");
  });
});

describe('challenge card aggregate compatibility', () => {
  const row = {
    id: challengeId,
    creator_id: viewerId,
    title: 'August Momentum',
    metric: 'consistency',
    starts_at: '2026-08-01T00:00:00.000Z',
    ends_at: '2026-08-31T00:00:00.000Z',
    created_at: '2026-08-01T00:00:00.000Z',
    is_official: false,
    cadence: null,
    difficulty: null,
    target: null,
    rest_day_tokens: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('listChallenges preserves participant counts and viewer join state from the summary', async () => {
    const limit = jest.fn().mockResolvedValue({ data: [row], error: null } as never);
    const order = jest.fn(() => ({ limit }));
    const select = jest.fn(() => ({ order }));
    mockFrom.mockReturnValue({ select });
    mockRpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: [{ challenge_id: challengeId, participant_count: 17, joined: true }],
        error: null,
      });

    await expect(listChallenges()).resolves.toEqual([
      expect.objectContaining({ id: challengeId, participants: 17, joined: true }),
    ]);
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'challenge_participation_summary', {
      p_challenges: [challengeId],
    });
  });

  test('getChallenge uses the same aggregate and surfaces summary errors', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: row, error: null } as never);
    const eq = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn(() => ({ eq }));
    mockFrom.mockReturnValue({ select });
    mockRpc.mockResolvedValueOnce({
      data: [{ challenge_id: challengeId, participant_count: 6, joined: false }],
      error: null,
    });

    await expect(getChallenge(challengeId)).resolves.toEqual(
      expect.objectContaining({ id: challengeId, participants: 6, joined: false }),
    );

    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('summary unavailable') });
    await expect(getChallenge(challengeId)).rejects.toThrow('summary unavailable');
  });
});

describe('atomic server-owned challenge creation', () => {
  const createFunction = boundarySql.match(
    /create or replace function public\.create_challenge[\s\S]*?\$\$;/,
  )?.[0] ?? '';

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: viewerId } }, error: null });
  });

  test('binds the expected owner to auth and retains the existing Pro/public boundary', () => {
    expect(createFunction).toContain('p_expected_owner uuid');
    expect(createFunction).toContain('v_user uuid := auth.uid()');
    expect(createFunction).toContain('p_expected_owner <> v_user');
    expect(createFunction).toContain('p.id = v_user');
    expect(createFunction).toContain('p.is_pro = true');
    expect(createFunction).toContain('is_official');
    expect(createFunction).toContain('false');
    expect(createFunction).not.toMatch(/p_(privacy|group|page)/);
    expect(boundarySql).toContain(
      'User-created challenges retain the existing authenticated-public visibility',
    );
  });

  test('uses one database clock for start/created time and validates duration and content', () => {
    expect(createFunction).toContain('v_now timestamptz := now()');
    expect(createFunction).toMatch(/starts_at[\s\S]*?v_now/);
    expect(createFunction).toMatch(/created_at[\s\S]*?v_now/);
    expect(createFunction).toContain("make_interval(days => p_days)");
    expect(createFunction).toMatch(/p_days[\s\S]*?between 1 and 365/);
    expect(createFunction).toContain("p_metric not in ('consistency', 'distance', 'points')");
    expect(createFunction).toMatch(/length\(trim\(p_title\)\)[\s\S]*?between 1 and 80/);
  });

  test('creates challenge and creator membership exactly once in the same transactional RPC', () => {
    expect(createFunction.match(/insert into public\.challenges/g)).toHaveLength(1);
    expect(createFunction.match(/insert into public\.challenge_participants/g)).toHaveLength(1);
    expect(createFunction).toMatch(
      /insert into public\.challenges[\s\S]*?returning id into v_challenge[\s\S]*?insert into public\.challenge_participants/,
    );
    expect(createFunction).not.toMatch(/exception\s+when/);
    expect(createFunction).not.toContain('on conflict');
    expect(createFunction).toContain('return v_challenge');
  });

  test('removes legacy direct creation and grants only the narrow RPC', () => {
    expect(boundarySql).toContain(
      'revoke insert on table public.challenges from public, anon, authenticated',
    );
    expect(boundarySql).toContain(
      'revoke execute on function public.create_challenge(text, text, integer, integer, uuid) from public, anon',
    );
    expect(boundarySql).toContain(
      'grant execute on function public.create_challenge(text, text, integer, integer, uuid) to authenticated',
    );

    const clientCreate = apiSource.match(
      /export async function createChallenge[\s\S]*?\r?\n}\r?\n\r?\nexport async function joinChallenge/,
    )?.[0] ?? '';
    expect(clientCreate).toMatch(/supabase\.rpc\(\s*'create_challenge'/);
    expect(clientCreate).not.toContain("from('challenges')");
    expect(clientCreate).not.toContain('toISOString');
    expect(clientCreate).not.toContain('joinChallenge(');
  });

  test('phone clock cannot move the server-owned window and the returned id is preserved', async () => {
    const toIso = jest
      .spyOn(Date.prototype, 'toISOString')
      .mockImplementation(() => {
        throw new Error('phone clock must not be used');
      });
    const timezone = jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-480);
    mockRpc.mockResolvedValue({ data: challengeId, error: null });

    await expect(
      createChallenge({ title: '  August Momentum  ', metric: 'consistency', days: 14 }),
    ).resolves.toBe(challengeId);
    expect(mockRpc).toHaveBeenCalledWith('create_challenge', {
      p_title: 'August Momentum',
      p_metric: 'consistency',
      p_days: 14,
      p_timezone_offset: -480,
      p_expected_owner: viewerId,
    });
    expect(mockFrom).not.toHaveBeenCalled();
    toIso.mockRestore();
    timezone.mockRestore();
  });

  test('creation errors surface without a second enrollment attempt', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('Creator enrollment failed.') });

    await expect(
      createChallenge({ title: 'Atomic challenge', metric: 'distance', days: 7 }),
    ).rejects.toThrow('Creator enrollment failed.');
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
