import { describe, expect, it } from '@jest/globals';
import { WELCOME_ACTIONS, welcomeErrorState } from './welcomeContract';

describe('welcome contract', () => {
  it('keeps the approved welcome actions and routes stable', () => {
    expect(WELCOME_ACTIONS).toEqual([
      { id: 'login', route: null },
      { id: 'create-account', route: '/sign-up' },
      { id: 'forgot-password', route: '/forgot-password' },
    ]);
  });

  it('hides the form error region when there is no error', () => {
    expect(welcomeErrorState('', '')).toEqual({
      visible: false,
      liveRegion: 'none',
    });
  });

  it('announces a form error assertively', () => {
    expect(welcomeErrorState('Bad email', '')).toEqual({
      visible: true,
      liveRegion: 'assertive',
    });
  });
});
