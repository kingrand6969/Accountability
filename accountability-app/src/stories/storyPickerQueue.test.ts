import { describe, expect, jest, test } from '@jest/globals';

import { createStoryPickerQueue, type StoryPickerHandle } from './storyPickerQueue';

async function flushMicrotasks() {
  await Promise.resolve();
}

describe('createStoryPickerQueue', () => {
  test('coalesces requests before attach and flushes exactly once asynchronously', async () => {
    const handle: StoryPickerHandle = { openPicker: jest.fn() };
    const queue = createStoryPickerQueue();

    queue.request();
    queue.request();
    queue.attach(handle);

    expect(handle.openPicker).not.toHaveBeenCalled();
    await flushMicrotasks();
    expect(handle.openPicker).toHaveBeenCalledTimes(1);
  });

  test('opens immediately when a handle is already mounted', () => {
    const handle: StoryPickerHandle = { openPicker: jest.fn() };
    const queue = createStoryPickerQueue();
    queue.attach(handle);

    queue.request();

    expect(handle.openPicker).toHaveBeenCalledTimes(1);
  });

  test('detach cancels a scheduled stale flush', async () => {
    const handle: StoryPickerHandle = { openPicker: jest.fn() };
    const queue = createStoryPickerQueue();
    queue.request();
    queue.attach(handle);
    queue.attach(null);

    await flushMicrotasks();
    expect(handle.openPicker).not.toHaveBeenCalled();
  });

  test('identity reset clears a pending request before a new handle attaches', async () => {
    const handle: StoryPickerHandle = { openPicker: jest.fn() };
    const queue = createStoryPickerQueue();
    queue.request();
    queue.reset();
    queue.attach(handle);

    await flushMicrotasks();
    expect(handle.openPicker).not.toHaveBeenCalled();
  });

  test('old-account cleanup cannot reset a new account queue that already attached', () => {
    const accountAQueue = createStoryPickerQueue();
    const accountBQueue = createStoryPickerQueue();
    const accountBHandle: StoryPickerHandle = { openPicker: jest.fn() };

    accountBQueue.attach(accountBHandle);
    accountAQueue.reset();
    accountBQueue.request();

    expect(accountBHandle.openPicker).toHaveBeenCalledTimes(1);
  });
});
