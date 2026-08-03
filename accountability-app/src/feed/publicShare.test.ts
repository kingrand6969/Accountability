import { describe, expect, test } from '@jest/globals';
import { publicShareContent, publicShareMessage, publicShareUrl } from './publicShareFormat';

describe('trusted public sharing', () => {
  test('uses a branded HTTPS URL with an opaque path', () => {
    expect(publicShareUrl('share id')).toBe('https://joinaccountability.app/s/share%20id');
  });

  test('keeps the human message free of raw links and internal identifiers', () => {
    const message = publicShareMessage('Sunset 5K', publicShareUrl('opaque'));
    expect(message).not.toContain('https://');
    expect(message).not.toContain('accountabilityapp://');
    expect(message).not.toContain('supabase');
    expect(message).not.toContain('user_id');
  });

  test('uses a separate rich-preview URL on iOS', () => {
    expect(publicShareContent('Sunset 5K', publicShareUrl('opaque'), 'ios')).toEqual({
      message: 'Sunset 5K\n\nShared with permission from AccountAbility.',
      url: 'https://joinaccountability.app/s/opaque',
    });
  });

  test('Android fallback contains only the branded HTTPS destination', () => {
    const content = publicShareContent('Sunset 5K', publicShareUrl('opaque'), 'android');
    expect(content.message).toContain('https://joinaccountability.app/s/opaque');
    expect(content.message).not.toContain('accountabilityapp://');
    expect(content.message).not.toContain('r2://');
    expect(content.message).not.toContain('cloudflarestorage');
    expect(content.message).not.toContain('apps.apple.com/app/accountability');
  });
});
