import { describe, expect, jest, test } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  canonicalPublicShareDestination,
  executeShareHandoff,
  isSafeResolvedPostId,
  navigateBackSafely,
  resolveColdLink,
} from './routeAccessContract';
import * as routeAccessContract from './routeAccessContract';

const SHARE_ID = '123e4567-e89b-42d3-a456-426614174000';
const POST_ID = '223e4567-e89b-42d3-a456-426614174000';
const appRoot = path.resolve(__dirname, '../app');

function routeSource(relativePath: string): string {
  return readFileSync(path.join(appRoot, relativePath), 'utf8');
}

describe('cold-link route access contract', () => {
  test.each(['/notifications', '/search'])(
    'uses history when available and a root fallback for a cold-loaded %s header',
    () => {
      const historyRouter = {
        canGoBack: jest.fn(() => true),
        back: jest.fn(),
        replace: jest.fn(),
      };
      expect(navigateBackSafely(historyRouter)).toBe('back');
      expect(historyRouter.back).toHaveBeenCalledTimes(1);
      expect(historyRouter.replace).not.toHaveBeenCalled();

      const coldRouter = {
        canGoBack: jest.fn(() => false),
        back: jest.fn(),
        replace: jest.fn(),
      };
      expect(navigateBackSafely(coldRouter)).toBe('fallback');
      expect(coldRouter.back).not.toHaveBeenCalled();
      expect(coldRouter.replace).toHaveBeenCalledWith('/');
    },
  );

  test('keeps the canonical encouragement query handoff and safe post fallback', () => {
    const postSource = routeSource('post/[id].tsx');

    expect(postSource).toContain(
      "useLocalSearchParams<{ id: string; encouragement?: string }>()",
    );
    expect(postSource).toContain(
      "useState(encouragement === '1')",
    );
    expect(postSource).toContain('visible={encouragementOpen}');
    expect(postSource).toContain("if (router.canGoBack()) router.back()");
    expect(postSource).toContain("else router.replace('/')");
  });

  test.each([
    'groups.tsx',
    'group/[id].tsx',
    'group-new.tsx',
    'pages.tsx',
    'page/[id].tsx',
    'page-new.tsx',
    'story/[userId].tsx',
    '(app)/notifications.tsx',
    'search.tsx',
    'compose.tsx',
    'win-card.tsx',
    'share/[id].tsx',
  ])('preserves the Group 3 compatibility route %s', (relativePath) => {
    expect(existsSync(path.join(appRoot, relativePath))).toBe(true);
  });

  test('selects readable system-bar ink for light and dark primary destinations', () => {
    const statusBarStyleForPath = (
      routeAccessContract as typeof routeAccessContract & {
        statusBarStyleForPath?: (path: string) => 'dark' | 'light';
      }
    ).statusBarStyleForPath;

    expect(typeof statusBarStyleForPath).toBe('function');
    expect(statusBarStyleForPath?.('/')).toBe('dark');
    expect(statusBarStyleForPath?.('/finance')).toBe('dark');
    expect(statusBarStyleForPath?.('/messages')).toBe('dark');
    expect(statusBarStyleForPath?.('/activity')).toBe('light');
    expect(statusBarStyleForPath?.('/run')).toBe('light');
    expect(statusBarStyleForPath?.('/body')).toBe('dark');
  });

  test.each(['/body', '/journey-path', '/business'] as const)(
    'requires authentication and resume for signed-out protected route %s',
    (path) => {
      expect(resolveColdLink(path, 'signed-out')).toBe('authenticate-and-resume');
    },
  );

  test.each(['/body', '/journey-path', '/business'] as const)(
    'opens signed-in protected route %s',
    (path) => {
      expect(resolveColdLink(path, 'signed-in')).toBe('open-protected');
    },
  );

  test.each([
    '/groups',
    '/group-new',
    '/pages',
    '/page-new',
    '/group/123e4567-e89b-42d3-a456-426614174000',
    '/page/restored_page-2026',
    '/notifications',
    '/search',
    '/story/restored_user-2026',
  ] as const)('authenticates and resumes signed-out Group 3 route %s', (path) => {
    expect(resolveColdLink(path, 'signed-out')).toBe('authenticate-and-resume');
  });

  test.each([
    '/groups',
    '/group-new',
    '/pages',
    '/page-new',
    '/group/123e4567-e89b-42d3-a456-426614174000',
    '/page/restored_page-2026',
    '/notifications',
    '/search',
    '/story/restored_user-2026',
  ] as const)('opens signed-in Group 3 protected route %s', (path) => {
    expect(resolveColdLink(path, 'signed-in')).toBe('open-protected');
  });

  test.each([
    '/group',
    '/group/',
    '/group/a/b',
    '/group/../private',
    '/group/%2Fprivate',
    '/group/has space',
    '/group/id?source=private',
    '/page',
    '/page/',
    '/page/a/b',
    '/page/../private',
    '/page/%2Fprivate',
    '/page/has space',
    '/page/id#fragment',
  ] as const)('rejects malformed or nested Group 3 protected path %s', (path) => {
    expect(resolveColdLink(path, 'signed-out')).toBe('unrecognized-route');
    expect(resolveColdLink(path, 'signed-in')).toBe('unrecognized-route');
  });

  test.each(['signed-out', 'signed-in'] as const)(
    'chooses the session-appropriate public share handoff while %s',
    (session) => {
      expect(resolveColdLink('/share/opaque-id', session)).toBe(
        session === 'signed-out' ? 'open-public-web' : 'resolve-authenticated-share',
      );
    },
  );

  test('builds a canonical web destination only for a valid UUID share id', () => {
    expect(canonicalPublicShareDestination(SHARE_ID)).toBe(
      `https://joinaccountability.app/s/${SHARE_ID}`,
    );
    expect(canonicalPublicShareDestination(undefined)).toBeNull();
    expect(canonicalPublicShareDestination(['one', 'two'])).toBeNull();
    expect(canonicalPublicShareDestination('')).toBeNull();
    expect(canonicalPublicShareDestination('nested/id')).toBeNull();
    expect(canonicalPublicShareDestination(` ${SHARE_ID}`)).toBeNull();
    expect(canonicalPublicShareDestination(`${SHARE_ID}\n`)).toBeNull();
    expect(canonicalPublicShareDestination(`${SHARE_ID}?source=private`)).toBeNull();
    expect(canonicalPublicShareDestination('a'.repeat(200))).toBeNull();
  });

  test('accepts only UUID-shaped authenticated post targets', () => {
    expect(isSafeResolvedPostId('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
    expect(isSafeResolvedPostId('')).toBe(false);
    expect(isSafeResolvedPostId('post/../../private')).toBe(false);
    expect(isSafeResolvedPostId('opaque-share-id')).toBe(false);
  });

  test.each(['restricted', 'revoked', 'missing'] as const)(
    'blocks a %s share regardless of session',
    (shareAccess) => {
      expect(resolveColdLink('/share/opaque-id', 'signed-out', shareAccess)).toBe('block-share');
      expect(resolveColdLink('/share/opaque-id', 'signed-in', shareAccess)).toBe('block-share');
    },
  );

  test.each(['signed-out', 'signed-in'] as const)(
    'never treats a private share as public while %s',
    (session) => {
      expect(resolveColdLink('/share/opaque-id', session, 'private')).toBe('block-share');
    },
  );

  test('signed-out handoff returns web fallback without resolving or navigating', async () => {
    const resolveAuthenticatedShare = jest.fn<() => Promise<string | null>>();
    const navigateToPost = jest.fn();

    await expect(
      executeShareHandoff({
        session: 'signed-out',
        shareId: SHARE_ID,
        resolveAuthenticatedShare,
        navigateToPost,
        isCurrent: () => true,
      }),
    ).resolves.toBe('web-fallback');
    expect(resolveAuthenticatedShare).not.toHaveBeenCalled();
    expect(navigateToPost).not.toHaveBeenCalled();
  });

  test('signed-in handoff navigates only to a safe resolved post UUID', async () => {
    const navigateToPost = jest.fn();

    await expect(
      executeShareHandoff({
        session: 'signed-in',
        shareId: SHARE_ID,
        resolveAuthenticatedShare: async () => POST_ID,
        navigateToPost,
        isCurrent: () => true,
      }),
    ).resolves.toBe('navigated');
    expect(navigateToPost).toHaveBeenCalledWith(POST_ID);
  });

  test('null authenticated result returns the canonical web fallback', async () => {
    await expect(
      executeShareHandoff({
        session: 'signed-in',
        shareId: SHARE_ID,
        resolveAuthenticatedShare: async () => null,
        navigateToPost: jest.fn(),
        isCurrent: () => true,
      }),
    ).resolves.toBe('web-fallback');
  });

  test('RLS denial returns the canonical web fallback', async () => {
    await expect(
      executeShareHandoff({
        session: 'signed-in',
        shareId: SHARE_ID,
        resolveAuthenticatedShare: async () => {
          throw Object.assign(new Error('denied'), { code: '42501' });
        },
        navigateToPost: jest.fn(),
        isCurrent: () => true,
      }),
    ).resolves.toBe('web-fallback');
  });

  test('malformed share ids and non-permission failures are unavailable without navigation', async () => {
    const resolver = jest.fn<() => Promise<string | null>>();
    const navigateToPost = jest.fn();
    await expect(
      executeShareHandoff({
        session: 'signed-in',
        shareId: 'malformed',
        resolveAuthenticatedShare: resolver,
        navigateToPost,
        isCurrent: () => true,
      }),
    ).resolves.toBe('unavailable');
    expect(resolver).not.toHaveBeenCalled();

    await expect(
      executeShareHandoff({
        session: 'signed-in',
        shareId: SHARE_ID,
        resolveAuthenticatedShare: async () => Promise.reject(new Error('offline')),
        navigateToPost,
        isCurrent: () => true,
      }),
    ).resolves.toBe('unavailable');
    expect(navigateToPost).not.toHaveBeenCalled();
  });

  test('stale authenticated completion never navigates', async () => {
    let current = true;
    let finish: ((value: string) => void) | undefined;
    const resolution = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const navigateToPost = jest.fn();
    const handoff = executeShareHandoff({
      session: 'signed-in',
      shareId: SHARE_ID,
      resolveAuthenticatedShare: () => resolution,
      navigateToPost,
      isCurrent: () => current,
    });

    current = false;
    finish?.(POST_ID);
    await expect(handoff).resolves.toBe('unavailable');
    expect(navigateToPost).not.toHaveBeenCalled();
  });
});
