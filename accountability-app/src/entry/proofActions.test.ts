import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  canRetryProofAction,
  createAsyncSerialQueue,
  createProofActionSession,
  endProofAction,
  initialProofActionState,
  isOwnedProofActionToken,
  isCurrentProofActionToken,
  isProofActionBusy,
  proofActionReducer,
  rotateProofActionSession,
  shareAvailability,
  tryBeginProofAction,
} from './proofActions';
import {
  PROOF_LOAD_TIMEOUT_MS,
  withProofLoadTimeout,
} from './proofLoadTimeout';
import { createProofRetryGuard } from './proofRetryGuard';

describe('proof loading watchdog', () => {
  it('ends a stalled initial authentication load in the retryable timeout state', async () => {
    jest.useFakeTimers();
    const initialLoad = withProofLoadTimeout(new Promise<never>(() => {}));
    jest.advanceTimersByTime(PROOF_LOAD_TIMEOUT_MS);
    await expect(initialLoad).resolves.toEqual({ status: 'timeout' });
    jest.useRealTimers();
  });

  it('ends a stalled Retry load instead of returning to a permanent spinner', async () => {
    jest.useFakeTimers();
    const retryLoad = withProofLoadTimeout(new Promise<never>(() => {}));
    jest.advanceTimersByTime(PROOF_LOAD_TIMEOUT_MS);
    await expect(retryLoad).resolves.toEqual({ status: 'timeout' });
    jest.useRealTimers();

    const screenSource = readFileSync(
      path.join(process.cwd(), 'src', 'app', 'win-card.tsx'),
      'utf8',
    );
    expect(screenSource.match(/withProofLoadTimeout\(supabase\.auth\.getUser\(\)\)/g))
      .toHaveLength(2);
    expect(screenSource).toContain('markLoadError()');
    const orchestrationSource = readFileSync(
      path.join(process.cwd(), 'src', 'entry', 'useProofActionOrchestrator.ts'),
      'utf8',
    );
    expect(orchestrationSource).toContain(
      'withProofLoadTimeout(Promise.all([',
    );
    expect(orchestrationSource).toMatch(
      /loadResult\.status === 'timeout'[\s\S]*?setLoadError\(true\)/,
    );
  });

  it('keeps a timed-out result final when the stale operation completes later', async () => {
    jest.useFakeTimers();
    let complete!: (value: string) => void;
    const operation = new Promise<string>((resolve) => {
      complete = resolve;
    });
    const guarded = withProofLoadTimeout(operation);
    jest.advanceTimersByTime(PROOF_LOAD_TIMEOUT_MS);
    await expect(guarded).resolves.toEqual({ status: 'timeout' });
    complete('stale owner data');
    await Promise.resolve();
    await expect(guarded).resolves.toEqual({ status: 'timeout' });
    jest.useRealTimers();
  });
});

describe('proof Retry lifecycle guard', () => {
  it('rejects a late owner A result after switching to B', () => {
    const guard = createProofRetryGuard();
    const retryA = guard.begin('owner-a');
    guard.invalidate();
    expect(guard.isCurrent(retryA, 'owner-b', true)).toBe(false);
  });

  it('rejects a late owner A result across an A to B to A ABA transition', () => {
    const guard = createProofRetryGuard();
    const retryA = guard.begin('owner-a');
    guard.invalidate();
    guard.invalidate();
    expect(guard.isCurrent(retryA, 'owner-a', true)).toBe(false);
  });

  it.each(['blur', 'unmount'])('rejects a late result after %s', (lifecycle) => {
    const guard = createProofRetryGuard();
    const retry = guard.begin('owner-a');
    if (lifecycle === 'blur') guard.invalidate();
    expect(guard.isCurrent(retry, 'owner-a', lifecycle !== 'unmount')).toBe(false);
  });

  it('rejects a late promise rejection after an account change', () => {
    const guard = createProofRetryGuard();
    const rejectedRetry = guard.begin('owner-a');
    guard.invalidate();
    expect(guard.isCurrent(rejectedRetry, 'owner-b', true)).toBe(false);
  });

  it.each(['blur', 'unmount'])(
    'rejects a late promise rejection after %s',
    (lifecycle) => {
      const guard = createProofRetryGuard();
      const rejectedRetry = guard.begin('owner-a');
      if (lifecycle === 'blur') guard.invalidate();
      expect(
        guard.isCurrent(rejectedRetry, 'owner-a', lifecycle !== 'unmount'),
      ).toBe(false);
    },
  );

  it('guards both Retry resolution and rejection before error-state mutation', () => {
    const screenSource = readFileSync(
      path.join(process.cwd(), 'src', 'app', 'win-card.tsx'),
      'utf8',
    );
    expect(screenSource).toContain('if (!isRetryCurrent()) return;');
    expect(screenSource).toContain('if (isRetryCurrent()) markLoadError();');
  });
});

describe('initial proof auth lifecycle guard', () => {
  it('rejects a late initial owner A result after switching to B', () => {
    const guard = createProofRetryGuard();
    const initialA = guard.begin('owner-a');
    guard.invalidate();
    expect(guard.isCurrent(initialA, 'owner-b', true)).toBe(false);
  });

  it('rejects a late initial owner A result across an A to B to A transition', () => {
    const guard = createProofRetryGuard();
    const initialA = guard.begin('owner-a');
    guard.invalidate();
    guard.invalidate();
    expect(guard.isCurrent(initialA, 'owner-a', true)).toBe(false);
  });

  it('rejects a late initial rejection after an auth change', () => {
    const guard = createProofRetryGuard();
    const initialA = guard.begin('owner-a');
    guard.invalidate();
    expect(guard.isCurrent(initialA, 'owner-b', true)).toBe(false);
  });

  it('guards initial resolution and rejection before state mutation', () => {
    const screenSource = readFileSync(
      path.join(process.cwd(), 'src', 'app', 'win-card.tsx'),
      'utf8',
    );
    expect(screenSource).toContain('const initialToken = retryGuardRef.current.begin');
    expect(screenSource).toContain('if (!isInitialCurrent()) return;');
    expect(screenSource).toContain('if (isInitialCurrent()) markLoadError();');
  });
});

describe('proof action state', () => {
  it('tracks every destination independently through success and retry', () => {
    const initial = initialProofActionState();
    const working = proofActionReducer(initial, { type: 'begin', action: 'post-feed' });
    expect(isProofActionBusy(working, 'post-feed')).toBe(true);
    expect(working['save-memories'].status).toBe('idle');
    const failed = proofActionReducer(working, {
      type: 'error',
      action: 'post-feed',
      message: 'Try again.',
    });
    expect(canRetryProofAction(failed['post-feed'])).toBe(true);
    expect(proofActionReducer(failed, { type: 'begin', action: 'post-feed' })['post-feed'].status)
      .toBe('working');
  });

  it('ignores a rapid second begin for the same action', () => {
    const working = proofActionReducer(initialProofActionState(), {
      type: 'begin',
      action: 'save-phone',
      operationId: 'first',
    });
    expect(proofActionReducer(working, {
      type: 'begin',
      action: 'save-phone',
      operationId: 'second',
    })).toBe(working);
  });

  it('retains ambiguous and unresolved operation identity without enabling retry', () => {
    const ambiguous = proofActionReducer(initialProofActionState(), {
      type: 'ambiguous',
      action: 'save-memories',
      operationId: 'op-1',
      message: 'Check Memories',
    });
    expect(ambiguous['save-memories']).toMatchObject({
      status: 'ambiguous',
      operationId: 'op-1',
    });
    expect(canRetryProofAction(ambiguous['save-memories'])).toBe(false);
  });

  it('reports explicit share availability', () => {
    expect(shareAvailability('web', true).status).toBe('unavailable');
    expect(shareAvailability('android', false).status).toBe('unavailable');
    expect(shareAvailability('ios', true)).toEqual({ status: 'available' });
  });

  it('enforces synchronous single-flight and generation-bound owner mutations', () => {
    const session = createProofActionSession('owner-a');
    const tokenA = tryBeginProofAction(session, 'post-feed');
    expect(tokenA).not.toBeNull();
    expect(tryBeginProofAction(session, 'post-feed')).toBeNull();

    rotateProofActionSession(session, 'owner-b');
    const tokenB = tryBeginProofAction(session, 'post-feed');
    expect(tokenB).not.toBeNull();
    expect(isCurrentProofActionToken(session, tokenA!)).toBe(false);
    expect(isCurrentProofActionToken(session, tokenB!)).toBe(true);

    endProofAction(session, tokenA!);
    expect(tryBeginProofAction(session, 'post-feed')).toBeNull();
    endProofAction(session, tokenB!);
    expect(tryBeginProofAction(session, 'post-feed')).not.toBeNull();
  });

  it('serializes capture work even when different actions interleave', async () => {
    const queue = createAsyncSerialQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
    const first = queue.run(async () => {
      events.push('feed:start');
      markFirstStarted();
      await firstGate;
      events.push('feed:end');
      return 'feed';
    });
    const second = queue.run(async () => {
      events.push('memory:start');
      events.push('memory:end');
      return 'memory';
    });
    await firstStarted;
    expect(events).toEqual(['feed:start']);
    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual(['feed', 'memory']);
    expect(events).toEqual(['feed:start', 'feed:end', 'memory:start', 'memory:end']);
  });

  it('fails closed for A to B and ABA owner changes during an awaited stage', async () => {
    for (const returnOwner of ['owner-b', 'owner-a']) {
      const session = createProofActionSession('owner-a');
      const tokenA = tryBeginProofAction(session, 'post-feed')!;
      let resumeOwnerCheck!: (owner: string | null) => void;
      const ownerCheck = new Promise<string | null>((resolve) => {
        resumeOwnerCheck = resolve;
      });
      const checked = isOwnedProofActionToken(session, tokenA, () => ownerCheck);
      rotateProofActionSession(session, 'owner-b');
      if (returnOwner === 'owner-a') rotateProofActionSession(session, 'owner-a');
      resumeOwnerCheck(returnOwner);
      await expect(checked).resolves.toBe(false);
    }
  });

  it('binds win-card integration to generation tokens and the serialized capture gate', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src', 'app', 'win-card.tsx'),
      'utf8',
    );
    const orchestrationSource = readFileSync(
      path.join(process.cwd(), 'src', 'entry', 'useProofActionOrchestrator.ts'),
      'utf8',
    );
    expect(source).toContain('captureQueueRef.current.run');
    expect(orchestrationSource).toContain(
      'isCurrentProofActionToken(actionSessionRef.current, token)',
    );
    expect(orchestrationSource).toContain('endProofAction(actionSessionRef.current, token)');
    expect(orchestrationSource).toContain('isOwnedProofActionToken(');
    expect(source).not.toContain('inFlightRef');
    expect(orchestrationSource).not.toContain('inFlightRef');
    expect(source.match(/captureDestination\([\s\S]*?token,\s*\)/g)).toHaveLength(4);
    expect(source).toMatch(
      /if \(!uri\) \{[\s\S]*?type: 'error', action: 'share-external'[\s\S]*?return;/,
    );
    for (const destinationCall of [
      'createPost(message, imageUrl)',
      'Sharing.shareAsync(uri',
      'MediaLibrary.createAssetAsync(uri)',
      'saveImageToMemories(uri)',
    ]) {
      const index = source.indexOf(destinationCall);
      expect(index).toBeGreaterThan(0);
      expect(source.slice(Math.max(0, index - 180), index))
        .toContain('requireCurrentActionOwner(token)');
    }
    expect(orchestrationSource).toContain('setStats(null)');
    expect(source).toContain('setSelectedCaptureContext(null)');
  });
});
