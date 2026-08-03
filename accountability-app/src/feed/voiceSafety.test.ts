import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import {
  VoiceSafetyCoordinator,
  voiceSafetyCompletionBelongsToView,
  voiceSafetyPermission,
} from './voiceSafety';
import {
  blockVoiceEncouragementSender,
  deleteMyVoiceEncouragement,
  reportVoiceEncouragement,
} from './api';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  supabase: { auth: { getUser: jest.fn() }, from: jest.fn() },
}));
jest.mock('../profiles/publicProfiles', () => ({ getPublicProfiles: jest.fn() }));
jest.mock('../lib/r2', () => ({ uploadBytesToR2: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

const mockGetUser = supabase.auth.getUser as jest.Mock<any>;
const mockFrom = supabase.from as jest.Mock<any>;

const apiSource = readFileSync(require.resolve('./api'), 'utf8');
const senderPolicy = readFileSync(
  require.resolve('../../supabase/migrations/0086_voice_encouragement.sql'),
  'utf8',
);
const buddyPolicy = readFileSync(
  require.resolve('../../supabase/migrations/0013_buddy.sql'),
  'utf8',
);
const voiceOperationPolicy = readFileSync(
  require.resolve('../../supabase/migrations/0093_voice_encouragement_operations.sql'),
  'utf8',
);
const VOICE = '31000000-0000-4000-8000-000000000020';
const SENDER = '31000000-0000-4000-8000-000000000002';
const OWNER = '31000000-0000-4000-8000-000000000001';
const OTHER = '31000000-0000-4000-8000-000000000003';

beforeEach(() => {
  mockGetUser.mockReset();
  mockFrom.mockReset();
});

describe('Group 3 voice encouragement policy characterization', () => {
  test('retains sender-only delete and canonical report/block tables', () => {
    expect(senderPolicy).toMatch(
      /create policy encouragements_delete[\s\S]*for delete to authenticated[\s\S]*using \(user_id = auth\.uid\(\)\)/,
    );
    expect(buddyPolicy).toContain('create table if not exists public.buddy_blocks');
    expect(buddyPolicy).toContain('create table if not exists public.buddy_reports');
    expect(apiSource).not.toMatch(/voice_(reports|blocks)/);
  });

  test('adds only sender-or-authorized-post select without changing delete or adding a definer', () => {
    expect(voiceOperationPolicy).toMatch(
      /drop policy if exists encouragements_select on public\.post_encouragements;\s*create policy encouragements_select on public\.post_encouragements\s*for select to authenticated\s*using \(\s*user_id = auth\.uid\(\)\s*or public\.can_view_post\(post_id, auth\.uid\(\)\)\s*\);/,
    );
    expect(voiceOperationPolicy).not.toContain('encouragements_delete');
    expect(voiceOperationPolicy).not.toMatch(/security\s+definer/i);
    expect(voiceOperationPolicy).not.toMatch(/\b(create|alter|drop)\s+(table|function|type|column)\b/i);
    expect((voiceOperationPolicy.match(/create policy/gi) ?? [])).toHaveLength(1);
  });

  test('allows sender delete independently of post ownership', () => {
    expect(voiceSafetyPermission(SENDER, SENDER, OWNER)).toEqual({
      delete: true, report: false, block: false,
    });
  });

  test('allows only a distinct post recipient to report or block', () => {
    expect(voiceSafetyPermission(OWNER, SENDER, OWNER)).toEqual({
      delete: false, report: true, block: true,
    });
    expect(voiceSafetyPermission(SENDER, SENDER, SENDER)).toEqual({
      delete: true, report: false, block: false,
    });
    expect(voiceSafetyPermission(OTHER, SENDER, OWNER)).toEqual({
      delete: false, report: false, block: false,
    });
  });
});

describe('VoiceSafetyCoordinator', () => {
  const view = {
    viewerId: OWNER,
    postOwnerId: OWNER,
    postId: 'post-a',
    generation: 1,
    mounted: true,
  };

  test('locks the exact row/action and rejects same-frame duplicates', () => {
    const coordinator = new VoiceSafetyCoordinator(view);
    const first = coordinator.begin(VOICE, SENDER, 'report');
    expect(first).not.toBeNull();
    expect(coordinator.begin(VOICE, SENDER, 'report')).toBeNull();
    expect(coordinator.begin(VOICE, SENDER, 'block')).toBeNull();
  });

  test('rejects unrelated-viewer report/block and permits sender delete', () => {
    const unrelated = new VoiceSafetyCoordinator({ ...view, viewerId: OTHER });
    expect(unrelated.begin(VOICE, SENDER, 'report')).toBeNull();
    expect(unrelated.begin(VOICE, SENDER, 'block')).toBeNull();
    const sender = new VoiceSafetyCoordinator({ ...view, viewerId: SENDER });
    expect(sender.begin(VOICE, SENDER, 'delete')).not.toBeNull();
  });

  test.each([
    { viewerId: OTHER },
    { postOwnerId: OTHER },
    { postId: 'post-b' },
    { generation: 2 },
    { mounted: false },
  ])('A/B account, post, generation or unmount makes completion stale: %o', (change) => {
    const coordinator = new VoiceSafetyCoordinator(view);
    const stale = coordinator.begin(VOICE, SENDER, 'block')!;
    coordinator.update({ ...view, ...change });
    expect(coordinator.complete(stale)).toEqual({ apply: false, release: false });
  });

  test('ABA and old-row completions cannot release the replacement lock', () => {
    const coordinator = new VoiceSafetyCoordinator(view);
    const stale = coordinator.begin(VOICE, SENDER, 'report')!;
    coordinator.update({ ...view, viewerId: OTHER, generation: 2 });
    coordinator.update({ ...view, generation: 3 });
    const current = coordinator.begin('31000000-0000-4000-8000-000000000021', SENDER, 'report')!;
    expect(coordinator.complete(stale)).toEqual({ apply: false, release: false });
    expect(coordinator.begin(current.voiceId, SENDER, 'report')).toBeNull();
    expect(coordinator.complete(current)).toEqual({ apply: true, release: true });
  });

  test('token ownership binds viewer, post owner, post, row, sender, action and generation', () => {
    const coordinator = new VoiceSafetyCoordinator(view);
    const token = coordinator.begin(VOICE, SENDER, 'report')!;
    expect(voiceSafetyCompletionBelongsToView(token, token, view)).toBe(true);
    expect(voiceSafetyCompletionBelongsToView(
      token,
      { ...token, voiceId: '31000000-0000-4000-8000-000000000021' },
      view,
    )).toBe(false);
    expect(voiceSafetyCompletionBelongsToView(token, token, { ...view, postOwnerId: OTHER })).toBe(false);
  });
});

describe('voice safety API behavior', () => {
  test.each([
    deleteMyVoiceEncouragement,
    reportVoiceEncouragement,
    blockVoiceEncouragementSender,
  ])('rejects malformed opaque IDs before auth or database work', async (callback) => {
    await expect(callback('not-a-uuid')).rejects.toThrow('invalid');
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test.each([
    deleteMyVoiceEncouragement,
    reportVoiceEncouragement,
    blockVoiceEncouragementSender,
  ])('requires current authenticated user', async (callback) => {
    auth(null);
    await expect(callback(VOICE)).rejects.toThrow('Not signed in');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('sender delete binds both exact row and authenticated sender', async () => {
    auth(SENDER);
    const eq = jest.fn<any>();
    const chain: any = { delete: jest.fn(() => chain), eq };
    eq.mockReturnValueOnce(chain).mockResolvedValueOnce({ error: null });
    mockFrom.mockReturnValueOnce(chain);
    await deleteMyVoiceEncouragement(VOICE);
    expect(mockFrom).toHaveBeenCalledWith('post_encouragements');
    expect(eq).toHaveBeenNthCalledWith(1, 'id', VOICE);
    expect(eq).toHaveBeenNthCalledWith(2, 'user_id', SENDER);
  });

  test('delete propagates database errors', async () => {
    auth(SENDER);
    mockFrom.mockReturnValueOnce(deleteChain({ message: 'delete failed' }));
    await expect(deleteMyVoiceEncouragement(VOICE)).rejects.toMatchObject({ message: 'delete failed' });
  });

  test.each([
    reportVoiceEncouragement,
    blockVoiceEncouragementSender,
  ])('requires a readable exact voice target', async (callback) => {
    auth(OWNER);
    mockFrom.mockReturnValueOnce(targetChain(null));
    await expect(callback(VOICE)).rejects.toThrow('unavailable');
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('propagates an exact-target lookup error without a canonical insert', async () => {
    auth(OWNER);
    mockFrom.mockReturnValueOnce(targetChain(null, { code: '42501', message: 'target denied' }));
    await expect(reportVoiceEncouragement(VOICE)).rejects.toMatchObject({ code: '42501' });
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test.each([
    reportVoiceEncouragement,
    blockVoiceEncouragementSender,
  ])('rejects self action and performs no canonical insert', async (callback) => {
    auth(SENDER);
    mockFrom.mockReturnValueOnce(targetChain(target(SENDER, SENDER)));
    await expect(callback(VOICE)).rejects.toThrow(/own|yourself/);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test.each([
    reportVoiceEncouragement,
    blockVoiceEncouragementSender,
  ])('rejects a readable voice for an unrelated nonrecipient', async (callback) => {
    auth(OTHER);
    mockFrom.mockReturnValueOnce(targetChain(target(SENDER, OWNER)));
    await expect(callback(VOICE)).rejects.toThrow('Only the recipient');
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('recipient reports through canonical buddy_reports with no media reference', async () => {
    auth(OWNER);
    const insert = jest.fn<any>().mockResolvedValue({ error: null });
    mockFrom.mockReturnValueOnce(targetChain(target(SENDER, OWNER))).mockReturnValueOnce({ insert });
    await reportVoiceEncouragement(VOICE);
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'buddy_reports');
    expect(insert).toHaveBeenCalledWith({
      reporter: OWNER,
      reported: SENDER,
      reason: `Reported voice encouragement ${VOICE}`,
    });
    expect(JSON.stringify(insert.mock.calls)).not.toContain('r2://');
  });

  test('reports intentionally allow duplicate moderation events', async () => {
    auth(OWNER);
    const insert = jest.fn<any>().mockResolvedValue({ error: null });
    mockFrom
      .mockReturnValueOnce(targetChain(target(SENDER, OWNER))).mockReturnValueOnce({ insert })
      .mockReturnValueOnce(targetChain(target(SENDER, OWNER))).mockReturnValueOnce({ insert });
    await reportVoiceEncouragement(VOICE);
    await reportVoiceEncouragement(VOICE);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  test('recipient block uses canonical buddy_blocks and treats duplicate 23505 as success', async () => {
    auth(OWNER);
    const insert = jest.fn<any>()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate' } });
    mockFrom
      .mockReturnValueOnce(targetChain(target(SENDER, OWNER))).mockReturnValueOnce({ insert })
      .mockReturnValueOnce(targetChain(target(SENDER, OWNER))).mockReturnValueOnce({ insert });
    await blockVoiceEncouragementSender(VOICE);
    await blockVoiceEncouragementSender(VOICE);
    expect(insert).toHaveBeenNthCalledWith(1, { blocker: OWNER, blocked: SENDER });
    expect(insert).toHaveBeenCalledTimes(2);
  });

  test('canonical insert errors other than duplicate block propagate', async () => {
    auth(OWNER);
    mockFrom
      .mockReturnValueOnce(targetChain(target(SENDER, OWNER)))
      .mockReturnValueOnce({ insert: jest.fn<any>().mockResolvedValue({ error: { code: '42501', message: 'denied' } }) });
    await expect(blockVoiceEncouragementSender(VOICE)).rejects.toMatchObject({ code: '42501' });
  });

  test('report insert errors propagate without retrying or changing tables', async () => {
    auth(OWNER);
    const insert = jest.fn<any>().mockResolvedValue({ error: { code: '42501', message: 'report denied' } });
    mockFrom.mockReturnValueOnce(targetChain(target(SENDER, OWNER))).mockReturnValueOnce({ insert });
    await expect(reportVoiceEncouragement(VOICE)).rejects.toMatchObject({ code: '42501' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });
});

function auth(userId: string | null) {
  mockGetUser.mockResolvedValue({
    data: { user: userId ? { id: userId } : null },
    error: null,
  });
}

function target(senderId: string, postOwnerId: string) {
  return { user_id: senderId, post: { user_id: postOwnerId } };
}

function targetChain(data: ReturnType<typeof target> | null, error: unknown = null) {
  const chain: any = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(async () => ({ data, error }));
  return chain;
}

function deleteChain(error: unknown) {
  const chain: any = {};
  chain.delete = jest.fn(() => chain);
  chain.eq = jest.fn<any>().mockReturnValueOnce(chain).mockResolvedValueOnce({ error });
  return chain;
}
