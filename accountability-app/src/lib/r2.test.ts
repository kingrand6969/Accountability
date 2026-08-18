import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { supabase } from './supabase';
import { uploadToR2WithDigest } from './r2';

jest.mock('./supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
  },
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: jest.fn(async () => Uint8Array.from({ length: 32 }, (_, index) => index).buffer),
}));

jest.mock('base64-arraybuffer', () => ({
  decode: jest.fn(() => new Uint8Array([1, 2, 3]).buffer),
}));

const operationId = '123e4567-e89b-42d3-a456-426614174000';
const sha256 = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, '0')).join('');
const invoke = supabase.functions.invoke as jest.MockedFunction<typeof supabase.functions.invoke>;

describe('immutable R2 uploads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invoke.mockResolvedValue({
      data: {
        uploadUrl: 'https://uploads.example/signed',
        mediaRef: `r2://post-images/member/${operationId}-${sha256}.jpg`,
      },
      error: null,
    } as never);
  });

  test('binds exact bytes and a one-time precondition to a deterministic upload', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;

    await expect(uploadToR2WithDigest('AQID', 'post', 'jpg', {
      operationId,
      expectedOwnerId: 'member-1',
    })).resolves.toEqual({
      mediaRef: `r2://post-images/member/${operationId}-${sha256}.jpg`,
      sha256,
    });

    expect(invoke).toHaveBeenCalledWith('r2-sign', {
      body: {
        kind: 'post',
        ext: 'jpg',
        bytes: 3,
        contentType: 'image/jpeg',
        sha256,
        operationId,
        expectedOwnerId: 'member-1',
      },
    });
    expect(global.fetch).toHaveBeenCalledWith('https://uploads.example/signed', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({
        'Content-Type': 'image/jpeg',
        'Content-Length': '3',
        'If-None-Match': '*',
        'x-amz-content-sha256': sha256,
      }),
    }));
  });

  test('safely reuses an immutable object only when its digest-addressed key already exists', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 412 })) as unknown as typeof fetch;

    await expect(uploadToR2WithDigest('AQID', 'post', 'jpg', { operationId })).resolves.toEqual({
      mediaRef: `r2://post-images/member/${operationId}-${sha256}.jpg`,
      sha256,
    });
  });

  test('rejects a legacy mutable operation key before uploading', async () => {
    invoke.mockResolvedValue({
      data: {
        uploadUrl: 'https://uploads.example/legacy',
        mediaRef: `r2://post-images/member/${operationId}.jpg`,
      },
      error: null,
    } as never);
    global.fetch = jest.fn(async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;

    await expect(uploadToR2WithDigest('AQID', 'post', 'jpg', { operationId }))
      .rejects.toThrow('Upload service is out of date.');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('does not reinterpret a precondition failure as success for a replaceable upload', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 412 })) as unknown as typeof fetch;

    await expect(uploadToR2WithDigest('AQID', 'avatar', 'jpg')).rejects.toThrow('Upload failed (412).');
  });
});
