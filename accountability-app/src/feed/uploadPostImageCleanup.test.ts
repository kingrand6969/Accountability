import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { deleteJourneyProgressImageForOperation, deletePostImageForOperation } from './uploadPostImage';
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

  test('Journey cleanup requires and deletes only its operation-scoped object', async () => {
    const journeyRef = `r2://post-images/${ownerId}/${operationId}/${sha256}.jpg`;
    jest.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { deleteUrl: 'https://r2.example/journey-delete', mediaRef: journeyRef }, error: null,
    } as never);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deleteJourneyProgressImageForOperation(journeyRef, sha256, operationId, ownerId))
      .resolves.toBe('deleted');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('r2-sign', { body: expect.objectContaining({
      action: 'delete', operationId, expectedOwnerId: ownerId, mediaRef: journeyRef, keyMode: 'operation',
    }) });
    await expect(deleteJourneyProgressImageForOperation(mediaRef, sha256, operationId, ownerId))
      .resolves.toBe('shared');
    fetchMock.mockRestore();
  });

  test('cancelling operation A cannot delete operation B with identical bytes', async () => {
    const operationB = '44444444-4444-4444-8444-444444444444';
    const refA = `r2://post-images/${ownerId}/${operationId}/${sha256}.jpg`;
    const refB = `r2://post-images/${ownerId}/${operationB}/${sha256}.jpg`;
    const objects = new Set([refA, refB]);
    jest.mocked(supabase.functions.invoke).mockImplementation(async (_name, options) => {
      const requested = (options?.body as { mediaRef: string }).mediaRef;
      return { data: { deleteUrl: `https://r2.example/delete/${requested === refA ? 'a' : 'b'}`, mediaRef: requested }, error: null } as never;
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('/a')) objects.delete(refA);
      if (String(url).endsWith('/b')) objects.delete(refB);
      return new Response(null, { status: 204 });
    });

    await expect(deleteJourneyProgressImageForOperation(refA, sha256, operationId, ownerId)).resolves.toBe('deleted');
    expect(objects).toEqual(new Set([refB]));
    expect(fetchMock).not.toHaveBeenCalledWith('https://r2.example/delete/b', expect.anything());
    fetchMock.mockRestore();
  });
});
