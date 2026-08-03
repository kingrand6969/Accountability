/* eslint-disable @typescript-eslint/no-require-imports -- route modules load after Jest mocks */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { RefreshControl, Text, TextInput } from 'react-native';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

let mockOwnerId: string | null = 'owner-a';
let mockRouteId = 'restored-a';
let mockFocused = true;
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
};
const mockListGroups = jest.fn();
const mockListPages = jest.fn();
const mockGetGroup = jest.fn();
const mockGetPage = jest.fn();
const mockCreateGroup = jest.fn();
const mockCreatePage = jest.fn();
const mockJoinGroup = jest.fn();
const mockFollowPage = jest.fn();
const mockShowToast = jest.fn();

jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    session: mockOwnerId ? { user: { id: mockOwnerId } } : null,
  }),
}));
jest.mock('expo-router', () => {
  const ReactModule = require('react') as typeof React;
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({ id: mockRouteId }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactModule.useEffect(() => (mockFocused ? effect() : undefined), [effect, mockFocused]);
    },
  };
});
jest.mock('../groups/api', () => ({
  listGroups: (...args: unknown[]) => mockListGroups(...args),
  getGroup: (...args: unknown[]) => mockGetGroup(...args),
  createGroup: (...args: unknown[]) => mockCreateGroup(...args),
  joinGroup: (...args: unknown[]) => mockJoinGroup(...args),
  joinGroupWithKey: jest.fn(),
  leaveGroup: jest.fn(),
  getGroupGatekey: jest.fn(),
}));
jest.mock('../pages/api', () => ({
  PAGE_CATEGORIES: [{ value: 'gym', label: 'Gym' }],
  listPages: (...args: unknown[]) => mockListPages(...args),
  getPage: (...args: unknown[]) => mockGetPage(...args),
  createPage: (...args: unknown[]) => mockCreatePage(...args),
  followPage: (...args: unknown[]) => mockFollowPage(...args),
  unfollowPage: jest.fn(),
}));
jest.mock('../feed/api', () => ({
  listFeed: jest.fn(async () => []),
  createPost: jest.fn(),
  setLiked: jest.fn(),
}));
jest.mock('../ui/Toast', () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }));
jest.mock('../feed/postActions', () => ({ showPostMenu: jest.fn() }));
jest.mock('../social/invite', () => ({ shareInviteText: jest.fn() }));
jest.mock('../memories/SaveToMemories', () => ({ SaveToMemories: () => null }));
jest.mock('../feed/PostImage', () => ({ PostImage: () => null }));
jest.mock('../feed/PostVideo', () => ({ PostVideo: () => null }));
jest.mock('../feed/Avatar', () => ({ Avatar: () => null }));

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
  });
}

function renderedText(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .flatMap((node) => (Array.isArray(node.props.children) ? node.props.children : [node.props.children]))
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .join(' ');
}

beforeEach(() => {
  mockOwnerId = 'owner-a';
  mockRouteId = 'restored-a';
  mockFocused = true;
  jest.clearAllMocks();
});

const appRoot = path.resolve(__dirname, '../app');
function route(relative: string) {
  return readFileSync(path.join(appRoot, relative), 'utf8');
}

const groups = route('groups.tsx');
const group = route('group/[id].tsx');
const groupNew = route('group-new.tsx');
const pages = route('pages.tsx');
const page = route('page/[id].tsx');
const pageNew = route('page-new.tsx');

describe('Group 3 group/page compatibility routes', () => {
  test.each([
    'groups.tsx',
    'group/[id].tsx',
    'group-new.tsx',
    'pages.tsx',
    'page/[id].tsx',
    'page-new.tsx',
  ])('keeps cold-link and restored route file %s', (relative) => {
    expect(existsSync(path.join(appRoot, relative))).toBe(true);
  });

  test('preserves authentication resume and Group 2 compatibility destinations', () => {
    const root = route('_layout.tsx');
    expect(root).toContain('<Stack.Protected guard={!!session}>');
    expect(root).toContain('<Stack.Protected guard={!session}>');
    for (const compatibility of ['compose.tsx', 'win-card.tsx', 'share/[id].tsx']) {
      expect(existsSync(path.join(appRoot, compatibility))).toBe(true);
    }
  });

  test('keeps group gatekeys and member-only feeds', () => {
    expect(groupNew).toContain("privacy === 'private'");
    expect(groupNew).toContain('gatekey:');
    expect(group).toContain('joinGroupWithKey(target.id, keyInput)');
    expect(group).toContain('g?.is_member ? await listFeed(undefined, id) : []');
    expect(group).toContain('data={group.is_member ? posts : []}');
    expect(group).toContain('getGroupGatekey(target.id)');
  });

  test('keeps public page discovery and owner-only publishing controls', () => {
    expect(pages).toContain('listPages()');
    expect(pages).toContain("p.privacy === 'private'");
    expect(page).toContain('listFeed(undefined, undefined, id)');
    expect(page).toContain('{page.is_owner ? (');
    expect(page).toContain('accessibilityLabel="Post to your page"');
    expect(pageNew).toContain("useState<'public' | 'private'>('public')");
  });

  test.each([
    ['groups.tsx', groups],
    ['group/[id].tsx', group],
    ['group-new.tsx', groupNew],
    ['pages.tsx', pages],
    ['page/[id].tsx', page],
    ['page-new.tsx', pageNew],
  ])('%s binds async completion to the current account or has no async account data', (_name, source) => {
    expect(source).toContain('currentOwnerRef');
  });

  test.each([
    ['group/[id].tsx', group, '/groups'],
    ['page/[id].tsx', page, '/pages'],
  ])('%s uses a non-disclosing missing/revoked fallback with safe back behavior', (_name, source, fallback) => {
    expect(source).toContain('router.canGoBack()');
    expect(source).toContain(`router.replace('${fallback}' as never)`);
    expect(source).toMatch(/not (found|available)/i);
  });

  test('detail routes bind restored params and reject stale A-to-B/ABA completion', () => {
    for (const source of [group, page]) {
      expect(source).toContain('useLocalSearchParams<{ id: string }>()');
      expect(source).toContain('loadGeneration.current');
      expect(source).toContain('dataViewKey');
      expect(source).toContain('generation !== loadGeneration.current');
    }
  });
});

describe('Group 3 account and restored-intent behavior', () => {
  test.each([
    ['groups', mockListGroups, 'Alpha group', 'Beta group'],
    ['pages', mockListPages, 'Alpha page', 'Beta page'],
  ])('%s clears A immediately, reloads B, and rejects late A completion', async (moduleName, loader, alpha, beta) => {
    const a = deferred<unknown[]>();
    const b = deferred<unknown[]>();
    loader.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise);
    const Component = require(`../app/${moduleName}`).default as React.ComponentType;
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Component));
    });
    expect(loader).toHaveBeenCalledTimes(1);

    mockOwnerId = 'owner-b';
    await act(async () => {
      renderer.update(React.createElement(Component));
    });
    expect(loader).toHaveBeenCalledTimes(2);
    expect(renderedText(renderer)).not.toContain(alpha);

    a.resolve([
      moduleName === 'groups'
        ? {
            id: 'a',
            name: alpha,
            description: null,
            privacy: 'public',
            member_count: 1,
            is_member: true,
            is_admin: false,
          }
        : {
            id: 'a',
            name: alpha,
            handle: 'alpha',
            category: 'gym',
            privacy: 'public',
            follower_count: 1,
            is_following: true,
            is_owner: false,
          },
    ]);
    await flush();
    expect(renderedText(renderer)).not.toContain(alpha);

    b.resolve([
      moduleName === 'groups'
        ? {
            id: 'b',
            name: beta,
            description: null,
            privacy: 'public',
            member_count: 1,
            is_member: true,
            is_admin: false,
          }
        : {
            id: 'b',
            name: beta,
            handle: 'beta',
            category: 'gym',
            privacy: 'public',
            follower_count: 1,
            is_following: true,
            is_owner: false,
          },
    ]);
    await flush();
    expect(renderedText(renderer)).toContain(beta);
    await act(async () => renderer.unmount());
  });

  test.each([
    ['group', mockGetGroup, mockJoinGroup, 'Join group'],
    ['page', mockGetPage, mockFollowPage, 'Follow'],
  ])('%s releases mutation busy state when a refresh finishes first', async (kind, getter, mutation, buttonTitle) => {
    const pending = deferred<void>();
    mutation.mockReturnValueOnce(pending.promise);
    const entity =
      kind === 'group'
        ? {
            id: 'restored-a',
            name: 'Refresh mutation group',
            description: null,
            privacy: 'public',
            member_count: 0,
            is_member: false,
            is_admin: false,
          }
        : {
            id: 'restored-a',
            name: 'Refresh mutation page',
            handle: 'refresh',
            category: 'gym',
            privacy: 'public',
            follower_count: 0,
            is_following: false,
            is_owner: false,
          };
    (getter as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue(entity);
    const Component = require(`../app/${kind}/[id]`).default as React.ComponentType;
    const ButtonComponent = require('../ui/Button').Button as React.ComponentType<{
      title: string;
      onPress: () => void;
      loading?: boolean;
    }>;
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Component));
    });
    await flush();
    const mutationButton = renderer.root
      .findAllByType(ButtonComponent)
      .find((node) => node.props.title === buttonTitle);
    await act(async () => {
      void mutationButton?.props.onPress();
    });
    expect(mutationButton?.props.loading).toBe(true);

    const refresh = renderer.root.findByType(RefreshControl);
    await act(async () => {
      void refresh.props.onRefresh();
    });
    await flush();
    pending.resolve();
    await flush();

    expect(
      renderer.root
        .findAllByType(ButtonComponent)
        .find((node) => node.props.title === buttonTitle || node.props.title === 'Following')
        ?.props.loading,
    ).toBe(false);
    await act(async () => renderer.unmount());
  });

  test.each([
    ['group', mockGetGroup, mockJoinGroup, 'Join group'],
    ['page', mockGetPage, mockFollowPage, 'Follow'],
  ])('%s suppresses late mutation completion after blur and releases busy state', async (kind, getter, mutation, buttonTitle) => {
    const pending = deferred<void>();
    mutation.mockReturnValueOnce(pending.promise);
    const entity =
      kind === 'group'
        ? {
            id: 'restored-a',
            name: 'Blur target group',
            description: null,
            privacy: 'public',
            member_count: 0,
            is_member: false,
            is_admin: false,
          }
        : {
            id: 'restored-a',
            name: 'Blur target page',
            handle: 'blur',
            category: 'gym',
            privacy: 'public',
            follower_count: 0,
            is_following: false,
            is_owner: false,
          };
    (getter as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue(entity);
    const Component = require(`../app/${kind}/[id]`).default as React.ComponentType;
    const ButtonComponent = require('../ui/Button').Button as React.ComponentType<{
      title: string;
      onPress: () => void;
      loading?: boolean;
    }>;
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Component));
    });
    await flush();
    const button = renderer.root
      .findAllByType(ButtonComponent)
      .find((node) => node.props.title === buttonTitle);
    await act(async () => {
      void button?.props.onPress();
    });

    mockFocused = false;
    await act(async () => renderer.update(React.createElement(Component)));
    pending.resolve();
    await flush();
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(
      renderer.root
        .findAllByType(ButtonComponent)
        .find((node) => node.props.title === buttonTitle || node.props.title === 'Following')
        ?.props.loading,
    ).toBe(false);
    await act(async () => renderer.unmount());
  });

  test('groups rejects ABA completion by generation even after returning to owner A', async () => {
    const firstA = deferred<unknown[]>();
    const b = deferred<unknown[]>();
    const secondA = deferred<unknown[]>();
    mockListGroups
      .mockImplementationOnce(() => firstA.promise)
      .mockImplementationOnce(() => b.promise)
      .mockImplementationOnce(() => secondA.promise);
    const Groups = require('../app/groups').default as React.ComponentType;
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Groups));
    });
    firstA.resolve([]);
    await flush();

    mockOwnerId = 'owner-b';
    await act(async () => renderer.update(React.createElement(Groups)));
    mockOwnerId = 'owner-a';
    await act(async () => renderer.update(React.createElement(Groups)));
    expect(mockListGroups).toHaveBeenCalledTimes(3);

    b.resolve([
      {
        id: 'b',
        name: 'Stale ABA group',
        description: null,
        privacy: 'public',
        member_count: 1,
        is_member: true,
        is_admin: false,
      },
    ]);
    await flush();
    expect(renderedText(renderer)).not.toContain('Stale ABA group');

    secondA.resolve([
      {
        id: 'a-return',
        name: 'Current A return',
        description: null,
        privacy: 'public',
        member_count: 1,
        is_member: true,
        is_admin: false,
      },
    ]);
    await flush();
    expect(renderedText(renderer)).toContain('Current A return');
    await act(async () => renderer.unmount());
  });

  test.each([
    ['groups', mockListGroups, mockJoinGroup, 'Join'],
    ['pages', mockListPages, mockFollowPage, 'Follow'],
  ])('%s keeps a newer same-ID lock when the old A request finishes after A-B-A', async (moduleName, loader, mutation, buttonTitle) => {
    const oldA = deferred<void>();
    const newA = deferred<void>();
    mutation
      .mockImplementationOnce(() => oldA.promise)
      .mockImplementationOnce(() => newA.promise);
    (loader as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue([
      moduleName === 'groups'
        ? {
            id: 'same-id',
            name: 'Same ID group',
            description: null,
            privacy: 'public',
            member_count: 0,
            is_member: false,
            is_admin: false,
          }
        : {
            id: 'same-id',
            name: 'Same ID page',
            handle: 'same_id',
            category: 'gym',
            privacy: 'public',
            follower_count: 0,
            is_following: false,
            is_owner: false,
          },
    ]);
    const Component = require(`../app/${moduleName}`).default as React.ComponentType;
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Component));
    });
    await flush();
    const findAction = () =>
      renderer.root
        .findAll(
          (node) =>
            typeof node.props.accessibilityLabel === 'string' &&
            node.props.accessibilityLabel.startsWith(buttonTitle) &&
            typeof node.props.onPress === 'function',
        )
        .at(-1);
    await act(async () => {
      void findAction()?.props.onPress();
    });

    mockOwnerId = 'owner-b';
    await act(async () => renderer.update(React.createElement(Component)));
    await flush();
    mockOwnerId = 'owner-a';
    await act(async () => renderer.update(React.createElement(Component)));
    await flush();
    await act(async () => {
      void findAction()?.props.onPress();
    });
    expect(mutation).toHaveBeenCalledTimes(2);

    oldA.resolve();
    await flush();
    await act(async () => {
      void findAction()?.props.onPress();
    });
    expect(mutation).toHaveBeenCalledTimes(2);
    newA.resolve();
    await flush();
    await act(async () => renderer.unmount());
  });

  test.each([
    ['group', mockGetGroup],
    ['page', mockGetPage],
  ])('%s detail reloads an explicit restored ID and suppresses the previous ID', async (kind, getter) => {
    const first = deferred<Record<string, unknown> | null>();
    const restored = deferred<Record<string, unknown> | null>();
    getter.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => restored.promise);
    const Component = require(`../app/${kind}/[id]`).default as React.ComponentType;
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Component));
    });
    expect(getter).toHaveBeenLastCalledWith('restored-a');

    mockRouteId = 'restored-b';
    await act(async () => {
      renderer.update(React.createElement(Component));
    });
    expect(getter).toHaveBeenLastCalledWith('restored-b');

    first.resolve(
      kind === 'group'
        ? {
            id: 'restored-a',
            name: 'Stale restored group',
            description: null,
            privacy: 'public',
            member_count: 0,
            is_member: false,
            is_admin: false,
          }
        : {
            id: 'restored-a',
            name: 'Stale restored page',
            handle: 'stale',
            category: 'gym',
            privacy: 'public',
            follower_count: 0,
            is_following: false,
            is_owner: false,
          },
    );
    await flush();
    expect(renderedText(renderer)).not.toContain('Stale restored');

    restored.resolve(
      kind === 'group'
        ? {
            id: 'restored-b',
            name: 'Current restored group',
            description: null,
            privacy: 'public',
            member_count: 0,
            is_member: false,
            is_admin: false,
          }
        : {
            id: 'restored-b',
            name: 'Current restored page',
            handle: 'current',
            category: 'gym',
            privacy: 'public',
            follower_count: 0,
            is_following: false,
            is_owner: false,
          },
    );
    await flush();
    expect(renderedText(renderer)).toContain('Current restored');
    await act(async () => renderer.unmount());
  });

  test.each([
    ['group', mockGetGroup, mockJoinGroup, 'Join group'],
    ['page', mockGetPage, mockFollowPage, 'Follow'],
  ])('%s suppresses a mutation completion after the account changes', async (kind, getter, mutation, buttonTitle) => {
    const pending = deferred<void>();
    mutation.mockReturnValueOnce(pending.promise);
    const getEntity = getter as unknown as { mockResolvedValue(value: unknown): void };
    getEntity.mockResolvedValue(
      kind === 'group'
        ? {
            id: 'restored-a',
            name: 'Mutation target group',
            description: null,
            privacy: 'public',
            member_count: 0,
            is_member: false,
            is_admin: false,
          }
        : {
            id: 'restored-a',
            name: 'Mutation target page',
            handle: 'mutation',
            category: 'gym',
            privacy: 'public',
            follower_count: 0,
            is_following: false,
            is_owner: false,
          },
    );
    const Component = require(`../app/${kind}/[id]`).default as React.ComponentType;
    const ButtonComponent = require('../ui/Button').Button as React.ComponentType<{
      title: string;
      onPress: () => void;
    }>;
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Component));
    });
    await flush();
    const button = renderer.root
      .findAllByType(ButtonComponent)
      .find((node) => node.props.title === buttonTitle);
    expect(button).toBeDefined();
    await act(async () => {
      button?.props.onPress();
    });

    mockOwnerId = 'owner-b';
    await act(async () => renderer.update(React.createElement(Component)));
    pending.resolve();
    await flush();
    expect(mockShowToast).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  test.each([
    ['group-new', mockCreateGroup, 'Create group'],
    ['page-new', mockCreatePage, 'Create page'],
  ])('%s resets its draft and suppresses stale create completion after A-to-B', async (moduleName, creator, buttonLabel) => {
    const pending = deferred<string>();
    creator.mockReturnValueOnce(pending.promise);
    const Component = require(`../app/${moduleName}`).default as React.ComponentType;
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Component));
    });
    const inputs = renderer.root.findAllByType(TextInput);
    await act(async () => {
      inputs[0].props.onChangeText('Owner A draft');
      if (moduleName === 'page-new') inputs[1].props.onChangeText('owner_a_page');
    });
    const ButtonComponent = require('../ui/Button').Button as React.ComponentType<{
      title: string;
      onPress: () => void;
    }>;
    const createButton = renderer.root
      .findAllByType(ButtonComponent)
      .find((node) => node.props.title === buttonLabel);
    expect(createButton).toBeDefined();
    await act(async () => {
      createButton?.props.onPress();
    });

    mockOwnerId = 'owner-b';
    await act(async () => {
      renderer.update(React.createElement(Component));
    });
    await flush();
    expect(renderer.root.findAllByType(TextInput)[0].props.value).toBe('');

    pending.resolve('created-by-a');
    await flush();
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalledWith(expect.stringContaining('created-by-a'));
    await act(async () => renderer.unmount());
  });

  test.each([
    ['group-new', mockCreateGroup, 'Create group'],
    ['page-new', mockCreatePage, 'Create page'],
  ])('%s suppresses late create completion after Back/blur', async (moduleName, creator, buttonLabel) => {
    const pending = deferred<string>();
    creator.mockReturnValueOnce(pending.promise);
    const Component = require(`../app/${moduleName}`).default as React.ComponentType;
    const ButtonComponent = require('../ui/Button').Button as React.ComponentType<{
      title: string;
      onPress: () => void;
    }>;
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Component));
    });
    const inputs = renderer.root.findAllByType(TextInput);
    await act(async () => {
      inputs[0].props.onChangeText('Blurred draft');
      if (moduleName === 'page-new') inputs[1].props.onChangeText('blurred_page');
    });
    const createButton = renderer.root
      .findAllByType(ButtonComponent)
      .find((node) => node.props.title === buttonLabel);
    await act(async () => {
      void createButton?.props.onPress();
    });

    mockFocused = false;
    await act(async () => renderer.update(React.createElement(Component)));
    pending.resolve('created-after-back');
    await flush();
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalledWith(expect.stringContaining('created-after-back'));
    await act(async () => renderer.unmount());
  });

  test('queued create resets reject A-to-B-to-A lifecycle ABA', async () => {
    const queued: (() => void)[] = [];
    const queueSpy = jest
      .spyOn(globalThis, 'queueMicrotask')
      .mockImplementation((callback) => queued.push(callback));
    const GroupNew = require('../app/group-new').default as React.ComponentType;
    let renderer!: TestRenderer.ReactTestRenderer;
    try {
      await act(async () => {
        renderer = TestRenderer.create(React.createElement(GroupNew));
      });
      for (const callback of queued.splice(0)) {
        await act(async () => callback());
      }
      await act(async () => {
        renderer.root.findAllByType(TextInput)[0].props.onChangeText('Owner A original');
      });

      mockOwnerId = 'owner-b';
      await act(async () => renderer.update(React.createElement(GroupNew)));
      const [staleBReset] = queued.splice(0);
      mockOwnerId = 'owner-a';
      await act(async () => renderer.update(React.createElement(GroupNew)));
      queued.splice(0);
      await act(async () => {
        renderer.root.findAllByType(TextInput)[0].props.onChangeText('Current A draft');
      });

      expect(staleBReset).toBeDefined();
      await act(async () => staleBReset?.());
      expect(renderer.root.findAllByType(TextInput)[0].props.value).toBe('Current A draft');
      await act(async () => renderer.unmount());
    } finally {
      queueSpy.mockRestore();
    }
  });

  test('queued detail reset rejects restored-ID A-to-B-to-A lifecycle ABA', async () => {
    const queued: (() => void)[] = [];
    const queueSpy = jest
      .spyOn(globalThis, 'queueMicrotask')
      .mockImplementation((callback) => queued.push(callback));
    const b = deferred<Record<string, unknown> | null>();
    const currentA = deferred<Record<string, unknown> | null>();
    mockGetGroup
      .mockImplementationOnce(async () => ({
        id: 'restored-a',
        name: 'Initial A group',
        description: null,
        privacy: 'public',
        member_count: 0,
        is_member: false,
        is_admin: false,
      }))
      .mockImplementationOnce(() => b.promise)
      .mockImplementationOnce(() => currentA.promise);
    const GroupDetail = require('../app/group/[id]').default as React.ComponentType;
    let renderer!: TestRenderer.ReactTestRenderer;
    try {
      await act(async () => {
        renderer = TestRenderer.create(React.createElement(GroupDetail));
      });
      await act(async () => queued.shift()?.());
      await flush();

      mockRouteId = 'restored-b';
      await act(async () => renderer.update(React.createElement(GroupDetail)));
      mockRouteId = 'restored-a';
      await act(async () => renderer.update(React.createElement(GroupDetail)));
      const staleBReset = queued.shift();
      const currentAReset = queued.shift();
      await act(async () => currentAReset?.());

      currentA.resolve({
        id: 'restored-a',
        name: 'Current restored A group',
        description: null,
        privacy: 'public',
        member_count: 0,
        is_member: false,
        is_admin: false,
      });
      await flush();
      expect(renderedText(renderer)).toContain('Current restored A group');

      await act(async () => staleBReset?.());
      b.resolve(null);
      await flush();
      expect(renderedText(renderer)).toContain('Current restored A group');
      await act(async () => renderer.unmount());
    } finally {
      queueSpy.mockRestore();
    }
  });

  test('current page publishing and group administration remain entity-authorized UI seams', () => {
    expect(page).toContain('{page.is_owner ? (');
    expect(page).toContain("if (!requestOwner || !targetId || !page?.is_owner || !text) return;");
    expect(group).toContain('{group.is_admin ? (');
    expect(group).toContain('{!group.is_admin ? (');
    expect(group).not.toMatch(/edit group|delete group/i);
    expect(page).not.toMatch(/edit page|delete page/i);
  });
});
