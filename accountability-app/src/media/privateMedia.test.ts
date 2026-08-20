import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { clearPrivateMediaCache, isPrivateMediaRef, resolveMediaUrl, resolveMediaUrls } from './privateMedia';

const mockInvoke = jest.fn<(...args: unknown[]) => Promise<{ data: any; error: any }>>();

jest.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

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

  it('restarts a batch authorization when the auth cache changes in flight', async () => {
    const ref = 'r2://post-images/shared/photo.jpg';
    const ownerARequest = deferred<{ data: { items: { ref: string; url: string; expiresAt: string }[] }; error: null }>();
    mockInvoke
      .mockReturnValueOnce(ownerARequest.promise)
      .mockResolvedValueOnce({
        data: {
          items: [{ ref, url: 'https://signed.example/owner-b', expiresAt: new Date(Date.now() + 60_000).toISOString() }],
        },
        error: null,
      });

    const resolved = resolveMediaUrls([ref]);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    clearPrivateMediaCache();
    ownerARequest.resolve({
      data: {
        items: [{ ref, url: 'https://signed.example/owner-a', expiresAt: new Date(Date.now() + 60_000).toISOString() }],
      },
      error: null,
    });

    await expect(resolved).resolves.toEqual(new Map([[ref, 'https://signed.example/owner-b']]));
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });
});
