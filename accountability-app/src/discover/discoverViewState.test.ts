import { describe, expect, jest, test } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createDiscoverActionLock,
  createDiscoverLoadGuard,
  createDiscoverOperationGuard,
  DISCOVER_FIRST_VIEWPORT_HEIGHT,
  DISCOVER_GEOMETRY,
  keepPublicDiscoveryRows,
  mapDiscoverViewState,
  preparePublicCandidates,
  readDiscoverFixtureConfig,
  requestAllowedCardsIfCurrent,
  retainAllowedCards,
} from './discoverViewState';
import { deriveDiscoverLayout } from './DiscoverExperience';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ session: null }) }));
jest.mock('../buddy/api', () => ({ listDiscoveryCandidates: jest.fn(), sendRequest: jest.fn() }));
jest.mock('../buddy/card', () => ({ getBuddyCards: jest.fn() }));
jest.mock('../groups/api', () => ({ joinGroup: jest.fn(), listGroups: jest.fn() }));
jest.mock('../compete/api', () => ({
  joinChallenge: jest.fn(),
  listChallenges: jest.fn(),
  metricMeta: jest.fn(() => ({ label: 'Metric' })),
}));
jest.mock('../ui/Toast', () => ({ showToast: jest.fn() }));
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

const implementationPath = path.join(__dirname, 'discoverViewState.ts');
const source = existsSync(implementationPath) ? readFileSync(implementationPath, 'utf8') : '';

describe('DiscoverViewState contract', () => {
  test('defines the exact approved discriminated union', () => {
    const normalized = source.replace(/\s+/g, ' ').trim();

    expect(normalized).toContain(
      "export type DiscoverViewState = | { status: 'loading' } | { status: 'ready' } | { status: 'empty'; message: string } | { status: 'offline'; message: string } | { status: 'permission-denied'; message: string } | { status: 'error'; message: string };",
    );
  });

  test('does not widen the approved statuses or message shapes', () => {
    expect(source).not.toMatch(/status:\s*['"]retry['"]/);
    expect(source).not.toMatch(/status:\s*['"]populated['"]/);
    expect(source).not.toMatch(/status:\s*['"]permission-granted['"]/);
    expect(source).not.toMatch(/message\?:\s*string/);
  });

  test('maps loading before every other input', () => {
    expect(
      mapDiscoverViewState({
        loading: true,
        error: 'ignored',
        network: 'offline',
        permission: 'denied',
        nearby: true,
        privacySafeNearbyQuery: false,
        dataCount: 0,
      }),
    ).toEqual({ status: 'loading' });
  });

  test('maps offline, permission denial, errors, empty and ready distinctly', () => {
    expect(
      mapDiscoverViewState({
        loading: false,
        error: null,
        network: 'offline',
        permission: 'unasked',
        nearby: false,
        privacySafeNearbyQuery: false,
        dataCount: 2,
      }),
    ).toEqual({ status: 'offline', message: 'Discovery is offline. Check your connection and retry.' });
    expect(
      mapDiscoverViewState({
        loading: false,
        error: null,
        network: 'online',
        permission: 'denied',
        nearby: true,
        privacySafeNearbyQuery: false,
        dataCount: 2,
      }),
    ).toEqual({
      status: 'permission-denied',
      message: 'Nearby stays off until location permission and a privacy-safe query are available.',
    });
    expect(
      mapDiscoverViewState({
        loading: false,
        error: 'Discovery could not refresh.',
        network: 'online',
        permission: 'unasked',
        nearby: false,
        privacySafeNearbyQuery: false,
        dataCount: 2,
      }),
    ).toEqual({ status: 'error', message: 'Discovery could not refresh.' });
    expect(
      mapDiscoverViewState({
        loading: false,
        error: null,
        network: 'online',
        permission: 'unasked',
        nearby: false,
        privacySafeNearbyQuery: false,
        dataCount: 0,
      }),
    ).toEqual({ status: 'empty', message: 'No public recommendations are available yet.' });
    expect(
      mapDiscoverViewState({
        loading: false,
        error: null,
        network: 'online',
        permission: 'granted',
        nearby: false,
        privacySafeNearbyQuery: false,
        dataCount: 1,
      }),
    ).toEqual({ status: 'ready' });
  });

  test.each(['unasked', 'denied', 'blocked'] as const)(
    'keeps Nearby unavailable when permission is %s',
    (permission) => {
      expect(
        mapDiscoverViewState({
          loading: false,
          error: null,
          network: 'online',
          permission,
          nearby: true,
          privacySafeNearbyQuery: false,
          dataCount: 3,
        }).status,
      ).toBe('permission-denied');
    },
  );

  test('keeps granted Nearby unavailable until a privacy-safe query is proven', () => {
    expect(
      mapDiscoverViewState({
        loading: false,
        error: null,
        network: 'online',
        permission: 'granted',
        nearby: true,
        privacySafeNearbyQuery: false,
        dataCount: 3,
      }).status,
    ).toBe('permission-denied');
  });

  test('only maps Nearby ready when permission and the privacy-safe query are both proven', () => {
    expect(
      mapDiscoverViewState({
        loading: false,
        error: null,
        network: 'online',
        permission: 'granted',
        nearby: true,
        privacySafeNearbyQuery: true,
        dataCount: 3,
      }),
    ).toEqual({ status: 'ready' });
  });

  test('load guard rejects A-to-B, ABA, overlapping retry and unmount completions', () => {
    const guard = createDiscoverLoadGuard();
    const a1 = guard.begin('A');
    const b = guard.begin('B');
    expect(guard.canCommit(a1, 'B')).toBe(false);
    expect(guard.canCommit(b, 'B')).toBe(true);
    const a2 = guard.begin('A');
    expect(guard.canCommit(b, 'A')).toBe(false);
    expect(guard.canCommit(a1, 'A')).toBe(false);
    const retry = guard.begin('A');
    expect(guard.canCommit(a2, 'A')).toBe(false);
    expect(guard.canCommit(retry, 'A')).toBe(true);
    guard.unmount();
    expect(guard.canCommit(retry, 'A')).toBe(false);
  });

  test('load guard survives Strict Effects setup-cleanup-setup without reviving old work', () => {
    const guard = createDiscoverLoadGuard();
    guard.mount();
    const firstSetup = guard.begin('A');
    guard.unmount();
    guard.mount();
    const secondSetup = guard.begin('A');
    expect(guard.canCommit(firstSetup, 'A')).toBe(false);
    expect(guard.canCommit(secondSetup, 'A')).toBe(true);
  });

  test('operation completions suppress stale A-to-B, ABA, overlap and unmount UI/toasts', () => {
    const guard = createDiscoverOperationGuard();
    const a1 = guard.begin('person:1', 'A');
    expect(guard.canCommit(a1, 'B')).toBe(false);
    guard.invalidate();
    const b = guard.begin('person:1', 'B');
    guard.invalidate();
    const a2 = guard.begin('person:1', 'A');
    expect(guard.canCommit(a1, 'A')).toBe(false);
    expect(guard.canCommit(b, 'A')).toBe(false);
    const retry = guard.begin('person:1', 'A');
    expect(guard.canCommit(a2, 'A')).toBe(false);
    expect(guard.canCommit(retry, 'A')).toBe(true);
    guard.unmount();
    expect(guard.canCommit(retry, 'A')).toBe(false);
  });

  test('action lock closes same-tick double taps and permits retry after release', () => {
    const lock = createDiscoverActionLock();
    const first = lock.acquire('A:person:1');
    expect(first).not.toBeNull();
    expect(lock.acquire('A:person:1')).toBeNull();
    expect(lock.acquire('A:group:1')).not.toBeNull();
    lock.release(first!);
    expect(lock.acquire('A:person:1')).not.toBeNull();
    lock.clear();
    expect(lock.acquire('A:group:1')).not.toBeNull();
  });

  test('stale owner release cannot delete the new owner lock for the same entity', () => {
    const lock = createDiscoverActionLock();
    const a = lock.acquire('A:person:1');
    expect(a).not.toBeNull();
    lock.clear();
    const b = lock.acquire('B:person:1');
    expect(b).not.toBeNull();
    lock.release(a!);
    expect(lock.acquire('B:person:1')).toBeNull();
    lock.release(b!);
    expect(lock.acquire('B:person:1')).not.toBeNull();
  });

  test('fixture is absent by default and only accepts explicit staging IDs and HTTPS media', () => {
    expect(readDiscoverFixtureConfig({ EXPO_PUBLIC_APP_VARIANT: 'staging' })).toBeNull();
    expect(
      readDiscoverFixtureConfig({
        EXPO_PUBLIC_APP_VARIANT: 'staging',
        EXPO_PUBLIC_DISCOVER_FIXTURE_ENABLED: 'true',
        EXPO_PUBLIC_DISCOVER_FIXTURE_PERSON_ID: 'Maya',
        EXPO_PUBLIC_DISCOVER_FIXTURE_GROUP_ID: 'Sunrise Runners',
        EXPO_PUBLIC_DISCOVER_FIXTURE_CHALLENGE_ID: '30-Day Consistency Challenge',
        EXPO_PUBLIC_DISCOVER_FIXTURE_GROUP_MEDIA_URL: 'https://example.com/group.jpg',
      }),
    ).toBeNull();
    expect(
      readDiscoverFixtureConfig({
        EXPO_PUBLIC_APP_VARIANT: 'staging',
        EXPO_PUBLIC_DISCOVER_FIXTURE_ENABLED: 'true',
        EXPO_PUBLIC_DISCOVER_FIXTURE_PERSON_ID: '11111111-1111-4111-8111-111111111111',
        EXPO_PUBLIC_DISCOVER_FIXTURE_GROUP_ID: '22222222-2222-4222-8222-222222222222',
        EXPO_PUBLIC_DISCOVER_FIXTURE_CHALLENGE_ID: '33333333-3333-4333-8333-333333333333',
        EXPO_PUBLIC_DISCOVER_FIXTURE_GROUP_MEDIA_URL: 'https://example.com/group.jpg',
      }),
    ).toEqual({
      personId: '11111111-1111-4111-8111-111111111111',
      groupId: '22222222-2222-4222-8222-222222222222',
      challengeId: '33333333-3333-4333-8333-333333333333',
      groupMediaUrl: 'https://example.com/group.jpg',
    });
  });

  test('filters explicitly private candidate, group and challenge rows', () => {
    expect(
      keepPublicDiscoveryRows([
        { id: 'candidate-public' },
        { id: 'candidate-private', visibility: 'private' },
        { id: 'group-public', privacy: 'public' },
        { id: 'group-private', privacy: 'private' },
        { id: 'challenge-public', visibility: 'public' },
        { id: 'challenge-private', visibility: 'private' },
      ]).map((row) => row.id),
    ).toEqual(['candidate-public', 'group-public', 'challenge-public']);
  });

  test('passes only allowed public candidate IDs to card loading and drops extra cards', () => {
    const prepared = preparePublicCandidates(
      [
        { id: 'public-1', visibility: 'public' },
        { id: 'private-1', visibility: 'private' },
        { id: 'public-2' },
      ],
      'public_profiles',
    );
    expect([...prepared.allowedIds]).toEqual(['public-1', 'public-2']);
    const cards = retainAllowedCards(
      new Map([
        ['public-1', { label: 'allowed' }],
        ['private-1', { label: 'must drop' }],
        ['unexpected', { label: 'must drop' }],
      ]),
      prepared.allowedIds,
    );
    expect([...cards.keys()]).toEqual(['public-1']);
  });

  test('stale load after list preparation makes zero buddy-card requests', async () => {
    let current = true;
    let cardRequests = 0;
    const prepared = preparePublicCandidates([{ id: 'public-1' }], 'public_profiles');
    current = false;
    const result = await requestAllowedCardsIfCurrent(
      prepared.allowedIds,
      () => current,
      async () => {
        cardRequests += 1;
        return new Map();
      },
    );
    expect(result).toBeNull();
    expect(cardRequests).toBe(0);
  });

  test('first viewport geometry is explicit and remains within 480dp', () => {
    expect(DISCOVER_FIRST_VIEWPORT_HEIGHT).toBe(
      Object.values(DISCOVER_GEOMETRY).reduce((sum, value) => sum + value, 0),
    );
    expect(DISCOVER_FIRST_VIEWPORT_HEIGHT).toBeLessThanOrEqual(480);
    expect(DISCOVER_GEOMETRY.connect).toBe(44);
    expect(DISCOVER_GEOMETRY.filters + 12).toBeGreaterThanOrEqual(44);
  });

  test('keeps Nearby privacy-safe and exposes the approved visual and route anchors', () => {
    const experience = readFileSync(path.join(__dirname, 'DiscoverExperience.tsx'), 'utf8');

    expect(experience).toContain("type Filter = 'for-you' | 'nearby' | 'challenges' | 'groups'");
    expect(experience).toContain("['nearby', 'Nearby']");
    expect(experience).toContain("disabled={value === 'nearby'}");
    expect(experience).toContain('Nearby is not available yet');
    expect(experience).not.toMatch(/distance|kilomet(?:er|re)|\bkm\b/i);
    expect(experience).toContain("router.push('/search' as never)");
    expect(experience).toContain("router.push('/groups' as never)");
    expect(experience).toContain("pathname: '/buddy-card/[id]'");
    expect(experience).toContain("pathname: '/challenge/[id]'");
    expect(experience).toContain('People you may connect with');
    expect(experience).toContain('Recommended group');
    expect(experience).toContain('Challenge spotlight');
    expect(experience).toContain('Connect');
    expect(experience).toContain('readDiscoverFixtureConfig(process.env)');
    expect(experience).not.toMatch(/display_name\s*===\s*['"]Maya/);
    expect(experience).not.toMatch(/name\s*===\s*['"]Sunrise Runners/);
    expect(experience).not.toMatch(/title\s*===\s*['"]30-Day Consistency Challenge/);
    expect(experience).toContain('Runner. Coffee lover.');
    expect(experience).toContain('Always up for a challenge.');
    expect(experience).toContain("['Consistent', 'Supportive', 'Runner']");
    expect(experience).toContain('Level 18');
    expect(experience).toContain('Rising Star');
    expect(experience).toContain("width: '87%'");
    expect(experience).toContain('createDiscoverLoadGuard()');
    expect(experience).toContain('createDiscoverActionLock()');
    expect(experience).toContain(
      'loadGuardRef.current.canCommit(ticket, currentOwnerRef.current)',
    );
    expect(experience).not.toContain('canCommit(ticket, ownerId)');
    expect(experience).toContain("const key = `${actionOwner}:${kind}:${id}`");
    expect(experience).toContain('accessibilityHint="Shows their public accountability card"');
    expect(experience).toContain('personHero: { height: DISCOVER_GEOMETRY.personHero');
    expect(experience).toContain('connect: { height: DISCOVER_GEOMETRY.connect');
    expect(experience).toContain('groupCard: { height: DISCOVER_GEOMETRY.group');
    expect(experience).toContain('challenge: { height: DISCOVER_GEOMETRY.challenge');
    expect(experience).toContain('filter: { height: DISCOVER_GEOMETRY.filters');
    expect(experience).toContain('hitSlop={6}');
    expect(experience).toContain("state.status === 'offline' || state.status === 'error'");
    expect(experience).toContain('dataOwnerId === ownerId');
    expect(experience).toContain("recommendedGroups.slice(0, filter === 'groups' ? 8 : 1)");
    expect(experience).toContain("recommendedChallenges.slice(0, filter === 'challenges' ? 8 : 1)");
    expect(experience).toContain('currentOwnerRef.current');
    expect(experience).toContain('createDiscoverOperationGuard()');
    expect(experience).toContain('preparePublicCandidates(discovery.candidates');
    expect(experience).toContain('prepared.allowedIds,');
    expect(experience).toContain('getBuddyCards,');
    expect(experience).toContain('requestAllowedCardsIfCurrent(');
    expect(experience).toContain('if (!isCurrentLoad()) return;');
  });

  test('reflows search, filters, Nearby copy and state notices from 125 percent text', () => {
    const experience = readFileSync(path.join(__dirname, 'DiscoverExperience.tsx'), 'utf8');

    expect(experience).toContain('useWindowDimensions');
    expect(experience).toContain('fontScale >= 1.25');
    expect(experience).toContain('styles.searchLargeText');
    expect(experience).toContain('styles.filterLargeText');
    expect(experience).toContain('styles.nearbyExplanationLargeText');
    expect(experience).toContain('styles.stateNoticeLargeText');
    expect(experience).toContain('styles.retryLargeText');
    expect(experience).toContain('minHeight: 48');
  });

  test('keeps exact normal geometry and fully reflows populated cards from 125 percent text', () => {
    expect(deriveDiscoverLayout(1)).toEqual({
      largeText: false,
      controlMinHeight: 44,
      useFixedGeometry: true,
      stackCards: false,
      clampDynamicText: true,
    });
    expect(deriveDiscoverLayout(1.3)).toEqual({
      largeText: true,
      controlMinHeight: 48,
      useFixedGeometry: false,
      stackCards: true,
      clampDynamicText: false,
    });

    const experience = readFileSync(path.join(__dirname, 'DiscoverExperience.tsx'), 'utf8');
    expect(experience).toContain('layout.controlMinHeight');
    expect(experience).toContain('layout.useFixedGeometry');
    expect(experience).toContain('layout.stackCards');
    expect(experience).toContain('layout.clampDynamicText');
    expect(experience).toContain('styles.groupArtLargeText');
    expect(experience).toContain('styles.groupFallbackLabelLargeText');
  });
});
