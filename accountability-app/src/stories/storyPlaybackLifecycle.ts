type TimerHandle = ReturnType<typeof setTimeout>;

type StoryPlaybackOptions = {
  durationMs?: number;
  initialPlayable?: boolean;
  now?: () => number;
  schedule?: (run: () => void, delayMs: number) => TimerHandle;
  cancel?: (timer: TimerHandle) => void;
  advance: () => void;
};

/**
 * Owns the single auto-advance deadline for the displayed story.
 * Pausing preserves elapsed time; changing stories always starts a fresh deadline.
 */
export function createStoryPlaybackLifecycle(options: StoryPlaybackOptions) {
  const durationMs = options.durationMs ?? 6000;
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((run, delay) => setTimeout(run, delay));
  const cancel = options.cancel ?? clearTimeout;
  let generation = 0;
  let storyId: string | null = null;
  let playable = options.initialPlayable ?? true;
  let disposed = false;
  let fired = false;
  let remainingMs = durationMs;
  let startedAt = 0;
  let timer: TimerHandle | null = null;
  let advance = options.advance;

  function clearTimer() {
    if (timer !== null) cancel(timer);
    timer = null;
  }

  function fire(expectedGeneration: number, expectedStoryId: string) {
    timer = null;
    if (
      disposed ||
      fired ||
      !playable ||
      generation !== expectedGeneration ||
      storyId !== expectedStoryId
    ) return;
    fired = true;
    advance();
  }

  function arm() {
    clearTimer();
    if (disposed || fired || !playable || !storyId) return;
    startedAt = now();
    const expectedGeneration = generation;
    const expectedStoryId = storyId;
    timer = schedule(() => fire(expectedGeneration, expectedStoryId), remainingMs);
  }

  return {
    setAdvance(nextAdvance: () => void) {
      advance = nextAdvance;
    },
    show(nextStoryId: string) {
      generation += 1;
      storyId = nextStoryId;
      remainingMs = durationMs;
      fired = false;
      arm();
      return generation;
    },
    setPlayable(nextPlayable: boolean) {
      if (disposed || playable === nextPlayable) return;
      if (!nextPlayable && timer !== null) {
        remainingMs = Math.max(0, remainingMs - (now() - startedAt));
        clearTimer();
      }
      playable = nextPlayable;
      if (playable) arm();
    },
    mediaEnded(endedStoryId: string) {
      if (endedStoryId !== storyId) return;
      clearTimer();
      fire(generation, endedStoryId);
    },
    acceptMedia(mediaGeneration: number, mediaStoryId: string) {
      return !disposed && mediaGeneration === generation && mediaStoryId === storyId;
    },
    reset() {
      generation += 1;
      storyId = null;
      remainingMs = durationMs;
      fired = false;
      clearTimer();
    },
    dispose() {
      disposed = true;
      generation += 1;
      storyId = null;
      clearTimer();
    },
  };
}
