import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import type { Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockGetSession = jest.fn();
let mockAuthChange: ((_event: string, session: Session | null) => void) | null = null;
const mockUnsubscribe = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
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
    mockGetSession.mockReset();
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
});
