import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, jest, test } from '@jest/globals';
import {
  discoverDataCount,
  loadDiscoverScopeData,
} from './DiscoverExperience';

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
jest.mock('../media/useResolvedImageUrl', () => ({
  useResolvedImageUrl: (value: string | null | undefined) => value ?? null,
}));
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

const read = (name: string) => readFileSync(path.join(__dirname, name), 'utf8');

describe('Discover hub contract', () => {
  test('offers compact people, groups, pages and interests destinations', () => {
    const source = read('DiscoverHub.tsx');
    expect(source).toContain("value: 'people'");
    expect(source).toContain("value: 'groups'");
    expect(source).toContain("value: 'pages'");
    expect(source).toContain("value: 'interests'");
    expect(source).toContain('accessibilityRole="tablist"');
    expect(source).toContain('<DiscoverExperience scope="people" />');
  });

  test('reuses discovery APIs and protects account-scoped async results', () => {
    const source = read('DiscoverHub.tsx');
    expect(source).toContain('listGroups()');
    expect(source).toContain('listPages()');
    expect(source).toContain("row.privacy === 'public'");
    expect(source).toContain('requestOwner !== currentOwnerRef.current');
    expect(source).toContain('discoverActionKey(requestOwner, actionKind, row.id)');
    expect(source).toContain('actionLockRef.current.acquire(key)');
    expect(source).toContain('actionLockRef.current.clear()');
    expect(source).toContain('Retry');
    expect(source).toContain('No public');
  });

  test('is a discovery surface, not a posting or Feed mode surface', () => {
    const source = read('DiscoverHub.tsx');
    expect(source).not.toMatch(/createPost|publishPost|SocialModeSelector|feedMode/);
    expect(source).toContain("router.push(`/group/${row.id}` as never)");
    expect(source).toContain("router.push(`/page/${row.id}` as never)");
  });

  test('binds challenge joins to the same initiating owner as the busy lock', () => {
    const source = read('DiscoverExperience.tsx');
    expect(source).toContain("act('challenge', challenge.id, (expectedOwner) => joinChallenge(challenge.id, expectedOwner)");
    expect(source).toContain("isDiscoverActionBusy(busy, ownerId, 'challenge', challenge.id)");
  });
});

describe('people-only discovery behavior', () => {
  test('does not call unrelated group or challenge APIs', async () => {
    const listPeople = jest.fn(async () => ({ candidates: [{ id: 'person-1', display_name: 'Kai', avatar_url: null, area: null }], viewerArea: null }));
    const listGroups = jest.fn(async () => { throw new Error('groups unavailable'); });
    const listChallenges = jest.fn(async () => { throw new Error('challenges unavailable'); });
    const getCards = jest.fn(async () => new Map());

    await expect(loadDiscoverScopeData({
      scope: 'people',
      listPeople,
      listGroups,
      listChallenges,
      getCards,
      isCurrent: () => true,
    })).resolves.toMatchObject({ people: [{ id: 'person-1' }], groups: [], challenges: [] });
    expect(listGroups).not.toHaveBeenCalled();
    expect(listChallenges).not.toHaveBeenCalled();
    expect(getCards).toHaveBeenCalledWith(['person-1']);
  });

  test('unrelated rows cannot make an empty People section ready', () => {
    expect(discoverDataCount('people', { people: [], groups: [{ id: 'g' }], challenges: [{ id: 'c' }] })).toBe(0);
    expect(discoverDataCount('all', { people: [], groups: [{ id: 'g' }], challenges: [{ id: 'c' }] })).toBe(2);
  });

  test('default full discovery still loads every source and propagates a source failure', async () => {
    await expect(loadDiscoverScopeData({
      scope: 'all',
      listPeople: async () => ({ candidates: [], viewerArea: null }),
      listGroups: async () => { throw new Error('groups unavailable'); },
      listChallenges: async () => [],
      getCards: async () => new Map(),
      isCurrent: () => true,
    })).rejects.toThrow('groups unavailable');
  });
});
