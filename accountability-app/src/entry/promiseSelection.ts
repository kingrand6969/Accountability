export function togglePromiseSelection(
  current: ReadonlySet<string>,
  id: string,
  maximum = 3,
): Set<string> {
  const next = new Set(current);
  if (next.has(id)) {
    next.delete(id);
  } else if (next.size < maximum) {
    next.add(id);
  }
  return next;
}

export function promiseCompletionWrites(
  userId: string,
  selected: ReadonlySet<string>,
  completion: 'start' | 'skip',
) {
  return {
    dailyKey: `daily-promises:${userId}`,
    dailyValue: JSON.stringify(completion === 'skip' ? [] : [...selected]),
    onboardingKey: `onboarded:${userId}`,
    onboardingValue: '1',
    persistTimeline: completion === 'start',
  };
}

type PromiseCompletionRequest = {
  userId: string | null;
  selected: ReadonlySet<string>;
  completion: 'start' | 'skip';
};

type PromiseCompletionDependencies = {
  persistTimeline: (selected: ReadonlySet<string>) => Promise<void>;
  setItem: (key: string, value: string) => Promise<void>;
  isCurrentOwner?: () => boolean;
};

export type PromiseCompletionResult =
  | { outcome: 'noop' }
  | { outcome: 'detached' }
  | { outcome: 'stay'; error: string }
  | {
      outcome: 'completed';
      warning?: string;
      storageFailures?: ('daily' | 'onboarding')[];
    };

export function createSingleFlight() {
  let active: Promise<unknown> | null = null;
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      if (active) return active as Promise<T>;
      const pending = task().finally(() => {
        if (active === pending) active = null;
      });
      active = pending;
      return pending;
    },
  };
}

export async function completePromiseSelection(
  request: PromiseCompletionRequest,
  dependencies: PromiseCompletionDependencies,
): Promise<PromiseCompletionResult> {
  const isCurrentOwner = dependencies.isCurrentOwner ?? (() => true);
  if (!request.userId) {
    return {
      outcome: 'stay',
      error: 'Please sign in again before starting your day.',
    };
  }
  if (request.completion === 'start' && request.selected.size === 0) {
    return { outcome: 'noop' };
  }
  if (!isCurrentOwner()) return { outcome: 'detached' };

  if (request.completion === 'start') {
    try {
      if (!isCurrentOwner()) return { outcome: 'detached' };
      await dependencies.persistTimeline(request.selected);
      if (!isCurrentOwner()) return { outcome: 'detached' };
    } catch (error) {
      if (!isCurrentOwner()) return { outcome: 'detached' };
      return {
        outcome: 'stay',
        error: `${String((error as Error).message ?? error)} Check your connection, then try again.`,
      };
    }
  }

  const writes = promiseCompletionWrites(
    request.userId,
    request.selected,
    request.completion,
  );
  const storageFailures: ('daily' | 'onboarding')[] = [];
  if (!isCurrentOwner()) return { outcome: 'detached' };
  try {
    await dependencies.setItem(writes.dailyKey, writes.dailyValue);
  } catch {
    storageFailures.push('daily');
  }
  if (!isCurrentOwner()) return { outcome: 'detached' };
  try {
    await dependencies.setItem(writes.onboardingKey, writes.onboardingValue);
  } catch {
    storageFailures.push('onboarding');
  }
  if (!isCurrentOwner()) return { outcome: 'detached' };

  if (storageFailures.length === 0) return { outcome: 'completed' };
  const warning =
    storageFailures.length === 2
      ? "Your day is ready, but today's promise choices and onboarding completion were not saved on this device. Continue now; you may need to choose again next time."
      : storageFailures[0] === 'daily'
        ? "Your day is ready, but today's promise choices were not saved on this device. Continue now; you can choose them again later."
        : 'Your day is ready, but this device could not remember that onboarding is complete. Continue now; onboarding may appear again next time.';
  return { outcome: 'completed', storageFailures, warning };
}
