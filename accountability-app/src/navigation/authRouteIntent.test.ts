import { describe, expect, test } from '@jest/globals';
import {
  createAuthRouteIntentController,
  normalizeProtectedRouteIntent,
  routeIntentFromPath,
} from './authRouteIntent';

describe('protected Group 3 route intent validation', () => {
  test.each([
    ['/groups', '/groups'],
    ['/group/team_42', '/group/team_42'],
    ['/page/my-page', '/page/my-page'],
    ['/story/restored_user-2026', '/story/restored_user-2026'],
    ['/notifications', '/notifications'],
    ['/search', '/search'],
    ['/compose?event=1&text=Show%20up', '/compose?event=1&text=Show+up'],
    [
      '/win-card?amount=%2450&buddyName=Maya',
      '/win-card?amount=%2450&buddyName=Maya',
    ],
    [
      'accountabilityapp://story/restored_user-2026',
      '/story/restored_user-2026',
    ],
  ])('accepts and canonicalizes %s', (input, expected) => {
    expect(normalizeProtectedRouteIntent(input)).toBe(expected);
  });

  test.each([
    '/post/11111111-1111-4111-8111-111111111111',
    '/share/11111111-1111-4111-8111-111111111111',
    '/story',
    '/story/a/b',
    '/story/..',
    '/story/%2e%2e',
    '/story/%2Fprivate',
    '/story/a%5Cb',
    '/story/user id',
    '/notifications/extra',
    '/search?redirect=%2Fstory%2Fsecret',
    '/compose?event=1&redirect=%2Fprivate',
    '/compose?event=0',
    '/compose?event=1&event=1',
    '/compose?text=%0Ainjected',
    '/win-card?buddyName=a%0D%0Ab',
    '/groups#fragment',
    'https://evil.example/story/restored-user',
    'javascript:alert(1)',
  ])('rejects malformed, out-of-scope, or injectable intent %s', (input) => {
    expect(normalizeProtectedRouteIntent(input)).toBeNull();
  });

  test('builds a candidate from router pathname and query without accepting arrays', () => {
    expect(routeIntentFromPath('/compose', { event: '1', text: 'Keep going' })).toBe(
      '/compose?event=1&text=Keep+going',
    );
    expect(routeIntentFromPath('/compose', { event: ['1', '1'] })).toBeNull();
    expect(routeIntentFromPath('/story/restored-user', { userId: 'restored-user' })).toBe(
      '/story/restored-user',
    );
  });
});

describe('one-shot authentication route intent lifecycle', () => {
  test('captures while signed out and consumes exactly once on sign-in', () => {
    const controller = createAuthRouteIntentController();
    expect(controller.capture('/story/restored-user')).toBe(true);
    expect(controller.transitionToOwner(null)).toBeNull();
    expect(controller.transitionToOwner('owner-a')).toBe('/story/restored-user');
    expect(controller.transitionToOwner('owner-a')).toBeNull();
  });

  test('does not replay an owner-A intent into owner B during an account switch', () => {
    const controller = createAuthRouteIntentController('owner-a');
    expect(controller.capture('/notifications')).toBe(false);
    expect(controller.transitionToOwner('owner-b')).toBeNull();
    expect(controller.peek()).toBeNull();
  });

  test('rejects a stale async initial-link completion after authentication', () => {
    const controller = createAuthRouteIntentController();
    const ticket = controller.beginAsyncCapture();
    expect(controller.transitionToOwner('owner-a')).toBeNull();
    expect(controller.completeAsyncCapture(ticket, '/search')).toBe(false);
    expect(controller.peek()).toBeNull();
  });

  test('rejects A-B-A stale capture tickets and preserves a newer valid intent', () => {
    const controller = createAuthRouteIntentController();
    const stale = controller.beginAsyncCapture();
    expect(controller.capture('/groups')).toBe(true);
    expect(controller.completeAsyncCapture(stale, '/story/stale-user')).toBe(false);
    expect(controller.transitionToOwner('owner-a')).toBe('/groups');
    expect(controller.transitionToOwner(null)).toBeNull();
    expect(controller.transitionToOwner('owner-a')).toBeNull();
  });
});
