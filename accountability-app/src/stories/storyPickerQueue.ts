export type StoryPickerHandle = { openPicker: () => void };

export function createStoryPickerQueue() {
  let handle: StoryPickerHandle | null = null;
  let pending = false;
  let generation = 0;
  return {
    request() {
      if (handle) return handle.openPicker();
      pending = true;
    },
    attach(nextHandle: StoryPickerHandle | null) {
      handle = nextHandle;
      generation += 1;
      if (!handle || !pending) return;
      pending = false;
      const attachedHandle = handle;
      const attachedGeneration = generation;
      queueMicrotask(() => {
        if (handle === attachedHandle && generation === attachedGeneration) {
          attachedHandle.openPicker();
        }
      });
    },
    reset() {
      handle = null;
      pending = false;
      generation += 1;
    },
  };
}
