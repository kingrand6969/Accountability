import { describe, expect, jest, test } from '@jest/globals';
import {
  createAchievementShareController,
  createAchievementSharePromptLifecycle,
} from './AchievementSharePrompt';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function callbacks() {
  return {
    onFeed: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    onStory: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    onPrivate: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    onClose: jest.fn(),
  };
}

describe('AchievementSharePrompt controller', () => {
  test('rendering the initial controller never publishes', () => {
    const cb = callbacks();
    const controller = createAchievementShareController(cb);
    expect(controller.getState().decision).toEqual({ destination: null, confirmed: false });
    expect(cb.onFeed).not.toHaveBeenCalled();
    expect(cb.onStory).not.toHaveBeenCalled();
    expect(cb.onPrivate).not.toHaveBeenCalled();
  });

  test('feed and story selections require an explicit confirmation', async () => {
    const cb = callbacks();
    const controller = createAchievementShareController(cb);
    controller.select('feed');
    expect(cb.onFeed).not.toHaveBeenCalled();
    await controller.confirm();
    expect(cb.onFeed).toHaveBeenCalledTimes(1);
    expect(cb.onClose).toHaveBeenCalledTimes(1);
  });

  test('keeping private invokes only private and closes without confirmation', async () => {
    const cb = callbacks();
    const controller = createAchievementShareController(cb);
    await controller.keepPrivate();
    expect(cb.onPrivate).toHaveBeenCalledTimes(1);
    expect(cb.onFeed).not.toHaveBeenCalled();
    expect(cb.onStory).not.toHaveBeenCalled();
    expect(cb.onClose).toHaveBeenCalledTimes(1);
  });

  test('cancel invokes close only', () => {
    const cb = callbacks();
    const controller = createAchievementShareController(cb);
    controller.cancel();
    expect(cb.onClose).toHaveBeenCalledTimes(1);
    expect(cb.onFeed).not.toHaveBeenCalled();
    expect(cb.onStory).not.toHaveBeenCalled();
    expect(cb.onPrivate).not.toHaveBeenCalled();
  });

  test('failure stays open, exposes an accessible message, and permits retry', async () => {
    const cb = callbacks();
    cb.onFeed.mockRejectedValueOnce(new Error('offline'));
    const controller = createAchievementShareController(cb);
    controller.select('feed');
    await controller.confirm();
    expect(controller.getState().error).toBe('Could not share your achievement. Please try again.');
    expect(cb.onClose).not.toHaveBeenCalled();
    await controller.confirm();
    expect(cb.onFeed).toHaveBeenCalledTimes(2);
    expect(cb.onClose).toHaveBeenCalledTimes(1);
  });

  test('mutex prevents double submit and destination switching while working', async () => {
    const pending = deferred();
    const cb = callbacks();
    cb.onFeed.mockReturnValue(pending.promise);
    const controller = createAchievementShareController(cb);
    controller.select('feed');
    const first = controller.confirm();
    const second = controller.confirm();
    controller.select('story');
    expect(cb.onFeed).toHaveBeenCalledTimes(1);
    expect(controller.getState().decision.destination).toBe('feed');
    pending.resolve();
    await Promise.all([first, second]);
    expect(cb.onClose).toHaveBeenCalledTimes(1);
  });

  test('reset invalidates stale completion and clears selection and error', async () => {
    const pending = deferred();
    const cb = callbacks();
    cb.onStory.mockReturnValueOnce(pending.promise);
    const controller = createAchievementShareController(cb);
    controller.select('story');
    const oldSubmit = controller.confirm();
    controller.reset();
    pending.resolve();
    await oldSubmit;
    expect(cb.onClose).not.toHaveBeenCalled();
    expect(controller.getState()).toEqual({
      decision: { destination: null, confirmed: false },
      error: null,
      working: false,
    });
  });

  test('dispose prevents stale completion from closing', async () => {
    const pending = deferred();
    const cb = callbacks();
    cb.onFeed.mockReturnValue(pending.promise);
    const controller = createAchievementShareController(cb);
    controller.select('feed');
    const submit = controller.confirm();
    controller.dispose();
    pending.resolve();
    await submit;
    expect(cb.onClose).not.toHaveBeenCalled();
  });

  test('success is terminal until reset', async () => {
    const cb = callbacks();
    const controller = createAchievementShareController(cb);
    controller.select('feed');
    await controller.confirm();

    controller.select('story');
    await controller.confirm();
    await controller.keepPrivate();
    controller.cancel();

    expect(cb.onFeed).toHaveBeenCalledTimes(1);
    expect(cb.onStory).not.toHaveBeenCalled();
    expect(cb.onPrivate).not.toHaveBeenCalled();
    expect(cb.onClose).toHaveBeenCalledTimes(1);

    controller.reset();
    await controller.keepPrivate();
    expect(cb.onPrivate).toHaveBeenCalledTimes(1);
    expect(cb.onClose).toHaveBeenCalledTimes(2);
  });

  test('private success and cancel are terminal until reset', async () => {
    const privateCallbacks = callbacks();
    const privateController = createAchievementShareController(privateCallbacks);
    await privateController.keepPrivate();
    await privateController.keepPrivate();
    privateController.cancel();
    expect(privateCallbacks.onPrivate).toHaveBeenCalledTimes(1);
    expect(privateCallbacks.onClose).toHaveBeenCalledTimes(1);

    const cancelCallbacks = callbacks();
    const cancelController = createAchievementShareController(cancelCallbacks);
    cancelController.cancel();
    await cancelController.keepPrivate();
    expect(cancelCallbacks.onPrivate).not.toHaveBeenCalled();
    expect(cancelCallbacks.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('AchievementSharePrompt lifecycle', () => {
  test('mounting invokes no destination callback', () => {
    const cb = callbacks();
    createAchievementSharePromptLifecycle(cb);
    expect(cb.onFeed).not.toHaveBeenCalled();
    expect(cb.onStory).not.toHaveBeenCalled();
    expect(cb.onPrivate).not.toHaveBeenCalled();
    expect(cb.onClose).not.toHaveBeenCalled();
  });

  test('callback rerender keeps controller stable during a deferred submit', async () => {
    const pending = deferred();
    const first = callbacks();
    first.onFeed.mockReturnValue(pending.promise);
    const lifecycle = createAchievementSharePromptLifecycle(first);
    const controller = lifecycle.controller;
    controller.select('feed');
    const submit = controller.confirm();

    const rerendered = callbacks();
    lifecycle.updateCallbacks(rerendered);
    expect(lifecycle.controller).toBe(controller);
    pending.resolve();
    await submit;

    expect(first.onClose).not.toHaveBeenCalled();
    expect(rerendered.onClose).toHaveBeenCalledTimes(1);
  });

  test('visible and payload changes reset state and invalidate stale completion', async () => {
    const pending = deferred();
    const cb = callbacks();
    cb.onStory.mockReturnValue(pending.promise);
    const lifecycle = createAchievementSharePromptLifecycle(cb);
    lifecycle.syncPresentation({ visible: true, payloadKey: 'first' });
    lifecycle.controller.select('story');
    const submit = lifecycle.controller.confirm();

    lifecycle.syncPresentation({ visible: true, payloadKey: 'second' });
    expect(lifecycle.controller.getState().decision.destination).toBeNull();
    pending.resolve();
    await submit;
    expect(cb.onClose).not.toHaveBeenCalled();
  });
});
