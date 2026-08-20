/* eslint-disable @typescript-eslint/no-require-imports -- card API loads after the Supabase mock */
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

const { saveMyBuddyCard } = require('./card') as typeof import('./card');
function model(): any {
  return require('./editorModel');
}

const editorSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/app/buddy-card-edit.tsx'),
  'utf8',
);

function publicFaceInvocation(source: string) {
  const start = source.indexOf('<PublicBuddyCardFace');
  return source.slice(start, source.indexOf('/>', start));
}

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
  test('follows the app manual appearance without changing the approved card palette', () => {
    expect(editorSource).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(editorSource).toContain('const { mode: scheme } = useAppTheme();');
    expect(editorSource).not.toContain('useColorScheme');
    expect(editorSource).toContain("resolveBuddyCardPalette('polar_blue', scheme)");
    expect(editorSource).toContain('<PublicBuddyCardFace');
  });

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

  test('keeps the live public preview subject to the draft privacy toggles', () => {
    const invocation = publicFaceInvocation(editorSource);
    const ownerOverride = invocation.match(/\bownerView(?:\s*=\s*\{([^}]*)\})?/);

    expect(ownerOverride === null || ownerOverride[1]?.trim() === 'false').toBe(true);
  });

  test('has synchronous duplicate-submit, stale-generation, unmount, and dirty navigation guards', () => {
    expect(editorSource).toContain('savingRef.current');
    expect(editorSource).toContain('if (!savingRef.current.tryAcquire()) return');
    expect(editorSource).toContain('createBuddyCardEditorLoadLifecycle');
    expect(editorSource).toContain('lifecycleRef.current.isCurrent');
    expect(editorSource).toContain("transition.action === 'reload'");
    expect(editorSource).toContain("completion === 'account-changed'");
    expect(editorSource).toContain('setLoadError(ACCOUNT_CHANGED)');
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

  test('offers independent accessible country and city ranking consent controls in the live preview draft', () => {
    expect(editorSource).toContain('label="Share country ranking"');
    expect(editorSource).toContain('label="Share city ranking"');
    expect(editorSource).toContain("setBuddyCardRankingConsent(current, 'show_country_rank', value)");
    expect(editorSource).toContain("setBuddyCardRankingConsent(current, 'show_city_rank', value)");
    expect(editorSource).toContain('accessibilityState={{ checked: value }}');
    expect(editorSource).toContain('style={styles.toggleSwitch}');
    expect(editorSource).toContain('toggleSwitch: { minWidth: 48, minHeight: 48');
    expect(editorSource).toContain('card={previewCard}');
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

  test('legacy ranking consent defaults false and country/city toggle without hidden coupling', () => {
    const {
      buddyCardEditorFingerprint,
      normalizeBuddyCardEditorDraft,
      setBuddyCardRankingConsent,
    } = model();
    const legacy = normalizeBuddyCardEditorDraft({ headline: 'Run' });
    expect(legacy).toMatchObject({ show_country_rank: false, show_city_rank: false });

    const country = setBuddyCardRankingConsent(legacy, 'show_country_rank', true);
    expect(country).toMatchObject({ show_country_rank: true, show_city_rank: false });
    const city = setBuddyCardRankingConsent(country, 'show_city_rank', true);
    expect(city).toMatchObject({ show_country_rank: true, show_city_rank: true });
    const countryOff = setBuddyCardRankingConsent(city, 'show_country_rank', false);
    expect(countryOff).toMatchObject({ show_country_rank: false, show_city_rank: true });

    const baseline = buddyCardEditorFingerprint(legacy);
    expect(buddyCardEditorFingerprint(country)).not.toBe(baseline);
    expect(buddyCardEditorFingerprint(normalizeBuddyCardEditorDraft(country))).toBe(
      buddyCardEditorFingerprint(country),
    );
  });

  test('ranking consent persists in the editor-owned patch and becomes pristine after save', () => {
    const {
      buddyCardEditorFingerprint,
      buildBuddyCardEditorPatch,
      normalizeBuddyCardEditorDraft,
      setBuddyCardRankingConsent,
      shouldPreventBuddyCardEditorExit,
    } = model();
    const baselineCard = normalizeBuddyCardEditorDraft({ palette_key: 'polar_blue' });
    const baseline = buddyCardEditorFingerprint(baselineCard);
    const changed = setBuddyCardRankingConsent(baselineCard, 'show_city_rank', true);
    const changedFingerprint = buddyCardEditorFingerprint(changed);
    expect(shouldPreventBuddyCardEditorExit(baseline, changedFingerprint, false)).toBe(true);

    const saved = buildBuddyCardEditorPatch(changed, []);
    expect(saved).toMatchObject({ show_country_rank: false, show_city_rank: true });
    const savedFingerprint = buddyCardEditorFingerprint(saved);
    expect(shouldPreventBuddyCardEditorExit(savedFingerprint, savedFingerprint, false)).toBe(false);
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

  test('an auth event while initial auth is pending cancels the old generation and reloads the event owner', async () => {
    const { createBuddyCardEditorLoadLifecycle } = model();
    const lifecycle = createBuddyCardEditorLoadLifecycle();
    lifecycle.mount();
    const initial = lifecycle.begin();
    const pendingInitialAuth = deferred<string>();
    const lateInitialBind = pendingInitialAuth.promise.then((ownerId) => (
      lifecycle.bindOwner(initial, ownerId)
    ));

    const transition = lifecycle.authEvent('owner-b');
    expect(transition.action).toBe('reload');
    pendingInitialAuth.resolve('owner-a');
    await expect(lateInitialBind).resolves.toBe(false);
    expect(lifecycle.bindOwner(transition.token, 'owner-b')).toBe(true);
    expect(lifecycle.complete(transition.token, 'owner-b')).toBe('current');
  });

  test('final auth mismatch terminates the active load and StrictMode remount rejects old work', () => {
    const { createBuddyCardEditorLoadLifecycle } = model();
    const lifecycle = createBuddyCardEditorLoadLifecycle();
    lifecycle.mount();
    const first = lifecycle.begin();
    expect(lifecycle.bindOwner(first, 'owner-a')).toBe(true);
    expect(lifecycle.complete(first, 'owner-b')).toBe('account-changed');
    expect(lifecycle.isCurrent(first)).toBe(false);

    lifecycle.unmount();
    expect(lifecycle.authEvent('owner-b').action).toBe('ignore');
    lifecycle.mount();
    const remounted = lifecycle.begin();
    expect(lifecycle.bindOwner(first, 'owner-a')).toBe(false);
    expect(lifecycle.bindOwner(remounted, 'owner-b')).toBe(true);
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
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('sends only editor-owned fields to the expected-owner atomic patch RPC', async () => {
    mockGetUser.mockResolvedValue(authUser('owner-a'));
    mockRpc.mockResolvedValue({ data: { palette_key: 'momentum_teal' }, error: null });

    await saveMyBuddyCard(
      ({
        palette_key: 'momentum_teal',
        featured_medal_ids: ['streak'],
        headline: 'New focus',
        show_country_rank: true,
        show_city_rank: false,
        rank_name: 'forged',
        private_future_key: 'blocked',
      } as never),
      'owner-a',
    );

    expect(mockRpc).toHaveBeenCalledWith('patch_my_buddy_card', {
      p_expected_owner: 'owner-a',
      p_patch: {
        palette_key: 'momentum_teal',
        featured_medal_ids: ['streak'],
        headline: 'New focus',
        show_country_rank: true,
        show_city_rank: false,
      },
      p_patch_kind: 'editor',
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('fails closed on RPC/RLS rejection and when account changes after the atomic write', async () => {
    mockGetUser
      .mockResolvedValueOnce(authUser('owner-a'))
      .mockResolvedValueOnce(authUser('owner-b'));
    mockRpc.mockResolvedValue({ data: { palette_key: 'polar_blue' }, error: null });

    await expect(saveMyBuddyCard({ palette_key: 'polar_blue' }, 'owner-a')).rejects.toThrow(
      'Account changed. Review your Buddy Card and try again.',
    );

    jest.clearAllMocks();
    mockGetUser.mockResolvedValue(authUser('owner-a'));
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RLS denied' } });
    await expect(saveMyBuddyCard({ palette_key: 'polar_blue' }, 'owner-a')).rejects.toThrow(
      'RLS denied',
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
