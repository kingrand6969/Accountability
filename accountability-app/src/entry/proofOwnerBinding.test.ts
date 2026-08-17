import { describe, expect, test } from '@jest/globals';
import { expectedProofOwner } from './proofActions';

describe('expectedProofOwner', () => {
  test('keeps the immutable preflight owner when the live owner switches', () => {
    const token = { ownerId: 'owner-a', generation: 1, action: 'share-external' as const, nonce: 1 };
    let liveOwner = 'owner-a';
    liveOwner = 'owner-b';
    expect(liveOwner).toBe('owner-b');
    expect(expectedProofOwner(token)).toBe('owner-a');
  });

  test('rejects a token without a preflight owner', () => {
    expect(() => expectedProofOwner({ ownerId: null, generation: 1, action: 'share-external', nonce: 1 }))
      .toThrow('Not signed in');
  });
});
