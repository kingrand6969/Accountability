import { publicShareUrl } from '../feed/publicShareFormat';

export type SessionState = 'signed-out' | 'signed-in';
export type ShareAccess = 'public' | 'restricted' | 'revoked' | 'missing' | 'private';
export type ColdLinkDecision =
  | 'authenticate-and-resume'
  | 'open-protected'
  | 'open-public-web'
  | 'resolve-authenticated-share'
  | 'block-share'
  | 'unrecognized-route';
export type ShareHandoffResult = 'web-fallback' | 'navigated' | 'unavailable';
export type SafeBackRouter = {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: '/') => void;
};

export function navigateBackSafely(router: SafeBackRouter): 'back' | 'fallback' {
  if (router.canGoBack()) {
    router.back();
    return 'back';
  }
  router.replace('/');
  return 'fallback';
}

const PROTECTED_ROUTES = new Set([
  '/body',
  '/journey-path',
  '/business',
  '/groups',
  '/group-new',
  '/pages',
  '/page-new',
  '/notifications',
  '/search',
]);
const PROTECTED_ENTITY_ROUTE = /^\/(?:group|page|story)\/[A-Za-z0-9_-]+$/;
const PUBLIC_SHARE_ROUTE = /^\/share\/[^/]+$/;
const POST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function statusBarStyleForPath(path: string): 'dark' | 'light' {
  return path === '/activity' || path === '/run' ? 'light' : 'dark';
}

export function canonicalPublicShareDestination(
  id: string | string[] | undefined,
): string | null {
  if (typeof id !== 'string' || !POST_ID.test(id)) return null;
  return publicShareUrl(id);
}

export function isSafeResolvedPostId(value: string | null): value is string {
  return typeof value === 'string' && POST_ID.test(value);
}

function isPermissionFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; status?: unknown };
  return candidate.code === '42501' || candidate.status === 401 || candidate.status === 403;
}

export async function executeShareHandoff({
  session,
  shareId,
  resolveAuthenticatedShare,
  navigateToPost,
  isCurrent,
}: {
  session: SessionState;
  shareId: string | string[] | undefined;
  resolveAuthenticatedShare: (shareId: string) => Promise<string | null>;
  navigateToPost: (postId: string) => void;
  isCurrent: () => boolean;
}): Promise<ShareHandoffResult> {
  if (!canonicalPublicShareDestination(shareId) || typeof shareId !== 'string') {
    return 'unavailable';
  }
  if (session === 'signed-out') return 'web-fallback';

  try {
    const postId = await resolveAuthenticatedShare(shareId);
    if (!isCurrent()) return 'unavailable';
    if (postId === null) return 'web-fallback';
    if (!isSafeResolvedPostId(postId)) return 'unavailable';
    navigateToPost(postId);
    return 'navigated';
  } catch (error) {
    if (!isCurrent()) return 'unavailable';
    return isPermissionFailure(error) ? 'web-fallback' : 'unavailable';
  }
}

export function resolveColdLink(
  path: string,
  session: SessionState,
  shareAccess: ShareAccess = 'public',
): ColdLinkDecision {
  if (PUBLIC_SHARE_ROUTE.test(path)) {
    if (shareAccess === 'public') {
      return session === 'signed-in' ? 'resolve-authenticated-share' : 'open-public-web';
    }
    return 'block-share';
  }

  if (PROTECTED_ROUTES.has(path) || PROTECTED_ENTITY_ROUTE.test(path)) {
    return session === 'signed-in' ? 'open-protected' : 'authenticate-and-resume';
  }

  return 'unrecognized-route';
}
