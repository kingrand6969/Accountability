import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createElement } from 'react';
import { Platform } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import { useResolvedImageUrl } from './useResolvedImageUrl';

const SIGNED_URL =
  'https://media.example/avatar.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=secret';
const mockCachePrivateImageUrl = jest.fn<(value: string) => Promise<string>>();
const mockInvalidationListeners = new Set<() => void>();

jest.mock('./useResolvedMediaUrl', () => ({
  useResolvedMediaUrl: (value: string | null | undefined) =>
    typeof value === 'string' && value.startsWith('r2://') ? SIGNED_URL : (value ?? null),
}));

jest.mock('./privateImageFileCache', () => ({
  cachePrivateImageUrl: (value: string) => mockCachePrivateImageUrl(value),
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

function Probe({ value, onRender }: { value: string | null; onRender: (value: string | null) => void }) {
  onRender(useResolvedImageUrl(value));
  return null;
}

describe('useResolvedImageUrl', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    mockCachePrivateImageUrl.mockResolvedValue('file:///private-images/session/avatar.jpg');
  });

  afterEach(() => {
    mockCachePrivateImageUrl.mockReset();
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
    expect(mockCachePrivateImageUrl).toHaveBeenCalledTimes(2);
    expect(mockCachePrivateImageUrl).toHaveBeenNthCalledWith(1, SIGNED_URL);
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

  it('reauthorizes a raw ref but does not reuse a direct signed URL after auth invalidation', async () => {
    mockCachePrivateImageUrl
      .mockResolvedValueOnce('file:///private-images/session-a/avatar.jpg')
      .mockResolvedValueOnce('file:///private-images/session-a/direct.jpg')
      .mockResolvedValueOnce('file:///private-images/session-b/avatar.jpg');
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
    expect(mockCachePrivateImageUrl).toHaveBeenCalledTimes(3);
    await act(async () => {
      rawRenderer.unmount();
      signedRenderer.unmount();
    });
  });
});
