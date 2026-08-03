/* eslint-disable @typescript-eslint/no-require-imports -- screens load after mutable Jest mocks */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert, Text, TextInput } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { resolveColdLink } from './routeAccessContract';

let mockOwnerId: string | null = 'owner-a';
let mockStoryUserId = 'restored-user';
let mockFocused = true;
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
};
const mockListStoryGroups = jest.fn<() => Promise<unknown[]>>();
const mockDeleteStory = jest.fn<(id: string) => Promise<void>>();
const mockListNotifications = jest.fn<() => Promise<unknown[]>>();
const mockMarkAllRead = jest.fn<(ownerId: string) => Promise<void>>();
const mockGetPost = jest.fn<() => Promise<unknown>>();
const mockSearchBuddies = jest.fn<() => Promise<unknown[]>>();
const mockListGroups = jest.fn<() => Promise<unknown[]>>();
const mockListPages = jest.fn<() => Promise<unknown[]>>();
const mockListSearchHistory = jest.fn<(isPro: boolean, ownerId: string) => Promise<unknown[]>>();
const mockRecordSearch = jest.fn<(query: string, ownerId: string) => Promise<void>>();
const mockClearSearchHistory = jest.fn<(ownerId: string) => Promise<void>>();
const mockDeleteSearchEntry = jest.fn<(id: string, ownerId: string) => Promise<void>>();

jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    session: mockOwnerId ? { user: { id: mockOwnerId } } : null,
  }),
}));
jest.mock('expo-router', () => {
  const ReactModule = require('react') as typeof React;
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({ userId: mockStoryUserId }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactModule.useEffect(() => (mockFocused ? effect() : undefined), [effect, mockFocused]);
    },
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../stories/api', () => ({
  listStoryGroups: () => mockListStoryGroups(),
  deleteStory: (id: string) => mockDeleteStory(id),
}));
jest.mock('../notify/api', () => ({
  listNotifications: () => mockListNotifications(),
  markAllRead: (ownerId: string) => mockMarkAllRead(ownerId),
  notificationLine: (item: { actor_name: string }) => `${item.actor_name} encouraged you`,
}));
jest.mock('../feed/api', () => ({
  getPost: () => mockGetPost(),
}));
jest.mock('../search/history', () => ({
  listSearchHistory: (isPro: boolean, ownerId: string) =>
    mockListSearchHistory(isPro, ownerId),
  recordSearch: (query: string, ownerId: string) => mockRecordSearch(query, ownerId),
  clearSearchHistory: (ownerId: string) => mockClearSearchHistory(ownerId),
  deleteSearchEntry: (id: string, ownerId: string) =>
    mockDeleteSearchEntry(id, ownerId),
}));
jest.mock('../buddy/api', () => ({
  searchBuddies: () => mockSearchBuddies(),
}));
jest.mock('../groups/api', () => ({
  listGroups: () => mockListGroups(),
}));
jest.mock('../pages/api', () => ({
  listPages: () => mockListPages(),
}));
jest.mock('../pro/ProProvider', () => ({ useIsPro: () => ({ isPro: false }) }));
jest.mock('../feed/Avatar', () => ({ Avatar: () => null }));
jest.mock('../ui/EmptyState', () => {
  const ReactModule = require('react') as typeof React;
  const { Text: NativeText } = require('react-native') as typeof import('react-native');
  return {
    EmptyState: ({ title }: { title: string }) =>
      ReactModule.createElement(NativeText, null, title),
  };
});
jest.mock('../ui/Toast', () => ({ showToast: jest.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderedText(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .flatMap((node) => (Array.isArray(node.props.children) ? node.props.children : [node.props.children]))
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .join(' ');
}

const activeRenderers: TestRenderer.ReactTestRenderer[] = [];
function render(component: React.ReactElement) {
  const renderer = TestRenderer.create(component);
  activeRenderers.push(renderer);
  return renderer;
}

type DiscoveredRoute = { route: string; params: string[]; file: string };

function discoverAppRoutes(root: string): DiscoveredRoute[] {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.endsWith('.tsx') && entry.name !== '_layout.tsx') {
        files.push(path.relative(root, absolute).replaceAll('\\', '/'));
      }
    }
  };
  visit(root);
  return files.map((file) => {
    const segments = file
      .replace(/\.tsx$/, '')
      .split('/')
      .filter((segment) => !/^\(.+\)$/.test(segment) && segment !== 'index')
      .map((segment) => segment.replace(/^\[(.+)\]$/, ':$1'));
    return {
      route: `/${segments.join('/')}` || '/',
      params: segments.filter((segment) => segment.startsWith(':')).map((segment) => segment.slice(1)),
      file,
    };
  });
}

const notification = {
  id: 'notification-1',
  type: 'like',
  actor_id: 'actor',
  actor_name: 'Maya',
  actor_avatar: null,
  post_id: '11111111-1111-4111-8111-111111111111',
  read: false,
  created_at: '2026-07-30T00:00:00.000Z',
};
const story = {
  id: 'story-1',
  user_id: 'restored-user',
  image_url: 'https://example.test/story.jpg',
  caption: 'Restored story target',
  created_at: '2026-07-30T00:00:00.000Z',
};

beforeEach(() => {
  mockOwnerId = 'owner-a';
  mockStoryUserId = 'restored-user';
  mockFocused = true;
  mockRouter.canGoBack.mockReturnValue(false);
  mockListStoryGroups.mockResolvedValue([]);
  mockDeleteStory.mockResolvedValue(undefined);
  mockListNotifications.mockResolvedValue([]);
  mockMarkAllRead.mockResolvedValue(undefined);
  mockGetPost.mockResolvedValue(null);
  mockSearchBuddies.mockResolvedValue([]);
  mockListGroups.mockResolvedValue([]);
  mockListPages.mockResolvedValue([]);
  mockListSearchHistory.mockResolvedValue([]);
  mockRecordSearch.mockResolvedValue(undefined);
  mockClearSearchHistory.mockResolvedValue(undefined);
  mockDeleteSearchEntry.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.clearAllMocks();
});

afterEach(() => {
  for (const renderer of activeRenderers.splice(0)) {
    act(() => renderer.unmount());
  }
});

describe('Group 3 manifest generated from the Expo app tree', () => {
  const actual = discoverAppRoutes(path.resolve(__dirname, '../app'));
  const byRoute = new Map(actual.map((entry) => [entry.route, entry]));
  const required = new Map<string, string[]>([
    ['/groups', []],
    ['/group/:id', ['id']],
    ['/group-new', []],
    ['/pages', []],
    ['/page/:id', ['id']],
    ['/page-new', []],
    ['/story/:userId', ['userId']],
    ['/notifications', []],
    ['/search', []],
    ['/compose', []],
    ['/win-card', []],
    ['/share/:id', ['id']],
  ]);

  test('contains every required Group 3 route with its actual dynamic parameters', () => {
    const missing = [...required.keys()].filter((route) => !byRoute.has(route));
    const wrongParams = [...required].flatMap(([route, params]) => {
      const found = byRoute.get(route);
      return found && JSON.stringify(found.params) !== JSON.stringify(params)
        ? [{ route, expected: params, actual: found.params, file: found.file }]
        : [];
    });
    expect({ missing, wrongParams }).toEqual({ missing: [], wrongParams: [] });
  });

  test.each(['/notifications', '/search', '/story/restored-user'] as const)(
    'resolves signed-out and signed-in cold links for %s',
    (route) => {
      expect(resolveColdLink(route, 'signed-out')).toBe('authenticate-and-resume');
      expect(resolveColdLink(route, 'signed-in')).toBe('open-protected');
    },
  );
});

describe('story behavioral safety', () => {
  const StoryViewer = require('../app/story/[userId]').default as React.ComponentType;

  test.each([
    ['missing', () => Promise.resolve([])],
    ['revoked/private', () => Promise.reject({ code: '42501' })],
  ])('renders the same non-disclosing unavailable state for %s targets', async (_label, result) => {
    mockListStoryGroups.mockReturnValueOnce(result());
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render(React.createElement(StoryViewer));
    });
    await flush();
    expect(renderedText(renderer)).toContain('This story is no longer available.');
    expect(renderedText(renderer)).not.toContain('42501');
    const close = renderer.root.findByProps({ accessibilityLabel: 'Close stories' });
    await act(async () => close.props.onPress());
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  test('loads the restored userId target rather than the first story group', async () => {
    mockListStoryGroups.mockResolvedValueOnce([
      { user_id: 'other', name: 'Other', avatar: null, isMe: false, stories: [{ ...story, id: 'other', user_id: 'other', caption: 'Wrong target' }] },
      { user_id: 'restored-user', name: 'Kin', avatar: null, isMe: false, stories: [story] },
    ]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render(React.createElement(StoryViewer));
    });
    await flush();
    expect(renderedText(renderer)).toContain('Restored story target');
    expect(renderedText(renderer)).not.toContain('Wrong target');
  });

  test('drops an A-account story completion after switching to B', async () => {
    const pending = deferred<unknown[]>();
    mockListStoryGroups.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render(React.createElement(StoryViewer));
    });
    mockOwnerId = 'owner-b';
    await act(async () => renderer.update(React.createElement(StoryViewer)));
    pending.resolve([{ user_id: 'restored-user', name: 'A private name', avatar: null, isMe: false, stories: [story] }]);
    await flush();
    expect(renderedText(renderer)).not.toContain('A private name');
    expect(renderedText(renderer)).not.toContain('Restored story target');
  });

  test('only exposes deletion for a story owned by the current account', async () => {
    mockListStoryGroups.mockResolvedValueOnce([
      { user_id: 'restored-user', name: 'Kin', avatar: null, isMe: false, stories: [story] },
    ]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render(React.createElement(StoryViewer));
    });
    await flush();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Delete this story' })).toHaveLength(0);
  });

  test('owner confirmation deletes exactly the currently displayed story', async () => {
    mockStoryUserId = 'owner-a';
    const ownedStory = { ...story, id: 'owned-story', user_id: 'owner-a' };
    mockListStoryGroups.mockResolvedValueOnce([
      { user_id: 'owner-a', name: 'Kin', avatar: null, isMe: true, stories: [ownedStory] },
    ]);
    let confirmation:
      | { text?: string; onPress?: () => void | Promise<void> }[]
      | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      confirmation = buttons;
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render(React.createElement(StoryViewer));
    });
    await flush();
    const remove = renderer.root.findByProps({ accessibilityLabel: 'Delete this story' });
    act(() => remove.props.onPress());
    const confirmDelete = confirmation?.find((button) => button.text === 'Delete');
    expect(confirmDelete?.onPress).toBeDefined();
    await act(async () => {
      await confirmDelete?.onPress?.();
    });
    expect(mockDeleteStory).toHaveBeenCalledTimes(1);
    expect(mockDeleteStory).toHaveBeenCalledWith('owned-story');
  });

  test('suppresses a confirmed delete after the current owner changes', async () => {
    mockStoryUserId = 'owner-a';
    const ownedStory = { ...story, id: 'stale-owned-story', user_id: 'owner-a' };
    mockListStoryGroups
      .mockResolvedValueOnce([
        { user_id: 'owner-a', name: 'Kin', avatar: null, isMe: true, stories: [ownedStory] },
      ])
      .mockResolvedValueOnce([]);
    let confirmation:
      | { text?: string; onPress?: () => void | Promise<void> }[]
      | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      confirmation = buttons;
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render(React.createElement(StoryViewer));
    });
    await flush();
    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'Delete this story' }).props.onPress(),
    );
    mockOwnerId = 'owner-b';
    await act(async () => renderer.update(React.createElement(StoryViewer)));
    const confirmDelete = confirmation?.find((button) => button.text === 'Delete');
    await act(async () => {
      await confirmDelete?.onPress?.();
    });
    expect(mockDeleteStory).not.toHaveBeenCalled();
  });
});

describe('notification behavioral safety', () => {
  const Notifications = require('../app/(app)/notifications').default as React.ComponentType;

  test.each([
    ['missing', () => Promise.resolve(null)],
    ['private', () => Promise.reject({ code: '42501', message: 'row level policy' })],
  ])('uses one generic fallback for a %s post target', async (_label, target) => {
    mockListNotifications.mockResolvedValueOnce([notification]);
    mockGetPost.mockImplementationOnce(target);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render(React.createElement(Notifications));
    });
    await flush();
    expect(mockMarkAllRead).toHaveBeenCalledWith('owner-a');
    const row = renderer.root.findByProps({ accessibilityLabel: 'Maya encouraged you' });
    await act(async () => row.props.onPress());
    await flush();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Unavailable',
      'This notification target is no longer available.',
    );
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('does not navigate when account A target lookup resolves after switching to B', async () => {
    const pending = deferred<object | null>();
    mockListNotifications.mockResolvedValue([notification]);
    mockGetPost.mockReturnValueOnce(pending.promise);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render(React.createElement(Notifications));
    });
    await flush();
    const row = renderer.root.findByProps({ accessibilityLabel: 'Maya encouraged you' });
    act(() => {
      void row.props.onPress();
    });
    mockOwnerId = 'owner-b';
    await act(async () => renderer.update(React.createElement(Notifications)));
    pending.resolve({ id: notification.post_id });
    await flush();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

describe('search behavioral safety', () => {
  const Search = require('../app/search').default as React.ComponentType;

  test('renders public matches but never private group/page matches', async () => {
    mockListGroups.mockResolvedValueOnce([
      { id: 'public-group', name: 'Run Public', privacy: 'public', member_count: 2 },
      { id: 'private-group', name: 'Run Private', privacy: 'private', member_count: 2 },
    ]);
    mockListPages.mockResolvedValueOnce([
      { id: 'public-page', name: 'Run Public Page', handle: 'run-public', privacy: 'public', follower_count: 2 },
      { id: 'private-page', name: 'Run Private Page', handle: 'run-private', privacy: 'private', follower_count: 2 },
    ]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render(React.createElement(Search));
    });
    const input = renderer.root.findByType(TextInput);
    await act(async () => input.props.onChangeText('run'));
    await flush();
    mockRecordSearch.mockReturnValueOnce(new Promise<void>(() => {}));
    act(() => input.props.onSubmitEditing());
    expect(mockRecordSearch).toHaveBeenCalledWith('run', 'owner-a');
    const text = renderedText(renderer);
    expect(text).toContain('Run Public');
    expect(text).toContain('Run Public Page');
    expect(text).not.toContain('Run Private');
    expect(text).not.toContain('Run Private Page');
  });

  test('limits free-account history to twenty rendered entries', async () => {
    mockListSearchHistory.mockResolvedValueOnce(
      Array.from({ length: 25 }, (_, index) => ({
        id: `history-${index}`,
        query: `query-${index}`,
        created_at: '2026-07-30T00:00:00.000Z',
      })),
    );
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render(React.createElement(Search));
    });
    await flush();
    const labels = new Set(
      renderer.root
        .findAll(
        (node) =>
          typeof node.props.accessibilityLabel === 'string' &&
          node.props.accessibilityLabel.startsWith('Search again for query-'),
        )
        .map((node) => node.props.accessibilityLabel as string),
    );
    expect(labels.size).toBe(20);
  });

  test('drops stale account-A search results after switching to B', async () => {
    const pendingPeople = deferred<unknown[]>();
    mockSearchBuddies.mockReturnValueOnce(pendingPeople.promise);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = render(React.createElement(Search));
    });
    const input = renderer.root.findByType(TextInput);
    act(() => {
      void input.props.onChangeText('run');
    });
    mockOwnerId = 'owner-b';
    await act(async () => renderer.update(React.createElement(Search)));
    pendingPeople.resolve([{ id: 'person-a', display_name: 'Account A Secret', area: null, avatar_url: null }]);
    await flush();
    const text = renderedText(renderer);
    expect(text).not.toContain('Account A Secret');
  });
});
