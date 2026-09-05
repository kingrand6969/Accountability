import React from 'react';
import { Pressable, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

type Status =
  | 'running'
  | 'paused'
  | 'closing'
  | 'capability_unavailable'
  | 'uncertain';

let mockAuthLoading = false;
let mockOwnerId: string | null = null;
const mockReconcileOwner = jest.fn<(ownerId: string | null) => Promise<Status>>();
type LaunchProps = {
  message: string;
  error?: boolean;
  actionLabel?: string;
  onAction?: () => void;
};
const mockLaunchState = jest.fn((_props: LaunchProps) => null);

jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    loading: mockAuthLoading,
    session: mockOwnerId ? { user: { id: mockOwnerId } } : null,
  }),
}));

jest.mock('./locationTask', () => ({
  reconcileLocationCollectorForOwner: (ownerId: string | null) =>
    mockReconcileOwner(ownerId),
}));

jest.mock('../ui/AppLaunchState', () => ({
  AppLaunchState: (props: LaunchProps) => mockLaunchState(props),
}));

// eslint-disable-next-line import/first -- component loads after mutable auth mocks
import { LocationCollectorOwnerGate } from './LocationCollectorOwnerGate';

function ChildScreen() {
  return null;
}

let mockStatefulChildMounts = 0;
let mockModalHostMounts = 0;
let mockModalHostUnmounts = 0;

function ModalHostSentinel() {
  React.useEffect(() => {
    mockModalHostMounts += 1;
    return () => {
      mockModalHostUnmounts += 1;
    };
  }, []);
  return null;
}

function StatefulChildScreen() {
  const [instance] = React.useState(() => ++mockStatefulChildMounts);
  const [count, setCount] = React.useState(0);
  return <>
    <Pressable accessibilityLabel="Stateful child" onPress={() => setCount((value) => value + 1)}>
      <Text>{`instance:${instance}:count:${count}`}</Text>
    </Pressable>
    <ModalHostSentinel />
  </>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function renderOrUpdate(renderer?: TestRenderer.ReactTestRenderer) {
  await act(async () => {
    if (renderer) {
      renderer.update(
        <LocationCollectorOwnerGate>
          <ChildScreen />
        </LocationCollectorOwnerGate>,
      );
    } else {
      renderer = TestRenderer.create(
        <LocationCollectorOwnerGate>
          <ChildScreen />
        </LocationCollectorOwnerGate>,
      );
    }
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer!;
}

beforeEach(() => {
  mockAuthLoading = false;
  mockOwnerId = null;
  mockReconcileOwner.mockReset();
  mockLaunchState.mockClear();
  mockStatefulChildMounts = 0;
  mockModalHostMounts = 0;
  mockModalHostUnmounts = 0;
});

describe('LocationCollectorOwnerGate', () => {
  test('passes through without location reconciliation when a higher-priority gate disables it', async () => {
    mockOwnerId = 'owner-a';
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <LocationCollectorOwnerGate enabled={false}>
          <ChildScreen />
        </LocationCollectorOwnerGate>,
      );
      await Promise.resolve();
    });

    expect(mockReconcileOwner).not.toHaveBeenCalled();
    expect(mockLaunchState).not.toHaveBeenCalled();
    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(1);
  });

  test('unmounts disabled children and modal hosts while enabling waits for owner reconciliation', async () => {
    const result = deferred<'running'>();
    mockOwnerId = 'owner-a';
    mockReconcileOwner.mockReturnValue(result.promise);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <LocationCollectorOwnerGate enabled={false}>
          <StatefulChildScreen />
        </LocationCollectorOwnerGate>,
      );
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Stateful child' }).props.onPress();
    });
    expect(mockStatefulChildMounts).toBe(1);
    expect(mockModalHostMounts).toBe(1);
    expect(renderer.root.findByType(Text).props.children).toBe('instance:1:count:1');

    await act(async () => {
      renderer.update(
        <LocationCollectorOwnerGate enabled>
          <StatefulChildScreen />
        </LocationCollectorOwnerGate>,
      );
      await Promise.resolve();
    });

    expect(renderer.root.findAllByType(StatefulChildScreen)).toHaveLength(0);
    expect(mockStatefulChildMounts).toBe(1);
    expect(mockModalHostUnmounts).toBe(1);
    expect(mockLaunchState).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'Checking activity tracking' }),
    );

    await act(async () => {
      result.resolve('running');
      await result.promise;
    });

    expect(mockStatefulChildMounts).toBe(2);
    expect(mockModalHostMounts).toBe(2);
    expect(renderer.root.findByType(Text).props.children).toBe('instance:2:count:0');
  });

  test('keeps a previously mounted child and modal hosts unmounted behind the retry state', async () => {
    mockOwnerId = 'owner-a';
    mockReconcileOwner.mockResolvedValue('uncertain');
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <LocationCollectorOwnerGate enabled={false}>
          <StatefulChildScreen />
        </LocationCollectorOwnerGate>,
      );
    });
    await act(async () => {
      renderer.update(
        <LocationCollectorOwnerGate enabled>
          <StatefulChildScreen />
        </LocationCollectorOwnerGate>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockStatefulChildMounts).toBe(1);
    expect(mockModalHostUnmounts).toBe(1);
    expect(renderer.root.findAllByType(StatefulChildScreen)).toHaveLength(0);
    expect(mockLaunchState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: 'We could not verify activity tracking is safe',
        error: true,
        actionLabel: 'Try again',
      }),
    );
  });

  test('waits for auth before reconciling the collector', async () => {
    mockAuthLoading = true;
    const renderer = await renderOrUpdate();

    expect(mockReconcileOwner).not.toHaveBeenCalled();
    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(0);
    expect(mockLaunchState).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: 'Checking activity tracking' }),
    );
  });

  test('gates signed-out launch until any prior owner collector is stopped', async () => {
    const result = deferred<'paused'>();
    mockReconcileOwner.mockReturnValue(result.promise);
    const renderer = await renderOrUpdate();

    expect(mockReconcileOwner).toHaveBeenCalledWith(null);
    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(0);

    await act(async () => {
      result.resolve('paused');
      await result.promise;
    });
    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(1);
  });

  test('keeps one same-owner reconciliation in flight during Strict Mode replay', async () => {
    const result = deferred<'running'>();
    mockOwnerId = 'owner-a';
    mockReconcileOwner.mockReturnValue(result.promise);

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <React.StrictMode>
          <LocationCollectorOwnerGate>
            <ChildScreen />
          </LocationCollectorOwnerGate>
        </React.StrictMode>,
      );
      await Promise.resolve();
    });

    expect(mockReconcileOwner).toHaveBeenCalledTimes(1);
    await act(async () => {
      result.resolve('running');
      await result.promise;
    });
    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(1);
  });

  test('hides A immediately and ignores its stale completion when auth switches to B', async () => {
    const ownerA = deferred<'running'>();
    const ownerB = deferred<'paused'>();
    mockReconcileOwner.mockImplementation((ownerId) =>
      ownerId === 'owner-a' ? ownerA.promise : ownerB.promise,
    );
    mockOwnerId = 'owner-a';
    let renderer = await renderOrUpdate();
    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(0);

    mockOwnerId = 'owner-b';
    renderer = await renderOrUpdate(renderer);
    expect(mockReconcileOwner).toHaveBeenCalledWith('owner-b');
    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(0);

    await act(async () => {
      ownerA.resolve('running');
      await ownerA.promise;
    });
    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(0);

    await act(async () => {
      ownerB.resolve('paused');
      await ownerB.promise;
    });
    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(1);
  });

  test('issues a fresh owner intent and rejects both stale completions across A to B to A', async () => {
    const firstA = deferred<'running'>();
    const ownerB = deferred<'paused'>();
    const latestA = deferred<'running'>();
    mockReconcileOwner
      .mockReturnValueOnce(firstA.promise)
      .mockReturnValueOnce(ownerB.promise)
      .mockReturnValueOnce(latestA.promise);

    mockOwnerId = 'owner-a';
    let renderer = await renderOrUpdate();
    mockOwnerId = 'owner-b';
    renderer = await renderOrUpdate(renderer);
    mockOwnerId = 'owner-a';
    renderer = await renderOrUpdate(renderer);

    expect(mockReconcileOwner.mock.calls).toEqual([
      ['owner-a'],
      ['owner-b'],
      ['owner-a'],
    ]);
    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(0);

    await act(async () => {
      firstA.resolve('running');
      await firstA.promise;
    });
    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(0);

    await act(async () => {
      ownerB.resolve('paused');
      await ownerB.promise;
    });
    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(0);

    await act(async () => {
      latestA.resolve('running');
      await latestA.promise;
    });
    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(1);
  });

  test.each(['capability_unavailable', 'uncertain'] as const)(
    'fails closed for owner reconciliation result %s',
    async (status) => {
      mockOwnerId = 'owner-a';
      mockReconcileOwner.mockResolvedValue(status);
      const renderer = await renderOrUpdate();

      expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(0);
      expect(mockLaunchState).toHaveBeenLastCalledWith(
        expect.objectContaining({
          message: 'We could not verify activity tracking is safe',
          error: true,
          actionLabel: 'Try again',
        }),
      );
    },
  );

  test('does not let a stale retry hide the newly reconciled owner', async () => {
    const retryA = deferred<'running'>();
    mockOwnerId = 'owner-a';
    mockReconcileOwner
      .mockResolvedValueOnce('uncertain')
      .mockReturnValueOnce(retryA.promise)
      .mockResolvedValueOnce('paused');
    let renderer = await renderOrUpdate();
    const retry = mockLaunchState.mock.calls.at(-1)?.[0].onAction;

    await act(async () => {
      retry?.();
      await Promise.resolve();
    });
    mockOwnerId = 'owner-b';
    renderer = await renderOrUpdate(renderer);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(1);

    await act(async () => {
      retryA.resolve('running');
      await retryA.promise;
    });
    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(1);
  });

  test('does not let a stale retry failure hide the newly reconciled owner', async () => {
    const retryA = deferred<'running'>();
    mockOwnerId = 'owner-a';
    mockReconcileOwner
      .mockResolvedValueOnce('uncertain')
      .mockReturnValueOnce(retryA.promise)
      .mockResolvedValueOnce('paused');
    let renderer = await renderOrUpdate();
    const retry = mockLaunchState.mock.calls.at(-1)?.[0].onAction;

    await act(async () => {
      retry?.();
      await Promise.resolve();
    });
    mockOwnerId = 'owner-b';
    renderer = await renderOrUpdate(renderer);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(1);

    await act(async () => {
      retryA.reject(new Error('stale A failed'));
      await retryA.promise.catch(() => undefined);
    });
    expect(renderer.root.findAllByType(ChildScreen)).toHaveLength(1);
  });
});
