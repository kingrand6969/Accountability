import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { clearPrivateMediaCache, isPrivateMediaRef, resolveMediaUrl } from './privateMedia';

const mockInvoke = jest.fn<(...args: unknown[]) => Promise<{ data: any; error: any }>>();

jest.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
}));

describe('private media', () => {
  beforeEach(() => {
    clearPrivateMediaCache();
    mockInvoke.mockReset();
  });

  it('passes legacy HTTPS media through without calling the signing function', async () => {
    await expect(resolveMediaUrl('https://cdn.example/photo.jpg')).resolves.toBe('https://cdn.example/photo.jpg');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('recognizes only opaque R2 references', () => {
    expect(isPrivateMediaRef('r2://post-images/user/photo.jpg')).toBe(true);
    expect(isPrivateMediaRef('https://example.com/r2://photo')).toBe(false);
    expect(isPrivateMediaRef(null)).toBe(false);
  });

  it('requests and caches a short-lived authorized URL', async () => {
    mockInvoke.mockResolvedValue({
      data: { url: 'https://signed.example/photo', expiresAt: new Date(Date.now() + 60_000).toISOString() },
      error: null,
    });
    const ref = 'r2://post-images/00000000-0000-4000-8000-000000000000/photo.jpg';
    await expect(resolveMediaUrl(ref)).resolves.toBe('https://signed.example/photo');
    await expect(resolveMediaUrl(ref)).resolves.toBe('https://signed.example/photo');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('media-read', { body: { ref } });
  });

  it('fails closed when no valid URL is returned', async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null });
    await expect(resolveMediaUrl('r2://post-images/00000000-0000-4000-8000-000000000000/photo.jpg'))
      .rejects.toThrow('Could not open this private image.');
  });
});
