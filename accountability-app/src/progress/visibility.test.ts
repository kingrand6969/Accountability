import { describe, expect, test } from '@jest/globals';

import {
  DEFAULT_SHOW_PUBLICLY,
  normalizeStoredPostVisibility,
  postVisibility,
  postVisibilityCopy,
} from './visibility';

describe('universal post visibility', () => {
  test('maps the one switch to exactly two persistence states', () => {
    expect(postVisibility(false)).toEqual({ audience: 'buddies', showOnCard: false });
    expect(postVisibility(true)).toEqual({ audience: 'public', showOnCard: true });
  });

  test('defaults every new share to Buddies only', () => {
    expect(DEFAULT_SHOW_PUBLICLY).toBe(false);
    expect(postVisibility(DEFAULT_SHOW_PUBLICLY)).toEqual({
      audience: 'buddies',
      showOnCard: false,
    });
  });

  test.each([undefined, null, 0, 1, 'true', {}, []])(
    'rejects a tampered non-boolean switch value: %p',
    (value) => expect(() => postVisibility(value as never)).toThrow('boolean'),
  );

  test('normalizes only the exact legacy public-card pair to public', () => {
    expect(normalizeStoredPostVisibility({ audience: 'public', show_on_card: true }))
      .toEqual({ audience: 'public', showOnCard: true });
    expect(normalizeStoredPostVisibility({ audience: 'public', show_on_card: false }))
      .toEqual({ audience: 'buddies', showOnCard: false });
    expect(normalizeStoredPostVisibility({ audience: 'buddies', show_on_card: true }))
      .toEqual({ audience: 'buddies', showOnCard: false });
    expect(normalizeStoredPostVisibility({ audience: 'public' }))
      .toEqual({ audience: 'buddies', showOnCard: false });
  });

  test('provides visible and assistive copy without relying on color', () => {
    expect(postVisibilityCopy(false)).toEqual({
      label: 'Buddies only',
      helper: 'Only accepted buddies can see this post. It will not appear on your Buddy Card.',
      accessibilityLabel: 'Share publicly and show on Buddy Card',
      postAction: 'Post to buddies',
    });
    expect(postVisibilityCopy(true)).toEqual(expect.objectContaining({
      label: 'Public + Buddy Card',
      postAction: 'Post publicly',
    }));
  });
});
