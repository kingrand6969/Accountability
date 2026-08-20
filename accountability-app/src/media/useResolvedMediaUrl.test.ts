import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useResolvedMediaUrl } from './useResolvedMediaUrl';

type ResolvedPrivateMedia = { url: string; expiresAt: string };

const mockResolvePrivateMediaUrl =
  jest.fn<(value: string) => Promise<ResolvedPrivateMedia>>();
const mockInvalidationListeners = new Set<() => void>();

jest.mock('./privateMedia', () => ({
  PRIVATE_MEDIA_REFRESH_HEADROOM_MS: 60_000,
  isPrivateMediaRef: (value: string | null | undefined) =>
    typeof value === 'string' && value.startsWith('r2://'),
  resolvePrivateMediaUrl: (value: string) => mockResolvePrivateMediaUrl(value),
  subscribePrivateMediaCacheInvalidation: (listener: () => void) => {
    mockInvalidationListeners.add(listener);
    return () => mockInvalidationListeners.delete(listener);
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function Probe({
  value,
  onRender,
}: {
  value: string | null;
  onRender: (resolved: string | null) => void;
}) {
  onRender(useResolvedMediaUrl(value));
  return null;
}

describe('useResolvedMediaUrl', () => {
  afterEach(() => {
    mockResolvePrivateMediaUrl.mockReset();
    mockInvalidationListeners.clear();
    jest.useRealTimers();
  });

  it('returns public and empty values immediately without private resolution', async () => {
    const renders: (string | null)[] = [];
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        createElement(Probe, {
          value: 'https://cdn.example/photo.jpg',
          onRender: (value) => renders.push(value),
        }),
      );
    });
    expect(renders.at(-1)).toBe('https://cdn.example/photo.jpg');

    await act(async () => {
      renderer.update(
        createElement(Probe, {
          value: null,
          onRender: (value) => renders.push(value),
        }),
      );
    });
    expect(renders.at(-1)).toBeNull();
    expect(mockResolvePrivateMediaUrl).not.toHaveBeenCalled();

    await act(async () => renderer.unmount());
  });

  it('does not expose a stale private result after the source changes', async () => {
    const pending = deferred<ResolvedPrivateMedia>();
    mockResolvePrivateMediaUrl.mockReturnValue(pending.promise);
    const renders: (string | null)[] = [];
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        createElement(Probe, {
          value: 'r2://post-images/member/private.jpg',
          onRender: (value) => renders.push(value),
        }),
      );
    });
    expect(renders.at(-1)).toBeNull();

    await act(async () => {
      renderer.update(
        createElement(Probe, {
          value: 'https://cdn.example/new.jpg',
          onRender: (value) => renders.push(value),
        }),
      );
    });
    expect(renders.at(-1)).toBe('https://cdn.example/new.jpg');

    await act(async () => {
      pending.resolve({
        url: 'https://signed.example/stale.jpg',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      });
      await pending.promise;
    });
    expect(renders.at(-1)).toBe('https://cdn.example/new.jpg');

    await act(async () => renderer.unmount());
  });

  it('renews a mounted private image before its signed URL expires', async () => {
    jest.useFakeTimers();
    const now = Date.parse('2026-08-20T00:00:00.000Z');
    jest.setSystemTime(now);
    mockResolvePrivateMediaUrl
      .mockResolvedValueOnce({
        url: 'https://signed.example/first.jpg',
        expiresAt: new Date(now + 120_000).toISOString(),
      })
      .mockResolvedValueOnce({
        url: 'https://signed.example/renewed.jpg',
        expiresAt: new Date(now + 420_000).toISOString(),
      });
    const renders: (string | null)[] = [];
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        createElement(Probe, {
          value: 'r2://avatars/member/avatar.jpg',
          onRender: (value) => renders.push(value),
        }),
      );
    });
    expect(renders.at(-1)).toBe('https://signed.example/first.jpg');

    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(mockResolvePrivateMediaUrl).toHaveBeenCalledTimes(2);
    expect(renders.at(-1)).toBe('https://signed.example/renewed.jpg');

    await act(async () => renderer.unmount());
  });

  it('keeps the last good image through a temporary renewal failure and retries', async () => {
    jest.useFakeTimers();
    const now = Date.parse('2026-08-20T00:00:00.000Z');
    jest.setSystemTime(now);
    mockResolvePrivateMediaUrl
      .mockResolvedValueOnce({
        url: 'https://signed.example/working.jpg',
        expiresAt: new Date(now + 120_000).toISOString(),
      })
      .mockRejectedValueOnce(new Error('temporary network error'))
      .mockResolvedValueOnce({
        url: 'https://signed.example/recovered.jpg',
        expiresAt: new Date(now + 420_000).toISOString(),
      });
    const renders: (string | null)[] = [];
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        createElement(Probe, {
          value: 'r2://avatars/member/avatar.jpg',
          onRender: (value) => renders.push(value),
        }),
      );
    });
    expect(renders.at(-1)).toBe('https://signed.example/working.jpg');

    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(mockResolvePrivateMediaUrl).toHaveBeenCalledTimes(2);
    expect(renders.at(-1)).toBe('https://signed.example/working.jpg');

    await act(async () => {
      await jest.advanceTimersByTimeAsync(15_000);
    });
    expect(mockResolvePrivateMediaUrl).toHaveBeenCalledTimes(3);
    expect(renders.at(-1)).toBe('https://signed.example/recovered.jpg');

    await act(async () => renderer.unmount());
  });

  it('reauthorizes a mounted private image after an auth cache invalidation', async () => {
    mockResolvePrivateMediaUrl
      .mockResolvedValueOnce({
        url: 'https://signed.example/owner-a.jpg',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      })
      .mockResolvedValueOnce({
        url: 'https://signed.example/owner-b.jpg',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      });
    const renders: (string | null)[] = [];
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        createElement(Probe, {
          value: 'r2://avatars/member/avatar.jpg',
          onRender: (value) => renders.push(value),
        }),
      );
    });
    expect(renders.at(-1)).toBe('https://signed.example/owner-a.jpg');

    await act(async () => {
      for (const listener of mockInvalidationListeners) listener();
      await Promise.resolve();
    });
    expect(mockResolvePrivateMediaUrl).toHaveBeenCalledTimes(2);
    expect(renders.at(-1)).toBe('https://signed.example/owner-b.jpg');

    await act(async () => renderer.unmount());
  });
});
