import type { ChecklistItem } from './types';

type Callbacks = {
  onLatestSuccess(
    revision: number,
    previous: readonly ChecklistItem[],
    next: readonly ChecklistItem[],
  ): void;
  onLatestFailure(revision: number, committed: readonly ChecklistItem[], error: unknown): void;
};

export function createChecklistPersistence(
  initial: readonly ChecklistItem[],
  write: (next: ChecklistItem[]) => Promise<void>,
  callbacks: Callbacks,
) {
  let committed = [...initial];
  let latestRevision = 0;
  let tail: Promise<void> = Promise.resolve();
  let active = true;

  return {
    submit(next: ChecklistItem[]): Promise<void> {
      const revision = ++latestRevision;
      const task = tail.then(async () => {
        const previous = committed;
        try {
          await write(next);
          committed = [...next];
          if (active && revision === latestRevision) callbacks.onLatestSuccess(revision, previous, next);
        } catch (error) {
          if (active && revision === latestRevision) callbacks.onLatestFailure(revision, committed, error);
          throw error;
        }
      });
      tail = task.catch(() => undefined);
      return task;
    },
    dispose(): void {
      active = false;
      latestRevision += 1;
    },
  };
}
