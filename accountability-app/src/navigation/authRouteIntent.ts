import {
  FLEX_BODY_MAX_LENGTH,
  FLEX_TITLE_MAX_LENGTH,
  isFlexAudience,
  isFlexKind,
  isValidFlexSourceId,
  normalizeFlexDisplayText,
} from '../entry/flexContext';

export type RouteQuery = Record<string, string | string[] | undefined>;

type OnboardingCompletionListener = (ownerId: string) => void;
const onboardingCompletionListeners = new Set<OnboardingCompletionListener>();

export function onboardingStorageKey(ownerId: string): string {
  return `onboarded:${ownerId}`;
}

export function subscribeToOnboardingCompletion(listener: OnboardingCompletionListener): () => void {
  onboardingCompletionListeners.add(listener);
  return () => onboardingCompletionListeners.delete(listener);
}

export function notifyOnboardingComplete(ownerId: string): void {
  if (!ownerId) return;
  for (const listener of onboardingCompletionListeners) listener(ownerId);
}

const STATIC_ROUTES = new Set([
  '/body',
  '/journey-path',
  '/groups',
  '/group-new',
  '/pages',
  '/page-new',
  '/notifications',
  '/search',
]);
const APP_PROTOCOLS = new Set(['accountabilityapp:', 'accountabilityapp-staging:']);
const ENTITY_ROUTE = /^\/(?:group|page|story)\/[A-Za-z0-9_-]+$/;
const POST_ROUTE = /^\/post\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_VALUE = /^[^\u0000-\u001f\u007f]*$/;
const SAFE_EDIT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const POST_QUERY_RULES: Record<string, (value: string) => boolean> = {
  comment: (value: string) => value === '1',
  encouragement: (value: string) => value === '1',
};
const QUERY_RULES: Record<
  string,
  Record<string, (value: string) => boolean>
> = {
  '/compose': {
    photo: (value) => value === '1',
    event: (value) => value === '1',
    text: (value) => value.length <= 280 && SAFE_VALUE.test(value),
    edit: (value) => SAFE_EDIT_ID.test(value),
  },
  '/win-card': {
    location: safeProofValue,
    route: safeProofValue,
    buddyName: safeProofValue,
    achievementKind: isFlexKind,
    achievementSourceId: isValidFlexSourceId,
    achievementTitle: (value) => normalizeFlexDisplayText(value, FLEX_TITLE_MAX_LENGTH) !== null,
    achievementText: (value) => normalizeFlexDisplayText(value, FLEX_BODY_MAX_LENGTH) !== null,
    audience: isFlexAudience,
    showOnCard: (value) => value === '1',
    showPublicly: (value) => value === '1',
    autoPrompt: (value) => value === '1',
  },
};

function safeProofValue(value: string): boolean {
  return value.length > 0 && value.length <= 160 && SAFE_VALUE.test(value);
}

function pathAndQuery(input: string): { pathname: string; search: string; hash: string } | null {
  if (!input || input.length > 2048) return null;
  try {
    if (input.startsWith('/')) {
      const url = new URL(input, 'https://accountability.invalid');
      return { pathname: url.pathname, search: url.search, hash: url.hash };
    }
    const url = new URL(input);
    if (url.protocol === 'javascript:' || url.username || url.password) return null;
    if (APP_PROTOCOLS.has(url.protocol)) {
      return {
        pathname: `/${url.hostname}${url.pathname}`.replace(/\/+/g, '/'),
        search: url.search,
        hash: url.hash,
      };
    }
    if (url.protocol === 'exp:' || url.protocol === 'exps:') {
      const marker = url.pathname.indexOf('/--/');
      if (marker < 0) return null;
      return { pathname: url.pathname.slice(marker + 3), search: url.search, hash: url.hash };
    }
  } catch {
    return null;
  }
  return null;
}

export function normalizeProtectedRouteIntent(input: string): string | null {
  if (
    /%(?:2e|2f|5c)/i.test(input) ||
    input.includes('\\') ||
    /(?:^|\/)\.\.?(?:\/|$)/.test(input)
  )
    return null;
  const parsed = pathAndQuery(input);
  if (!parsed || parsed.hash || decodeURI(parsed.pathname) !== parsed.pathname) return null;
  const { pathname } = parsed;
  const postRoute = POST_ROUTE.test(pathname);
  const rules = postRoute ? POST_QUERY_RULES : QUERY_RULES[pathname];
  if (!STATIC_ROUTES.has(pathname) && !ENTITY_ROUTE.test(pathname) && !postRoute && !rules) return null;

  const query = new URLSearchParams(parsed.search);
  if (postRoute && query.size > 1) return null;
  if (!rules && query.size > 0) return null;
  const canonical = new URLSearchParams();
  for (const [key, value] of query) {
    const rule = rules?.[key];
    if (!rule || canonical.has(key) || !rule(value)) return null;
    canonical.set(key, value);
  }
  const suffix = canonical.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}

export function routeIntentFromPath(pathname: string, query: RouteQuery): string | null {
  const params = new URLSearchParams();
  const pathParam =
    pathname.startsWith('/story/') ? 'userId' : /^\/(?:group|page|post)\//.test(pathname) ? 'id' : null;
  for (const [key, value] of Object.entries(query)) {
    if (key === pathParam) {
      if (typeof value !== 'string') return null;
      continue;
    }
    if (value === undefined) continue;
    if (typeof value !== 'string') return null;
    params.set(key, value);
  }
  const suffix = params.toString();
  return normalizeProtectedRouteIntent(suffix ? `${pathname}?${suffix}` : pathname);
}

export type AuthRouteIntentController = {
  capture: (href: string) => boolean;
  captureForOwner: (ownerId: string, href: string) => boolean;
  beginAsyncCapture: () => number;
  completeAsyncCapture: (ticket: number, href: string) => boolean;
  transitionToOwner: (ownerId: string | null) => void;
  resumeForOwner: (ownerId: string, onboarded: boolean) => string | null;
  peek: () => string | null;
};

export type AuthRouteIntentCoordinator = Readonly<{
  synchronizeOwner: (ownerId: string | null, observedIntent: string | null) => void;
  captureForHold: (ownerId: string | null, intent: string) => boolean;
}>;

export function createAuthRouteIntentCoordinator(
  controller: AuthRouteIntentController,
  initialOwnerId: string | null = null,
): AuthRouteIntentCoordinator {
  let previousOwnerId = initialOwnerId;
  let previousObservedIntent: string | null = null;
  let ownerResidualIntent: string | null = null;

  return {
    synchronizeOwner(ownerId, observedIntent) {
      const ownerChanged = ownerId !== previousOwnerId;
      controller.transitionToOwner(ownerId);

      if (
        ownerChanged &&
        observedIntent &&
        observedIntent === previousObservedIntent
      ) {
        // A path still visible across an owner replacement belongs to the old
        // navigation tree. Never transfer its route data to the next account.
        ownerResidualIntent = observedIntent;
      } else if (observedIntent !== previousObservedIntent) {
        ownerResidualIntent = null;
      }

      previousOwnerId = ownerId;
      previousObservedIntent = observedIntent;
    },
    captureForHold(ownerId, intent) {
      if (intent === ownerResidualIntent) return false;
      return ownerId
        ? controller.captureForOwner(ownerId, intent)
        : controller.capture(intent);
    },
  };
}

export function createAuthRouteIntentController(
  initialOwnerId: string | null = null,
): AuthRouteIntentController {
  let ownerId = initialOwnerId;
  let pending: string | null = null;
  let pendingOwnerId: string | null = null;
  let generation = 0;

  const capture = (href: string) => {
    generation += 1;
    if (ownerId !== null) return false;
    const normalized = normalizeProtectedRouteIntent(href);
    if (!normalized) return false;
    pending = normalized;
    pendingOwnerId = null;
    return true;
  };

  return {
    capture,
    captureForOwner(expectedOwnerId, href) {
      generation += 1;
      if (ownerId !== expectedOwnerId) return false;
      const normalized = normalizeProtectedRouteIntent(href);
      if (!normalized) return false;
      pending = normalized;
      pendingOwnerId = expectedOwnerId;
      return true;
    },
    beginAsyncCapture() {
      generation += 1;
      return generation;
    },
    completeAsyncCapture(ticket, href) {
      if (ticket !== generation || ownerId !== null) return false;
      const normalized = normalizeProtectedRouteIntent(href);
      if (!normalized) return false;
      pending = normalized;
      pendingOwnerId = null;
      return true;
    },
    transitionToOwner(nextOwnerId) {
      if (nextOwnerId === ownerId) return;
      generation += 1;
      const previousOwner = ownerId;
      ownerId = nextOwnerId;
      if (previousOwner === null && nextOwnerId !== null && pendingOwnerId === null) {
        pendingOwnerId = nextOwnerId;
        return;
      }
      pending = null;
      pendingOwnerId = null;
    },
    resumeForOwner(expectedOwnerId, onboarded) {
      if (!onboarded || ownerId !== expectedOwnerId || pendingOwnerId !== expectedOwnerId) {
        return null;
      }
      const destination = pending;
      pending = null;
      pendingOwnerId = null;
      return destination;
    },
    peek: () => pending,
  };
}
