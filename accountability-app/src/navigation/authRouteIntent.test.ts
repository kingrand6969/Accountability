import { describe, expect, test } from '@jest/globals';
import {
  createAuthRouteIntentCoordinator,
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
    ['/body', '/body'],
    ['/journey-path', '/journey-path'],
    ['/compose?event=1&text=Show%20up', '/compose?event=1&text=Show+up'],
    [
      '/post/11111111-1111-4111-8111-111111111111',
      '/post/11111111-1111-4111-8111-111111111111',
    ],
    [
      '/post/11111111-1111-4111-8111-111111111111?comment=1',
      '/post/11111111-1111-4111-8111-111111111111?comment=1',
    ],
    [
      'accountabilityapp://post/11111111-1111-4111-8111-111111111111?encouragement=1',
      '/post/11111111-1111-4111-8111-111111111111?encouragement=1',
    ],
    ['/win-card?buddyName=Maya', '/win-card?buddyName=Maya'],
    [
      '/win-card?achievementKind=challenge&achievementSourceId=68ff9f8f-79d8-4c5c-94e8-b2a0a79ed16a&achievementTitle=First%2010K&achievementText=Finished%20strong&showPublicly=1&autoPrompt=1',
      '/win-card?achievementKind=challenge&achievementSourceId=68ff9f8f-79d8-4c5c-94e8-b2a0a79ed16a&achievementTitle=First+10K&achievementText=Finished+strong&showPublicly=1&autoPrompt=1',
    ],
    [
      'accountabilityapp://story/restored_user-2026',
      '/story/restored_user-2026',
    ],
    ['accountabilityapp-staging://body', '/body'],
    ['accountabilityapp://journey-path', '/journey-path'],
  ])('accepts and canonicalizes %s', (input, expected) => {
    expect(normalizeProtectedRouteIntent(input)).toBe(expected);
  });

  test.each([
    '/share/11111111-1111-4111-8111-111111111111',
    '/post/not-a-post-id',
    '/post/11111111-1111-4111-8111-111111111111/nested',
    '/post/11111111-1111-4111-8111-111111111111?comment=0',
    '/post/11111111-1111-4111-8111-111111111111?comment=1&comment=1',
    '/post/11111111-1111-4111-8111-111111111111?comment=1&encouragement=1',
    '/post/11111111-1111-4111-8111-111111111111?redirect=%2Fcompose',
    '/story',
    '/story/a/b',
    '/story/..',
    '/story/%2e%2e',
    '/story/%2Fprivate',
    '/story/a%5Cb',
    '/story/user id',
    '/notifications/extra',
    '/body/extra',
    '/journey-path/extra',
    '/search?redirect=%2Fstory%2Fsecret',
    '/compose?event=1&redirect=%2Fprivate',
    '/compose?event=0',
    '/compose?event=1&event=1',
    '/compose?text=%0Ainjected',
    '/win-card?buddyName=a%0D%0Ab',
    '/win-card?amount=%2450',
    '/win-card?achievementKind=Challenge&achievementSourceId=68ff9f8f-79d8-4c5c-94e8-b2a0a79ed16a&achievementTitle=First%2010K',
    '/win-card?achievementKind=challenge&achievementSourceId=runs%2Fsecret&achievementTitle=First%2010K',
    `/win-card?achievementKind=challenge&achievementSourceId=${'x'.repeat(129)}&achievementTitle=First%2010K`,
    `/win-card?achievementKind=challenge&achievementSourceId=68ff9f8f-79d8-4c5c-94e8-b2a0a79ed16a&achievementTitle=${'x'.repeat(121)}`,
    '/win-card?achievementKind=challenge&achievementSourceId=68ff9f8f-79d8-4c5c-94e8-b2a0a79ed16a&achievementTitle=First%2010K&achievementText%5Bprivate%5D=secret',
    '/win-card?achievementKind=challenge&achievementSourceId=68ff9f8f-79d8-4c5c-94e8-b2a0a79ed16a&achievementTitle=First%2010K&audience=friends',
    '/win-card?achievementKind=challenge&achievementSourceId=68ff9f8f-79d8-4c5c-94e8-b2a0a79ed16a&achievementTitle=First%2010K&showOnCard=true',
    '/win-card?achievementKind=challenge&achievementSourceId=68ff9f8f-79d8-4c5c-94e8-b2a0a79ed16a&achievementTitle=First%2010K&showPublicly=true',
    '/win-card?achievementKind=challenge&achievementSourceId=68ff9f8f-79d8-4c5c-94e8-b2a0a79ed16a&achievementTitle=First%2010K&autoPrompt=0',
    '/groups#fragment',
    'accountabilityapp-preview://body',
    'accountabilityapp-staging://post/private',
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
    expect(
      routeIntentFromPath('/post/11111111-1111-4111-8111-111111111111', {
        id: '11111111-1111-4111-8111-111111111111',
        comment: '1',
      }),
    ).toBe('/post/11111111-1111-4111-8111-111111111111?comment=1');
    expect(
      routeIntentFromPath('/post/11111111-1111-4111-8111-111111111111', {
        id: ['11111111-1111-4111-8111-111111111111'],
      }),
    ).toBeNull();
  });
});

describe('one-shot authentication route intent lifecycle', () => {
  test('does not turn the protected path left by sign-out into the next owner intent', () => {
    const controller = createAuthRouteIntentController('owner-a');
    const coordinator = createAuthRouteIntentCoordinator(controller, 'owner-a');

    coordinator.synchronizeOwner('owner-a', '/compose');
    coordinator.captureForHold('owner-a', '/compose');
    coordinator.synchronizeOwner(null, '/compose');
    coordinator.captureForHold(null, '/compose');
    coordinator.synchronizeOwner('owner-b', '/compose');
    coordinator.captureForHold('owner-b', '/compose');

    expect(controller.resumeForOwner('owner-b', true)).toBeNull();
  });

  test('transitions to a new owner before capturing its same-commit protected path', () => {
    const controller = createAuthRouteIntentController();
    const coordinator = createAuthRouteIntentCoordinator(controller);

    coordinator.synchronizeOwner('owner-b', '/compose?photo=1');
    expect(coordinator.captureForHold('owner-b', '/compose?photo=1')).toBe(true);

    expect(controller.resumeForOwner('owner-b', true)).toBe('/compose?photo=1');
  });

  test('replaces owner A state during a direct A-to-B transition without replaying it', () => {
    const controller = createAuthRouteIntentController('owner-a');
    const coordinator = createAuthRouteIntentCoordinator(controller, 'owner-a');

    coordinator.synchronizeOwner('owner-a', '/groups');
    coordinator.captureForHold('owner-a', '/groups');
    coordinator.synchronizeOwner('owner-b', null);

    expect(controller.resumeForOwner('owner-b', true)).toBeNull();
    expect(controller.peek()).toBeNull();
  });

  test('does not transfer an unchanged protected path or private query across owners', () => {
    const privateIntent = '/compose?text=private';
    const controller = createAuthRouteIntentController('owner-a');
    const coordinator = createAuthRouteIntentCoordinator(controller, 'owner-a');

    coordinator.synchronizeOwner('owner-a', privateIntent);
    coordinator.captureForHold('owner-a', privateIntent);
    coordinator.synchronizeOwner('owner-b', privateIntent);

    expect(coordinator.captureForHold('owner-b', privateIntent)).toBe(false);
    expect(controller.resumeForOwner('owner-b', true)).toBeNull();
  });

  test('holds a Post comment intent through sign-in and onboarding, then resumes it once', () => {
    const destination = '/post/11111111-1111-4111-8111-111111111111?comment=1';
    const controller = createAuthRouteIntentController();

    expect(controller.capture(destination)).toBe(true);
    controller.transitionToOwner('owner-a');
    expect(controller.resumeForOwner('owner-a', false)).toBeNull();
    expect(controller.peek()).toBe(destination);
    expect(controller.resumeForOwner('owner-a', true)).toBe(destination);
    expect(controller.resumeForOwner('owner-a', true)).toBeNull();
  });

  test('holds a direct protected route for the current incomplete account only', () => {
    const controller = createAuthRouteIntentController('owner-a');

    expect(controller.captureForOwner('owner-a', '/compose?photo=1')).toBe(true);
    expect(controller.captureForOwner('owner-b', '/win-card')).toBe(false);
    expect(controller.resumeForOwner('owner-a', false)).toBeNull();
    expect(controller.resumeForOwner('owner-b', true)).toBeNull();
    expect(controller.resumeForOwner('owner-a', true)).toBe('/compose?photo=1');
    expect(controller.resumeForOwner('owner-a', true)).toBeNull();
  });

  test.each([
    ['accountabilityapp-staging://body', '/body'],
    ['accountabilityapp://journey-path', '/journey-path'],
  ])('captures a signed-out cold link from either app scheme and resumes %s once', (href, expected) => {
    const controller = createAuthRouteIntentController();
    const ticket = controller.beginAsyncCapture();

    expect(controller.completeAsyncCapture(ticket, href)).toBe(true);
    expect(controller.peek()).toBe(expected);
    controller.transitionToOwner('owner-a');
    expect(controller.resumeForOwner('owner-a', true)).toBe(expected);
    expect(controller.resumeForOwner('owner-a', true)).toBeNull();
  });

  test('preserves a validated Flex context across signed-out cold resume', () => {
    const href =
      'accountabilityapp-staging://win-card?achievementKind=workout&achievementSourceId=68ff9f8f-79d8-4c5c-94e8-b2a0a79ed16a&achievementTitle=Morning%20strength&showPublicly=1&autoPrompt=1';
    const expected =
      '/win-card?achievementKind=workout&achievementSourceId=68ff9f8f-79d8-4c5c-94e8-b2a0a79ed16a&achievementTitle=Morning+strength&showPublicly=1&autoPrompt=1';
    const controller = createAuthRouteIntentController();
    const ticket = controller.beginAsyncCapture();

    expect(controller.completeAsyncCapture(ticket, href)).toBe(true);
    expect(controller.peek()).toBe(expected);
    controller.transitionToOwner('owner-a');
    expect(controller.resumeForOwner('owner-a', true)).toBe(expected);
    expect(controller.resumeForOwner('owner-a', true)).toBeNull();
  });

  test('captures while signed out and consumes exactly once on sign-in', () => {
    const controller = createAuthRouteIntentController();
    expect(controller.capture('/story/restored-user')).toBe(true);
    controller.transitionToOwner(null);
    controller.transitionToOwner('owner-a');
    expect(controller.resumeForOwner('owner-a', true)).toBe('/story/restored-user');
    expect(controller.resumeForOwner('owner-a', true)).toBeNull();
  });

  test('does not replay an owner-A intent into owner B during an account switch', () => {
    const controller = createAuthRouteIntentController('owner-a');
    expect(controller.capture('/notifications')).toBe(false);
    controller.transitionToOwner('owner-b');
    expect(controller.resumeForOwner('owner-b', true)).toBeNull();
    expect(controller.peek()).toBeNull();
  });

  test('rejects a stale async initial-link completion after authentication', () => {
    const controller = createAuthRouteIntentController();
    const ticket = controller.beginAsyncCapture();
    controller.transitionToOwner('owner-a');
    expect(controller.resumeForOwner('owner-a', true)).toBeNull();
    expect(controller.completeAsyncCapture(ticket, '/search')).toBe(false);
    expect(controller.peek()).toBeNull();
  });

  test('rejects A-B-A stale capture tickets and preserves a newer valid intent', () => {
    const controller = createAuthRouteIntentController();
    const stale = controller.beginAsyncCapture();
    expect(controller.capture('/groups')).toBe(true);
    expect(controller.completeAsyncCapture(stale, '/story/stale-user')).toBe(false);
    controller.transitionToOwner('owner-a');
    expect(controller.resumeForOwner('owner-a', true)).toBe('/groups');
    controller.transitionToOwner(null);
    controller.transitionToOwner('owner-a');
    expect(controller.resumeForOwner('owner-a', true)).toBeNull();
  });
});
