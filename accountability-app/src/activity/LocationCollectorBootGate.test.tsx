import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const mockReconcile = jest.fn<() => Promise<
  'running' | 'paused' | 'closing' | 'capability_unavailable' | 'uncertain'
>>();
type LaunchProps = {
  message: string;
  error?: boolean;
  actionLabel?: string;
  onAction?: () => void;
};
const mockLaunchState = jest.fn((_props: LaunchProps) => null);

jest.mock('./locationTask', () => ({
  reconcileLocationCollectorAtBoot: () => mockReconcile(),
}));

jest.mock('../ui/AppLaunchState', () => ({
  AppLaunchState: (props: LaunchProps) => mockLaunchState(props),
}));

// eslint-disable-next-line import/first -- component loads after mutable platform mocks
import { LocationCollectorBootGate } from './LocationCollectorBootGate';

function ChildScreen() {
  return null;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mockReconcile.mockReset();
  mockLaunchState.mockClear();
});

describe('LocationCollectorBootGate', () => {
  test('holds the app shell until the native collector is reconciled', async () => {
    const result = deferred<'paused'>();
    mockReconcile.mockReturnValue(result.promise);

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <LocationCollectorBootGate>
          <ChildScreen />
        </LocationCollectorBootGate>,
      );
      await Promise.resolve();
    });

    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(0);
    expect(mockLaunchState).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'Checking activity tracking' }),
    );
    expect(mockReconcile).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.resolve('paused');
      await result.promise;
    });

    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(1);
  });

  test('keeps one native reconciliation in flight during Strict Mode replay', async () => {
    const result = deferred<'paused'>();
    mockReconcile.mockReturnValue(result.promise);

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <React.StrictMode>
          <LocationCollectorBootGate>
            <ChildScreen />
          </LocationCollectorBootGate>
        </React.StrictMode>,
      );
      await Promise.resolve();
    });

    expect(mockReconcile).toHaveBeenCalledTimes(1);
    await act(async () => {
      result.resolve('paused');
      await result.promise;
    });
    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(1);
  });

  test.each(['running', 'paused', 'closing'] as const)(
    'opens the app after the owner-free %s result',
    async (status) => {
      mockReconcile.mockResolvedValue(status);
      let renderer!: TestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = TestRenderer.create(
          <LocationCollectorBootGate>
            <ChildScreen />
          </LocationCollectorBootGate>,
        );
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(1);
    },
  );

  test.each(['capability_unavailable', 'uncertain'] as const)(
    'fails closed for %s and retries without mounting private screens',
    async (firstStatus) => {
      mockReconcile
        .mockResolvedValueOnce(firstStatus)
        .mockResolvedValueOnce('paused');

      let renderer!: TestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = TestRenderer.create(
          <LocationCollectorBootGate>
            <ChildScreen />
          </LocationCollectorBootGate>,
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(0);
      const error = mockLaunchState.mock.calls.at(-1)?.[0];
      expect(error).toMatchObject({
        message: 'We could not verify activity tracking is safe',
        error: true,
        actionLabel: 'Try again',
      });

      await act(async () => {
        error?.onAction?.();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockReconcile).toHaveBeenCalledTimes(2);
      expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(1);
    },
  );

  test('fails closed when the boot bridge throws before returning a promise', async () => {
    mockReconcile.mockImplementation(() => {
      throw new Error('native bridge missing');
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <LocationCollectorBootGate>
          <ChildScreen />
        </LocationCollectorBootGate>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(0);
    expect(mockLaunchState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: 'We could not verify activity tracking is safe',
        error: true,
      }),
    );
  });
});
