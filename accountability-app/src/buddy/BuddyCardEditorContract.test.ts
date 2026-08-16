/* eslint-disable @typescript-eslint/no-require-imports -- card API loads after the Supabase mock */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const mockGetUser = jest.fn<(...args: unknown[]) => Promise<any>>();
const mockFrom = jest.fn<(...args: unknown[]) => any>();

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

const { saveMyBuddyCard } = require('./card') as typeof import('./card');
function model(): any {
  return require('./editorModel');
}

const editorSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/app/buddy-card-edit.tsx'),
  'utf8',
);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function authUser(id: string | null) {
  return { data: { user: id ? { id } : null } };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Buddy Card editor presentation controls', () => {
  test('uses exactly the four accessible palette radios and the reviewed palette tokens', () => {
    expect(editorSource).toContain('BUDDY_CARD_PALETTE_KEYS.map');
    expect(editorSource).toContain('accessibilityRole="radio"');
    expect(editorSource).toContain('accessibilityState={{ selected }}');
    expect(editorSource).toContain('resolveBuddyCardPalette(optionKey, scheme)');
    expect(editorSource).toContain('minHeight: 48');
    expect(editorSource).toContain("polar_blue: 'Polar Blue'");
    expect(editorSource).toContain("victory_ember: 'Victory Ember'");
    expect(editorSource).toContain("momentum_teal: 'Momentum Teal'");
    expect(editorSource).toContain("power_violet: 'Power Violet'");
  });

  test('offers only earned medals with ordered selection and a visible four-medal limit', () => {
    expect(editorSource).toContain('MAX_FEATURED_MEDALS');
    expect(editorSource).toContain('normalizeFeaturedMedalIds');
    expect(editorSource).toContain('toggleFeaturedMedal');
    expect(editorSource).toContain('moveFeaturedMedal');
    expect(editorSource).toContain('You can feature up to four medals');
    expect(editorSource).toContain('myMedalList.map');
    expect(editorSource).toContain('<Medal');
  });

  test('uses the exact public face for a live preview and removes the legacy hero control', () => {
    expect(editorSource).toContain('<PublicBuddyCardFace');
    expect(editorSource).toContain('card={previewCard}');
    expect(editorSource).toContain('featured_medal_ids: featuredMedalIds');
    expect(editorSource).toContain('palette_key: paletteKey');
    expect(editorSource).not.toContain('Use my cover photo as the card hero');
    expect(editorSource).not.toContain('show_hero: value');
  });

  test('has synchronous duplicate-submit, stale-generation, unmount, and dirty navigation guards', () => {
    expect(editorSource).toContain('savingRef.current');
    expect(editorSource).toContain('if (!savingRef.current.tryAcquire()) return');
    expect(editorSource).toContain('generationRef.current');
    expect(editorSource).toContain('mountedRef.current');
    expect(editorSource).toContain('authAfterFailure.user?.id === expectedOwnerId');
    expect(editorSource).toContain('usePreventRemove');
    expect(editorSource).toContain('Discard unsaved Buddy Card changes?');
    expect(editorSource).toContain('Keep editing');
    expect(editorSource).toContain('Discard');
  });

  test('loads rank read-only for the initiating owner and treats preview metrics as optional', () => {
    expect(editorSource).toContain('getRank({ expectedOwnerId: ownerId, snapshot: false })');
    expect(editorSource).toContain('loadBuddyCardEditorData(ownerId');
  });
});

describe('Buddy Card editor model', () => {
  const earned = ['streak', 'distance', 'iron', 'champion', 'explorer'];

  test('selection appends, deduplicates, deselects, and refuses a fifth earned medal', () => {
    const { toggleFeaturedMedal } = model();
    expect(toggleFeaturedMedal(['streak'], 'distance', earned)).toEqual({
      ids: ['streak', 'distance'],
      limitReached: false,
    });
    expect(toggleFeaturedMedal(['streak', 'distance'], 'distance', earned)).toEqual({
      ids: ['streak'],
      limitReached: false,
    });
    expect(toggleFeaturedMedal(['streak', 'distance', 'iron', 'champion'], 'explorer', earned)).toEqual({
      ids: ['streak', 'distance', 'iron', 'champion'],
      limitReached: true,
    });
    expect(toggleFeaturedMedal(['streak'], 'not-earned', earned)).toEqual({
      ids: ['streak'],
      limitReached: false,
    });
  });

  test('moves medals without losing owner order or accepting invalid IDs', () => {
    const { moveFeaturedMedal } = model();
    expect(moveFeaturedMedal(['streak', 'distance', 'iron'], 'distance', -1, earned)).toEqual([
      'distance',
      'streak',
      'iron',
    ]);
    expect(moveFeaturedMedal(['streak', 'distance', 'iron'], 'distance', 1, earned)).toEqual([
      'streak',
      'iron',
      'distance',
    ]);
    expect(moveFeaturedMedal(['streak', 'distance'], 'unknown', 1, earned)).toEqual([
      'streak',
      'distance',
    ]);
  });

  test('normalizes legacy fallback and emits only editor-owned fields', () => {
    const { buildBuddyCardEditorPatch } = model();
    const patch = buildBuddyCardEditorPatch(
      {
        palette_key: 'broken' as never,
        featured_medal_ids: undefined,
        headline: 'Morning work',
        show_headline: true,
        rank_name: 'Mythical',
        medals: 99,
        medals_list: earned.map((id) => ({ id, tier: 0 })),
        hero_url: 'legacy-cover',
        private_future_key: 'keep-me',
      } as never,
      earned,
    );

    expect(patch).toMatchObject({
      palette_key: 'polar_blue',
      featured_medal_ids: earned.slice(0, 4),
      headline: 'Morning work',
      show_headline: true,
      mode: 'custom',
    });
    expect(patch).not.toHaveProperty('rank_name');
    expect(patch).not.toHaveProperty('medals');
    expect(patch).not.toHaveProperty('medals_list');
    expect(patch).not.toHaveProperty('hero_url');
    expect(patch).not.toHaveProperty('private_future_key');
  });

  test('dirty fingerprint changes only for editor-owned values and resets to the saved value', () => {
    const { buddyCardEditorFingerprint, shouldPreventBuddyCardEditorExit } = model();
    const base = { headline: 'Run', palette_key: 'polar_blue', private_future_key: 'one' };
    const unrelated = { ...base, private_future_key: 'two' };
    const changed = { ...base, palette_key: 'momentum_teal' };
    expect(buddyCardEditorFingerprint(base as never)).toBe(buddyCardEditorFingerprint(unrelated as never));
    expect(buddyCardEditorFingerprint(base as never)).not.toBe(buddyCardEditorFingerprint(changed as never));
    expect(buddyCardEditorFingerprint(changed as never)).toBe(buddyCardEditorFingerprint({ ...changed } as never));
    expect(shouldPreventBuddyCardEditorExit(null, 'draft', false)).toBe(false);
    expect(shouldPreventBuddyCardEditorExit('saved', 'saved', false)).toBe(false);
    expect(shouldPreventBuddyCardEditorExit('saved', 'changed', false)).toBe(true);
    expect(shouldPreventBuddyCardEditorExit('saved', 'changed', true)).toBe(false);
  });

  test('generation guard rejects stale and unmounted async completions', () => {
    const { createEditorGenerationGuard } = model();
    const guard = createEditorGenerationGuard();
    const first = guard.begin();
    expect(guard.isCurrent(first)).toBe(true);
    const second = guard.begin();
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
    guard.unmount();
    expect(guard.isCurrent(second)).toBe(false);
  });

  test('one optional preview failure does not reject required editor data', async () => {
    const { loadBuddyCardEditorData } = model();
    const result = await loadBuddyCardEditorData('owner-a', {
      card: async () => ({ headline: 'Required card' }),
      profile: async () => ({ display_name: 'Owner A' }),
      rank: async () => ({ name: 'Elite', earned: 1, medalList: [{ id: 'streak', tier: 0 }] }),
      metrics: async () => { throw new Error('metrics unavailable'); },
      stats: async () => ({ buddies: 2, km: 3, stars: 4, cheers: 5 }),
      boardRank: async () => ({ city: 'Perth', country: 'AU', cityRank: 1, countryRank: 2 }),
    });

    expect(result.card).toEqual({ headline: 'Required card' });
    expect(result.rank.medalList).toEqual([{ id: 'streak', tier: 0 }]);
    expect(result.metrics).toBeNull();
    expect(result.stats?.cheers).toBe(5);
  });

  test('multiple optional preview failures resolve as truthful nulls without partial required state', async () => {
    const { loadBuddyCardEditorData } = model();
    const result = await loadBuddyCardEditorData('owner-a', {
      card: async () => ({ palette_key: 'polar_blue' }),
      profile: async () => ({ display_name: 'Owner A' }),
      rank: async () => ({ name: 'Elite', earned: 0, medalList: [] }),
      metrics: async () => { throw new Error('metrics unavailable'); },
      stats: async () => { throw new Error('stats unavailable'); },
      boardRank: async () => { throw new Error('rank unavailable'); },
    });

    expect(result.card.palette_key).toBe('polar_blue');
    expect(result.profile.display_name).toBe('Owner A');
    expect(result.metrics).toBeNull();
    expect(result.stats).toBeNull();
    expect(result.boardRank).toBeNull();
  });
});

describe('expected-owner Buddy Card save', () => {
  test('rejects an account mismatch before reading or writing profiles', async () => {
    mockGetUser.mockResolvedValue(authUser('owner-b'));

    await expect(saveMyBuddyCard({ palette_key: 'polar_blue' }, 'owner-a')).rejects.toThrow(
      'Account changed. Review your Buddy Card and try again.',
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('rechecks identity after fresh read and never starts a write for the switched account', async () => {
    mockGetUser
      .mockResolvedValueOnce(authUser('owner-a'))
      .mockResolvedValueOnce(authUser('owner-b'));
    const read = {
      select: jest.fn(() => read),
      eq: jest.fn(() => read),
      maybeSingle: jest.fn(async () => ({ data: { buddy_card: { keep: 'yes' } }, error: null })),
    };
    mockFrom.mockReturnValue(read);

    await expect(saveMyBuddyCard({ palette_key: 'power_violet' }, 'owner-a')).rejects.toThrow(
      'Account changed. Review your Buddy Card and try again.',
    );
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(read.eq).toHaveBeenCalledWith('id', 'owner-a');
  });

  test('merges an editor patch into fresh JSON, binds update to expected owner, and preserves unrelated fields', async () => {
    mockGetUser.mockResolvedValue(authUser('owner-a'));
    const writes: unknown[] = [];
    const read = {
      select: jest.fn(() => read),
      eq: jest.fn(() => read),
      maybeSingle: jest.fn(async () => ({
        data: {
          buddy_card: {
            rank_name: 'Mythical',
            hero_url: 'legacy',
            show_bio: true,
            private_future_key: { nested: true },
            palette_key: 'polar_blue',
          },
        },
        error: null,
      })),
    };
    const update = {
      update: jest.fn((value: unknown) => {
        writes.push(value);
        return update;
      }),
      eq: jest.fn(() => update),
      select: jest.fn(() => update),
      maybeSingle: jest.fn(async () => ({ data: { id: 'owner-a' }, error: null })),
    };
    mockFrom.mockReturnValueOnce(read).mockReturnValueOnce(update);

    await saveMyBuddyCard(
      {
        palette_key: 'momentum_teal',
        featured_medal_ids: ['streak'],
        headline: 'New focus',
      },
      'owner-a',
    );

    expect(update.eq).toHaveBeenCalledWith('id', 'owner-a');
    expect(writes).toEqual([
      {
        buddy_card: {
          rank_name: 'Mythical',
          hero_url: 'legacy',
          show_bio: true,
          private_future_key: { nested: true },
          palette_key: 'momentum_teal',
          featured_medal_ids: ['streak'],
          headline: 'New focus',
        },
      },
    ]);
  });

  test('fails closed when RLS cannot return the expected owner and when account changes after write', async () => {
    mockGetUser
      .mockResolvedValueOnce(authUser('owner-a'))
      .mockResolvedValueOnce(authUser('owner-a'))
      .mockResolvedValueOnce(authUser('owner-b'));
    const read = {
      select: jest.fn(() => read),
      eq: jest.fn(() => read),
      maybeSingle: jest.fn(async () => ({ data: { buddy_card: {} }, error: null })),
    };
    const update = {
      update: jest.fn(() => update),
      eq: jest.fn(() => update),
      select: jest.fn(() => update),
      maybeSingle: jest.fn(async () => ({ data: { id: 'owner-a' }, error: null })),
    };
    mockFrom.mockReturnValueOnce(read).mockReturnValueOnce(update);

    await expect(saveMyBuddyCard({ palette_key: 'polar_blue' }, 'owner-a')).rejects.toThrow(
      'Account changed. Review your Buddy Card and try again.',
    );
    expect(update.eq).toHaveBeenCalledWith('id', 'owner-a');

    jest.clearAllMocks();
    mockGetUser.mockResolvedValue(authUser('owner-a'));
    const blockedUpdate = {
      update: jest.fn(() => blockedUpdate),
      eq: jest.fn(() => blockedUpdate),
      select: jest.fn(() => blockedUpdate),
      maybeSingle: jest.fn(async () => ({ data: null, error: null })),
    };
    mockFrom.mockReturnValueOnce(read).mockReturnValueOnce(blockedUpdate);
    await expect(saveMyBuddyCard({ palette_key: 'polar_blue' }, 'owner-a')).rejects.toThrow(
      'Buddy Card could not be saved for this account.',
    );
  });

  test('same-tick duplicate saves can be synchronously locked by the editor before a request starts', async () => {
    const { createSynchronousSubmitLock } = model();
    const pending = deferred<void>();
    const lock = createSynchronousSubmitLock();
    let calls = 0;
    const submit = () => {
      if (!lock.tryAcquire()) return Promise.resolve();
      calls += 1;
      return pending.promise.finally(() => {
        lock.release();
      });
    };

    const first = submit();
    const second = submit();
    expect(calls).toBe(1);
    pending.resolve();
    await Promise.all([first, second]);
  });
});
