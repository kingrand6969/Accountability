import { describe, expect, test } from '@jest/globals';
import { publicShareMessage, publicShareUrl } from './publicShareFormat';

describe('trusted public sharing', () => {
  test('uses a branded HTTPS URL with an opaque path', () => {
    expect(publicShareUrl('share id')).toBe('https://kingrand.io/s/share%20id');
  });

  test('never places a raw storage URL or internal user id in the message', () => {
    const message = publicShareMessage('Sunset 5K', publicShareUrl('opaque'));
    expect(message).toContain('https://kingrand.io/s/opaque');
    expect(message).not.toContain('supabase');
    expect(message).not.toContain('user_id');
  });
});
