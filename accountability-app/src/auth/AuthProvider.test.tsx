import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import type { Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockGetSession = jest.fn<(...args: unknown[]) => Promise<{ data: { session: Session | null } }>>();
const mockInvoke = jest.fn<(...args: unknown[]) => Promise<{ data: any; error: any }>>();
let mockAuthChange: ((_event: string, session: Session | null) => void) | null = null;
const mockUnsubscribe = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (callback: typeof mockAuthChange) => {
        mockAuthChange = callback;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
    },
  },
}));

import { AuthProvider, useAuth } from './AuthProvider';
import { clearPrivateMediaCache, resolveMediaUrl } from '../media/privateMedia';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function session(id: string): Session {
  return { user: { id } } as Session;
}

function Probe() {
  const value = useAuth();
  return <Text>{`${String(value.loading)}:${value.session?.user.id ?? 'none'}`}</Text>;
}

function renderedValue(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByType(Text).props.children;
}

describe('AuthProvider bootstrap', () => {
  beforeEach(() => {
    clearPrivateMediaCache();
    mockGetSession.mockReset();
    mockInvoke.mockReset();
    mockUnsubscribe.mockReset();
    mockAuthChange = null;
  });

  test('releases the launch screen when the initial session read fails', async () => {
    const pending = deferred<{ data: { session: Session | null } }>();
    mockGetSession.mockReturnValueOnce(pending.promise);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
    });
    expect(renderedValue(renderer)).toBe('true:none');

    await act(async () => {
      pending.reject(new Error('offline'));
      await pending.promise.catch(() => undefined);
    });

    expect(renderedValue(renderer)).toBe('false:none');
    await act(async () => renderer.unmount());
  });

  test('an auth event settles loading and cannot be overwritten by a stale bootstrap result', async () => {
    const pending = deferred<{ data: { session: Session | null } }>();
    mockGetSession.mockReturnValueOnce(pending.promise);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
    });

    await act(async () => {
      mockAuthChange?.('SIGNED_IN', session('new-owner'));
    });
    expect(renderedValue(renderer)).toBe('false:new-owner');

    await act(async () => {
      pending.resolve({ data: { session: session('stale-owner') } });
      await pending.promise;
    });
    expect(renderedValue(renderer)).toBe('false:new-owner');
    await act(async () => renderer.unmount());
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  test('keeps private media cached only within the same auth session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockInvoke
      .mockResolvedValueOnce({
        data: { url: 'https://signed.example/owner-a', expiresAt: new Date(Date.now() + 120_000).toISOString() },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { url: 'https://signed.example/owner-b', expiresAt: new Date(Date.now() + 120_000).toISOString() },
        error: null,
      });
    const ref = 'r2://post-images/shared/photo.jpg';
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
    });
    await act(async () => {
      mockAuthChange?.('SIGNED_IN', session('owner-a'));
    });

    await expect(resolveMediaUrl(ref)).resolves.toBe('https://signed.example/owner-a');
    await expect(resolveMediaUrl(ref)).resolves.toBe('https://signed.example/owner-a');
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    await act(async () => {
      mockAuthChange?.('SIGNED_IN', session('owner-b'));
    });
    await expect(resolveMediaUrl(ref)).resolves.toBe('https://signed.example/owner-b');
    expect(mockInvoke).toHaveBeenCalledTimes(2);

    await act(async () => renderer.unmount());
  });

  test('does not reuse a private media URL after sign-out', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const signedOutError = new Error('not authenticated');
    mockInvoke
      .mockResolvedValueOnce({
        data: { url: 'https://signed.example/owner-a', expiresAt: new Date(Date.now() + 60_000).toISOString() },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: signedOutError });
    const ref = 'r2://post-images/shared/photo.jpg';
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
    });
    await act(async () => {
      mockAuthChange?.('SIGNED_IN', session('owner-a'));
    });
    await expect(resolveMediaUrl(ref)).resolves.toBe('https://signed.example/owner-a');

    await act(async () => {
      mockAuthChange?.('SIGNED_OUT', null);
    });
    await expect(resolveMediaUrl(ref)).rejects.toBe(signedOutError);
    expect(mockInvoke).toHaveBeenCalledTimes(2);

    await act(async () => renderer.unmount());
  });

  test('re-authorizes private media when the account changes during a signing request', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const ownerARequest = deferred<{ data: { url: string; expiresAt: string }; error: null }>();
    mockInvoke
      .mockReturnValueOnce(ownerARequest.promise)
      .mockResolvedValueOnce({
        data: { url: 'https://signed.example/owner-b', expiresAt: new Date(Date.now() + 60_000).toISOString() },
        error: null,
      });
    const ref = 'r2://post-images/shared/photo.jpg';
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      );
    });
    await act(async () => {
      mockAuthChange?.('SIGNED_IN', session('owner-a'));
    });

    const resolved = resolveMediaUrl(ref);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    await act(async () => {
      mockAuthChange?.('SIGNED_IN', session('owner-b'));
    });
    ownerARequest.resolve({
      data: { url: 'https://signed.example/owner-a', expiresAt: new Date(Date.now() + 60_000).toISOString() },
      error: null,
    });

    await expect(resolved).resolves.toBe('https://signed.example/owner-b');
    expect(mockInvoke).toHaveBeenCalledTimes(2);

    await act(async () => renderer.unmount());
  });
});
