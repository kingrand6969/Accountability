import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { deletePostImageForOperation } from './uploadPostImage';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    functions: { invoke: jest.fn() },
    storage: { from: jest.fn() },
  },
}));
jest.mock('../media/uploadTelemetry', () => ({ recordUploadEvent: jest.fn() }));

const ownerId = '11111111-1111-4111-8111-111111111111';
const operationId = '22222222-2222-4222-8222-222222222222';
const sha256 = 'a'.repeat(64);
const mediaRef = `r2://post-images/${ownerId}/${sha256}.jpg`;

describe('operation-bound post image cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { id: ownerId } }, error: null } as never);
  });

  test('deletes only the exact owner, operation, digest, and signer-confirmed R2 reference', async () => {
    jest.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { deleteUrl: 'https://r2.example/signed-delete', mediaRef }, error: null,
    } as never);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deletePostImageForOperation(mediaRef, sha256, operationId, ownerId)).resolves.toBe('deleted');

    expect(supabase.functions.invoke).toHaveBeenCalledWith('r2-sign', { body: {
      action: 'delete', kind: 'post', ext: 'jpg', contentType: 'image/jpeg',
      sha256, operationId, expectedOwnerId: ownerId, mediaRef,
    } });
    expect(fetchMock).toHaveBeenCalledWith('https://r2.example/signed-delete', { method: 'DELETE' });
    fetchMock.mockRestore();
  });

  test('rejects a foreign or digest-mismatched reference before requesting deletion', async () => {
    await expect(deletePostImageForOperation(
      `r2://post-images/${ownerId}/${'b'.repeat(64)}.jpg`, sha256, operationId, ownerId,
    )).rejects.toThrow(/reference|image/i);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  test('accepts a verified same-owner shared digest without deleting the other operation object', async () => {
    jest.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { shared: true, mediaRef }, error: null,
    } as never);
    const fetchMock = jest.spyOn(globalThis, 'fetch');

    await expect(deletePostImageForOperation(mediaRef, sha256, operationId, ownerId)).resolves.toBe('shared');
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
