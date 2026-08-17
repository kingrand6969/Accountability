import { describe, expect, it } from '@jest/globals';
import { BuddyCardLoadGuard } from './BuddyCardLoadGuard';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('BuddyCardLoadGuard', () => {
  it('rejects late A results after navigation to B', async () => {
    const guard = new BuddyCardLoadGuard();
    const applied: string[] = [];
    const a = deferred<string>();
    const aToken = guard.bindViewer(guard.begin('A'), 'viewer-1')!;
    const aCommit = a.promise.then((value) => {
      if (guard.owns(aToken)) applied.push(value);
    });

    const bToken = guard.bindViewer(guard.begin('B'), 'viewer-1')!;
    if (guard.owns(bToken)) applied.push('B');
    a.resolve('A');
    await aCommit;

    expect(applied).toEqual(['B']);
  });

  it('rejects late results from an older refocus of the same profile', async () => {
    const guard = new BuddyCardLoadGuard();
    const applied: string[] = [];
    const stale = deferred<string>();
    const staleToken = guard.bindViewer(guard.begin('A'), 'viewer-1')!;
    const staleCommit = stale.promise.then((value) => {
      if (guard.owns(staleToken)) applied.push(value);
    });

    const freshToken = guard.bindViewer(guard.begin('A'), 'viewer-1')!;
    if (guard.owns(freshToken)) applied.push('fresh');
    stale.resolve('stale');
    await staleCommit;

    expect(applied).toEqual(['fresh']);
  });

  it('rejects results after unmount cancellation or viewer replacement', async () => {
    const guard = new BuddyCardLoadGuard();
    const applied: string[] = [];
    const unmounted = deferred<string>();
    const oldViewer = deferred<string>();
    const unmountedToken = guard.bindViewer(guard.begin('A'), 'viewer-1')!;
    const unmountedCommit = unmounted.promise.then((value) => {
      if (guard.owns(unmountedToken)) applied.push(value);
    });
    guard.cancel(unmountedToken);

    const oldViewerToken = guard.bindViewer(guard.begin('A'), 'viewer-1')!;
    const oldViewerCommit = oldViewer.promise.then((value) => {
      if (guard.owns(oldViewerToken)) applied.push(value);
    });
    guard.bindViewer(guard.begin('A'), 'viewer-2');

    unmounted.resolve('unmounted');
    oldViewer.resolve('old-viewer');
    await Promise.all([unmountedCommit, oldViewerCommit]);
    expect(applied).toEqual([]);
  });

  it('keeps an optional failure from clearing a newer profile result', async () => {
    const guard = new BuddyCardLoadGuard();
    const applied: string[] = [];
    const optionalA = deferred<string>();
    const aToken = guard.bindViewer(guard.begin('A'), 'viewer-1')!;
    const optionalCommit = optionalA.promise.catch(() => {
      if (guard.owns(aToken)) applied.push('A fallback');
    });
    const bToken = guard.bindViewer(guard.begin('B'), 'viewer-1')!;
    if (guard.owns(bToken)) applied.push('B result');

    optionalA.reject(new Error('optional A failed'));
    await optionalCommit;
    expect(applied).toEqual(['B result']);
  });
});
