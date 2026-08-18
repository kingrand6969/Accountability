import {
  FLEX_BODY_MAX_LENGTH,
  FLEX_TITLE_MAX_LENGTH,
  isFlexAudience,
  isFlexKind,
  isValidFlexSourceId,
  normalizeFlexDisplayText,
} from '../entry/flexContext';

export type RouteQuery = Record<string, string | string[] | undefined>;

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
const SAFE_VALUE = /^[^\u0000-\u001f\u007f]*$/;
const SAFE_EDIT_ID = /^[A-Za-z0-9_-]{1,128}$/;
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
  const rules = QUERY_RULES[pathname];
  if (!STATIC_ROUTES.has(pathname) && !ENTITY_ROUTE.test(pathname) && !rules) return null;

  const query = new URLSearchParams(parsed.search);
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
    pathname.startsWith('/story/') ? 'userId' : /^\/(?:group|page)\//.test(pathname) ? 'id' : null;
  for (const [key, value] of Object.entries(query)) {
    if (key === pathParam) continue;
    if (value === undefined) continue;
    if (typeof value !== 'string') return null;
    params.set(key, value);
  }
  const suffix = params.toString();
  return normalizeProtectedRouteIntent(suffix ? `${pathname}?${suffix}` : pathname);
}

export type AuthRouteIntentController = {
  capture: (href: string) => boolean;
  beginAsyncCapture: () => number;
  completeAsyncCapture: (ticket: number, href: string) => boolean;
  transitionToOwner: (ownerId: string | null) => string | null;
  peek: () => string | null;
};

export function createAuthRouteIntentController(
  initialOwnerId: string | null = null,
): AuthRouteIntentController {
  let ownerId = initialOwnerId;
  let pending: string | null = null;
  let generation = 0;

  const capture = (href: string) => {
    generation += 1;
    if (ownerId !== null) return false;
    const normalized = normalizeProtectedRouteIntent(href);
    if (!normalized) return false;
    pending = normalized;
    return true;
  };

  return {
    capture,
    beginAsyncCapture() {
      generation += 1;
      return generation;
    },
    completeAsyncCapture(ticket, href) {
      if (ticket !== generation || ownerId !== null) return false;
      const normalized = normalizeProtectedRouteIntent(href);
      if (!normalized) return false;
      pending = normalized;
      return true;
    },
    transitionToOwner(nextOwnerId) {
      if (nextOwnerId === ownerId) return null;
      generation += 1;
      const previousOwner = ownerId;
      ownerId = nextOwnerId;
      if (previousOwner === null && nextOwnerId !== null) {
        const destination = pending;
        pending = null;
        return destination;
      }
      pending = null;
      return null;
    },
    peek: () => pending,
  };
}
