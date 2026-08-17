import { describe, expect, jest, test } from '@jest/globals';
import { createIdempotentStory } from './idempotentStory';

describe('createIdempotentStory', () => {
  test('refuses an account switch before upload or commit', async () => {
    const upload = jest.fn(async () => 'r2://story');
    const commit = jest.fn(async () => 'story-1');
    const owners = ['owner-a', 'owner-b'];

    await expect(createIdempotentStory({
      expectedOwnerId: 'owner-a', operationId: 'op-1', base64: 'abc', ext: 'jpg', caption: 'Run',
    }, {
      currentOwnerId: async () => owners.shift() ?? 'owner-b', upload, commit,
    })).rejects.toThrow('Account changed');

    expect(upload).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });

  test('reuses the operation after a lost commit response', async () => {
    const upload = jest.fn(async () => 'r2://stable-story');
    const committed = new Map<string, string>();
    let loseResponse = true;
    const commit = jest.fn(async ({ operationId }: { operationId: string }) => {
      const id = committed.get(operationId) ?? 'story-1';
      committed.set(operationId, id);
      if (loseResponse) {
        loseResponse = false;
        throw new Error('lost response');
      }
      return id;
    });
    const input = { expectedOwnerId: 'owner-a', operationId: 'op-1', base64: 'abc', ext: 'jpg', caption: 'Run' };
    const deps = { currentOwnerId: async () => 'owner-a', upload, commit };

    await expect(createIdempotentStory(input, deps)).rejects.toThrow('lost response');
    await expect(createIdempotentStory(input, deps)).resolves.toBe('story-1');
    expect(upload).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledTimes(2);
  });
});
