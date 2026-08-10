import { describe, expect, jest, test } from '@jest/globals';
import { createStoryPlaybackLifecycle } from './storyPlaybackLifecycle';

describe('story playback lifecycle', () => {
  function setup() {
    let now = 0;
    let nextTimer = 1;
    const timers = new Map<number, { at: number; run: () => void }>();
    const advance = jest.fn();
    const lifecycle = createStoryPlaybackLifecycle({
      durationMs: 6000,
      now: () => now,
      schedule: (run, delay) => {
        const id = nextTimer++;
        timers.set(id, { at: now + delay, run });
        return id;
      },
      cancel: (id) => timers.delete(id as number),
      advance,
    });
    const elapse = (milliseconds: number) => {
      now += milliseconds;
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= now);
      due.forEach(([id, timer]) => {
        timers.delete(id);
        timer.run();
      });
    };
    return { lifecycle, advance, elapse, timers };
  }

  test('image timeout advances exactly once', () => {
    const { lifecycle, advance, elapse } = setup();
    lifecycle.show('story-a');
    elapse(6000);
    elapse(6000);
    expect(advance).toHaveBeenCalledTimes(1);
  });

  test('can start paused without creating a timer', () => {
    const schedule = jest.fn(() => 1 as ReturnType<typeof setTimeout>);
    const lifecycle = createStoryPlaybackLifecycle({
      advance: jest.fn(),
      initialPlayable: false,
      schedule,
    });
    lifecycle.show('story-a');
    expect(schedule).not.toHaveBeenCalled();
    lifecycle.dispose();
  });

  test('pause and resume preserves the remaining time', () => {
    const { lifecycle, advance, elapse } = setup();
    lifecycle.show('story-a');
    elapse(2500);
    lifecycle.setPlayable(false);
    elapse(9000);
    expect(advance).not.toHaveBeenCalled();
    lifecycle.setPlayable(true);
    elapse(3499);
    expect(advance).not.toHaveBeenCalled();
    elapse(1);
    expect(advance).toHaveBeenCalledTimes(1);
  });

  test('manual advance cancels the old story timer and resets duration', () => {
    const { lifecycle, advance, elapse } = setup();
    lifecycle.show('story-a');
    elapse(5000);
    lifecycle.show('story-b');
    elapse(1000);
    expect(advance).not.toHaveBeenCalled();
    elapse(5000);
    expect(advance).toHaveBeenCalledTimes(1);
  });

  test('rapid next and back keeps only the latest generation active', () => {
    const { lifecycle, advance, elapse, timers } = setup();
    lifecycle.show('story-a');
    lifecycle.show('story-b');
    lifecycle.show('story-a');
    expect(timers).toHaveProperty('size', 1);
    elapse(6000);
    expect(advance).toHaveBeenCalledTimes(1);
  });

  test.each(['close', 'account switch'])('%s prevents a stale advance', () => {
    const { lifecycle, advance, elapse } = setup();
    lifecycle.show('story-a');
    lifecycle.reset();
    elapse(6000);
    expect(advance).not.toHaveBeenCalled();
  });

  test('unmount prevents a stale advance', () => {
    const { lifecycle, advance, elapse } = setup();
    lifecycle.show('story-a');
    lifecycle.dispose();
    elapse(6000);
    expect(advance).not.toHaveBeenCalled();
  });

  test('StrictMode setup cleanup setup remains usable while a true detach suppresses advance', async () => {
    const { lifecycle, advance, elapse } = setup();
    lifecycle.attach();
    lifecycle.show('story-a');
    lifecycle.detach();
    lifecycle.attach();
    lifecycle.show('story-a');
    await Promise.resolve();
    elapse(6000);
    expect(advance).toHaveBeenCalledTimes(1);

    lifecycle.show('story-b');
    lifecycle.detach();
    await Promise.resolve();
    elapse(6000);
    expect(advance).toHaveBeenCalledTimes(1);
  });

  test('a canceled queued callback cannot orphan the replacement timer', () => {
    let now = 0;
    let nextTimer = 1;
    const callbacks = new Map<number, () => void>();
    const canceled = new Set<number>();
    const advance = jest.fn();
    const lifecycle = createStoryPlaybackLifecycle({
      durationMs: 6000,
      now: () => now,
      schedule: (run) => {
        const id = nextTimer++;
        callbacks.set(id, run);
        return id;
      },
      cancel: (id) => canceled.add(id as number),
      advance,
    });

    lifecycle.show('story-a');
    now = 1000;
    lifecycle.setPlayable(false);
    lifecycle.setPlayable(true);
    expect(canceled).toContain(1);

    callbacks.get(1)?.();
    lifecycle.setPlayable(false);
    expect(canceled).toContain(2);
    callbacks.get(2)?.();
    expect(advance).not.toHaveBeenCalled();
  });

  test('video end advances once and cancels fallback timing', () => {
    const { lifecycle, advance, elapse } = setup();
    lifecycle.show('video-a');
    lifecycle.mediaEnded('video-a');
    lifecycle.mediaEnded('video-a');
    elapse(6000);
    expect(advance).toHaveBeenCalledTimes(1);
  });
});

describe('story media generations', () => {
  test('stale async media resolution cannot replace current media', () => {
    const lifecycle = createStoryPlaybackLifecycle({ advance: jest.fn() });
    const oldGeneration = lifecycle.show('story-a');
    const currentGeneration = lifecycle.show('story-b');
    expect(lifecycle.acceptMedia(oldGeneration, 'story-a')).toBe(false);
    expect(lifecycle.acceptMedia(currentGeneration, 'story-b')).toBe(true);
    lifecycle.dispose();
  });
});
