import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createElement } from 'react';
import { Platform } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { useResolvedImageUrl } from './useResolvedImageUrl';

const SIGNED_URL =
  'https://media.example/avatar.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=secret';
const mockCachePrivateImageUrl = jest.fn<(value: string) => Promise<string>>();
const mockCachePrivateImageRef = jest.fn<(value: string) => Promise<string>>();
const mockUseResolvedMediaUrl = jest.fn(
  (value: string | null | undefined, enabled = true) =>
    enabled && typeof value === 'string' && value.startsWith('r2://')
      ? SIGNED_URL
      : (value ?? null),
);
const mockInvalidationListeners = new Set<() => void>();

jest.mock('./useResolvedMediaUrl', () => ({
  useResolvedMediaUrl: (value: string | null | undefined, enabled?: boolean) =>
    mockUseResolvedMediaUrl(value, enabled),
}));

jest.mock('./privateImageFileCache', () => ({
  cachePrivateImageUrl: (value: string) => mockCachePrivateImageUrl(value),
  cachePrivateImageRef: (value: string) => mockCachePrivateImageRef(value),
  isAwsSignedImageUrl: (value: string | null | undefined) =>
    typeof value === 'string' && value.includes('X-Amz-Algorithm='),
}));

jest.mock('./privateMedia', () => ({
  isPrivateMediaRef: (value: string | null | undefined) =>
    typeof value === 'string' && value.startsWith('r2://'),
  subscribePrivateMediaCacheInvalidation: (listener: () => void) => {
    mockInvalidationListeners.add(listener);
    return () => mockInvalidationListeners.delete(listener);
  },
}));

jest.mock('./privateImageByteProxy', () => ({
  isPrivateImageRef: (value: string | null | undefined) =>
    typeof value === 'string' && /^r2:\/\/(avatars|covers|post-images)\//.test(value),
}));

function Probe({ value, onRender }: { value: string | null; onRender: (value: string | null) => void }) {
  onRender(useResolvedImageUrl(value));
  return null;
}

describe('useResolvedImageUrl', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    mockCachePrivateImageUrl.mockResolvedValue('file:///private-images/session/avatar.jpg');
    mockCachePrivateImageRef.mockResolvedValue('file:///private-images/session/avatar.jpg');
  });

  afterEach(() => {
    mockCachePrivateImageUrl.mockReset();
    mockCachePrivateImageRef.mockReset();
    mockUseResolvedMediaUrl.mockClear();
    mockInvalidationListeners.clear();
  });

  it('keeps public, local, and empty image values unchanged', async () => {
    const renders: (string | null)[] = [];
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        createElement(Probe, {
          value: 'https://cdn.example/public.jpg',
          onRender: (value) => renders.push(value),
        }),
      );
    });
    expect(renders.at(-1)).toBe('https://cdn.example/public.jpg');
    expect(mockCachePrivateImageUrl).not.toHaveBeenCalled();
    expect(mockInvalidationListeners).toHaveProperty('size', 0);

    await act(async () => {
      renderer.update(
        createElement(Probe, {
          value: 'file:///cache/local.jpg',
          onRender: (value) => renders.push(value),
        }),
      );
    });
    expect(renders.at(-1)).toBe('file:///cache/local.jpg');
    await act(async () => renderer.unmount());
  });

  it('localizes both raw R2 refs and already-signed image URLs', async () => {
    for (const value of ['r2://avatars/member/dog.jpg', SIGNED_URL]) {
      const renders: (string | null)[] = [];
      let renderer!: TestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = TestRenderer.create(
          createElement(Probe, { value, onRender: (rendered) => renders.push(rendered) }),
        );
      });
      expect(renders.at(-1)).toBe('file:///private-images/session/avatar.jpg');
      await act(async () => renderer.unmount());
    }
    expect(mockCachePrivateImageRef).toHaveBeenCalledTimes(1);
    expect(mockCachePrivateImageRef).toHaveBeenCalledWith('r2://avatars/member/dog.jpg');
    expect(mockCachePrivateImageUrl).toHaveBeenCalledTimes(1);
    expect(mockCachePrivateImageUrl).toHaveBeenCalledWith(SIGNED_URL);
    expect(mockUseResolvedMediaUrl).toHaveBeenCalledWith(
      'r2://avatars/member/dog.jpg',
      false,
    );
  });

  it('keeps authorized web images remote while invalidating a direct signed URL', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    const rawRenders: (string | null)[] = [];
    const signedRenders: (string | null)[] = [];
    let rawRenderer!: TestRenderer.ReactTestRenderer;
    let signedRenderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      rawRenderer = TestRenderer.create(
        createElement(Probe, {
          value: 'r2://avatars/member/dog.jpg',
          onRender: (value) => rawRenders.push(value),
        }),
      );
      signedRenderer = TestRenderer.create(
        createElement(Probe, { value: SIGNED_URL, onRender: (value) => signedRenders.push(value) }),
      );
    });

    expect(rawRenders.at(-1)).toBe(SIGNED_URL);
    expect(signedRenders.at(-1)).toBe(SIGNED_URL);
    expect(mockCachePrivateImageUrl).not.toHaveBeenCalled();
    expect(mockCachePrivateImageRef).not.toHaveBeenCalled();

    await act(async () => {
      for (const listener of mockInvalidationListeners) listener();
    });

    expect(rawRenders.at(-1)).toBe(SIGNED_URL);
    expect(signedRenders.at(-1)).toBeNull();
    expect(mockCachePrivateImageUrl).not.toHaveBeenCalled();
    await act(async () => {
      rawRenderer.unmount();
      signedRenderer.unmount();
    });
  });

  it('fails closed when a signed image cannot be cached', async () => {
    mockCachePrivateImageUrl.mockRejectedValue(new Error('network failed'));
    const renders: (string | null)[] = [];
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        createElement(Probe, { value: SIGNED_URL, onRender: (value) => renders.push(value) }),
      );
    });
    expect(renders.at(-1)).toBeNull();
    await act(async () => renderer.unmount());
  });

  it('does not publish a late native proxy result after unmount', async () => {
    let finish!: (value: string) => void;
    mockCachePrivateImageRef.mockReturnValue(new Promise((resolve) => {
      finish = resolve;
    }));
    const renders: (string | null)[] = [];
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        createElement(Probe, {
          value: 'r2://avatars/member/dog.jpg',
          onRender: (value) => renders.push(value),
        }),
      );
    });
    expect(renders.at(-1)).toBeNull();

    await act(async () => renderer.unmount());
    await act(async () => {
      finish('file:///private-images/session/stale.jpg');
      await Promise.resolve();
    });

    expect(renders).toEqual([null]);
  });

  it('reauthorizes a raw ref but does not reuse a direct signed URL after auth invalidation', async () => {
    mockCachePrivateImageRef
      .mockResolvedValueOnce('file:///private-images/session-a/avatar.jpg')
      .mockResolvedValueOnce('file:///private-images/session-b/avatar.jpg');
    mockCachePrivateImageUrl.mockResolvedValueOnce('file:///private-images/session-a/direct.jpg');
    const rawRenders: (string | null)[] = [];
    const signedRenders: (string | null)[] = [];
    let rawRenderer!: TestRenderer.ReactTestRenderer;
    let signedRenderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      rawRenderer = TestRenderer.create(
        createElement(Probe, {
          value: 'r2://avatars/member/dog.jpg',
          onRender: (value) => rawRenders.push(value),
        }),
      );
      signedRenderer = TestRenderer.create(
        createElement(Probe, { value: SIGNED_URL, onRender: (value) => signedRenders.push(value) }),
      );
    });

    await act(async () => {
      for (const listener of mockInvalidationListeners) listener();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(rawRenders.at(-1)).toBe('file:///private-images/session-b/avatar.jpg');
    expect(signedRenders.at(-1)).toBeNull();
    expect(mockCachePrivateImageRef).toHaveBeenCalledTimes(2);
    expect(mockCachePrivateImageUrl).toHaveBeenCalledTimes(1);
    await act(async () => {
      rawRenderer.unmount();
      signedRenderer.unmount();
    });
  });
});
