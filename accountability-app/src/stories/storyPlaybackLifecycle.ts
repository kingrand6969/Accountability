type TimerHandle = unknown;

type StoryPlaybackOptions = {
  durationMs?: number;
  initialPlayable?: boolean;
  now?: () => number;
  schedule?: (run: () => void, delayMs: number) => TimerHandle;
  cancel?: (timer: TimerHandle) => void;
  advance: () => void;
};

type StoryPlaybackGate = {
  focused: boolean;
  appActive: boolean;
  loading: boolean;
  paused: boolean;
  dataReady: boolean;
};

export function isStoryPlaybackPlayable(gate: StoryPlaybackGate): boolean {
  return gate.focused && gate.appActive && !gate.loading && !gate.paused && gate.dataReady;
}

/**
 * Owns the single auto-advance deadline for the displayed story.
 * Pausing preserves elapsed time; changing stories always starts a fresh deadline.
 */
export function createStoryPlaybackLifecycle(options: StoryPlaybackOptions) {
  const durationMs = options.durationMs ?? 6000;
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((run, delay) => setTimeout(run, delay));
  const cancel = options.cancel ?? ((timer: TimerHandle) => {
    clearTimeout(timer as ReturnType<typeof setTimeout>);
  });
  let generation = 0;
  let attachmentGeneration = 0;
  let attached = true;
  let storyId: string | null = null;
  let playable = options.initialPlayable ?? true;
  let disposed = false;
  let fired = false;
  let remainingMs = durationMs;
  let startedAt = 0;
  let timer: { handle: TimerHandle; token: object } | null = null;
  let advance = options.advance;

  function clearTimer() {
    if (timer !== null) cancel(timer.handle);
    timer = null;
  }

  function advanceCurrent(expectedGeneration: number, expectedStoryId: string) {
    if (
      disposed ||
      !attached ||
      fired ||
      !playable ||
      generation !== expectedGeneration ||
      storyId !== expectedStoryId
    ) return;
    fired = true;
    advance();
  }

  function fire(expectedGeneration: number, expectedStoryId: string, token: object) {
    if (timer?.token !== token) return;
    timer = null;
    advanceCurrent(expectedGeneration, expectedStoryId);
  }

  function arm() {
    clearTimer();
    if (disposed || !attached || fired || !playable || !storyId) return;
    startedAt = now();
    const expectedGeneration = generation;
    const expectedStoryId = storyId;
    const token = {};
    const handle = schedule(() => fire(expectedGeneration, expectedStoryId, token), remainingMs);
    timer = { handle, token };
  }

  return {
    attach() {
      attachmentGeneration += 1;
      attached = true;
      disposed = false;
    },
    detach() {
      const expectedAttachment = ++attachmentGeneration;
      attached = false;
      generation += 1;
      clearTimer();
      queueMicrotask(() => {
        if (attachmentGeneration !== expectedAttachment || attached) return;
        disposed = true;
        storyId = null;
      });
    },
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
      advanceCurrent(generation, endedStoryId);
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
      attachmentGeneration += 1;
      attached = false;
      disposed = true;
      generation += 1;
      storyId = null;
      clearTimer();
    },
  };
}
