import React from 'react';
import { Pressable, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import type { Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

let mockActiveSession: Session | null = null;
const mockGetVersion = jest.fn<(ownerId: string) => Promise<string | null>>();
const mockAccept = jest.fn<() => Promise<void>>();

jest.mock('./AuthProvider', () => ({
  useAuth: () => ({ session: mockActiveSession, loading: false }),
}));
jest.mock('./consent', () => ({
  getLegalConsentVersion: (ownerId: string) => mockGetVersion(ownerId),
  acceptCurrentLegalTerms: () => mockAccept(),
  isLegalConsentCurrent: (version: string | null | undefined) => version === '2026-09-02',
}));

// eslint-disable-next-line import/first
import { LegalConsentProvider, useLegalConsent } from './LegalConsentProvider';

function session(id: string): Session {
  return { user: { id } } as Session;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function Probe() {
  const consent = useLegalConsent();
  return (
    <>
      <Text>{`${consent.status}:${consent.acceptedVersion ?? 'none'}:${consent.error ?? 'none'}`}</Text>
      <Pressable accessibilityLabel="Accept probe" onPress={() => void consent.accept()} />
      <Pressable accessibilityLabel="Retry probe" onPress={consent.retry} />
    </>
  );
}

function value(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root.findByType(Text).props.children;
}

describe('LegalConsentProvider', () => {
  beforeEach(() => {
    mockActiveSession = session('owner-1');
    mockGetVersion.mockReset();
    mockAccept.mockReset();
  });

  test.each([null, '2026-08-10'])('blocks a missing or stale accepted version %p', async (version) => {
    mockGetVersion.mockResolvedValue(version);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<LegalConsentProvider><Probe /></LegalConsentProvider>);
    });
    expect(value(renderer)).toBe(`required:${version ?? 'none'}:none`);
    expect(mockAccept).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  test('does not re-prompt a newly accepted current version', async () => {
    mockGetVersion.mockResolvedValue('2026-09-02');
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<LegalConsentProvider><Probe /></LegalConsentProvider>);
    });
    expect(value(renderer)).toBe('current:2026-09-02:none');
    expect(mockAccept).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  test('unlocks only after explicit acceptance and a current-version refresh', async () => {
    mockGetVersion
      .mockResolvedValueOnce('2026-08-10')
      .mockResolvedValueOnce('2026-09-02');
    mockAccept.mockResolvedValue();
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<LegalConsentProvider><Probe /></LegalConsentProvider>);
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Accept probe' }).props.onPress();
    });
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockGetVersion).toHaveBeenCalledTimes(2);
    expect(value(renderer)).toBe('current:2026-09-02:none');
    await act(async () => renderer.unmount());
  });

  test('a failed acceptance remains blocked and exposes a retryable error', async () => {
    mockGetVersion.mockResolvedValue('2026-08-10');
    mockAccept.mockRejectedValue(new Error('offline'));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<LegalConsentProvider><Probe /></LegalConsentProvider>);
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Accept probe' }).props.onPress();
    });
    expect(value(renderer)).toBe(
      'required:2026-08-10:We could not save your acceptance. Check your connection and try again.',
    );
    await act(async () => renderer.unmount());
  });

  test('a failed version check stays blocked until retry succeeds', async () => {
    mockGetVersion
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('2026-08-10');
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<LegalConsentProvider><Probe /></LegalConsentProvider>);
    });
    expect(value(renderer)).toBe(
      'error:none:We could not check your legal agreement status. Check your connection and try again.',
    );
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Retry probe' }).props.onPress();
    });
    expect(value(renderer)).toBe('required:2026-08-10:none');
    await act(async () => renderer.unmount());
  });

  test('an old owner read cannot unlock a newly signed-in owner', async () => {
    const ownerA = deferred<string | null>();
    mockGetVersion.mockImplementation(async (ownerId) => {
      if (ownerId === 'owner-1') return ownerA.promise;
      return '2026-09-02';
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<LegalConsentProvider><Probe /></LegalConsentProvider>);
    });
    expect(value(renderer)).toBe('loading:none:none');

    mockActiveSession = session('owner-2');
    await act(async () => {
      renderer.update(<LegalConsentProvider><Probe /></LegalConsentProvider>);
    });
    expect(value(renderer)).toBe('current:2026-09-02:none');

    await act(async () => {
      ownerA.resolve('2026-09-02');
      await ownerA.promise;
    });
    expect(value(renderer)).toBe('current:2026-09-02:none');
    expect(mockGetVersion).toHaveBeenCalledWith('owner-2');
    await act(async () => renderer.unmount());
  });
});
