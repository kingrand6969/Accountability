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

import { getChallenge, joinChallenge, listChallenges } from './api';

const apiSource = fs.readFileSync(path.resolve(process.cwd(), 'src/compete/api.ts'), 'utf8');
const boundarySql = fs.readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/0099_buddy_completed_challenges.sql'),
  'utf8',
);

const viewerId = '11111111-1111-4111-8111-111111111111';
const challengeId = '22222222-2222-4222-8222-222222222222';

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
      'revoke insert on table public.challenge_participants from authenticated, anon',
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
