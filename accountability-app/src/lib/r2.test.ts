import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { supabase } from './supabase';
import { isExpectedDigestMediaRef, uploadToR2WithDigest } from './r2';

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
const memberId = '00000000-0000-4000-8000-000000000001';
const sha256 = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, '0')).join('');
const invoke = supabase.functions.invoke as jest.MockedFunction<typeof supabase.functions.invoke>;

describe('immutable R2 uploads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invoke.mockResolvedValue({
      data: {
        uploadUrl: 'https://uploads.example/signed',
        mediaRef: `r2://post-images/${memberId}/${sha256}.jpg`,
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
      mediaRef: `r2://post-images/${memberId}/${sha256}.jpg`,
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
      mediaRef: `r2://post-images/${memberId}/${sha256}.jpg`,
      sha256,
    });
  });

  test('re-signs and retries a conditional conflict instead of claiming an upload succeeded', async () => {
    invoke
      .mockResolvedValueOnce({
        data: {
          uploadUrl: 'https://uploads.example/first',
          mediaRef: `r2://post-images/${memberId}/${sha256}.jpg`,
        },
        error: null,
      } as never)
      .mockResolvedValueOnce({
        data: {
          uploadUrl: 'https://uploads.example/retry',
          mediaRef: `r2://post-images/${memberId}/${sha256}.jpg`,
        },
        error: null,
      } as never);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409 })
      .mockResolvedValueOnce({ ok: true, status: 200 }) as unknown as typeof fetch;

    await expect(uploadToR2WithDigest('AQID', 'post', 'jpg', { operationId })).resolves.toEqual({
      mediaRef: `r2://post-images/${memberId}/${sha256}.jpg`,
      sha256,
    });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke.mock.calls[1]?.[1]).toEqual(invoke.mock.calls[0]?.[1]);
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://uploads.example/retry',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ 'If-None-Match': '*' }),
      }),
    );
  });

  test('fails after bounded conditional-conflict retries and never reports a missing object', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 409 })) as unknown as typeof fetch;

    await expect(uploadToR2WithDigest('AQID', 'post', 'jpg', { operationId }))
      .rejects.toThrow('Upload failed (409).');

    expect(invoke).toHaveBeenCalledTimes(3);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(invoke.mock.calls.every((call) => call[1]?.body?.operationId === operationId)).toBe(true);
  });

  test('does not retry a conflict for a replaceable mutable upload', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 409 })) as unknown as typeof fetch;

    await expect(uploadToR2WithDigest('AQID', 'avatar', 'jpg')).rejects.toThrow(
      'Upload failed (409).',
    );
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('rejects a legacy mutable operation key before uploading', async () => {
    invoke.mockResolvedValue({
      data: {
        uploadUrl: 'https://uploads.example/legacy',
        mediaRef: `r2://post-images/${memberId}/${operationId}.jpg`,
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

  const exactDigestRefs: [
    'post' | 'video' | 'voice' | 'share',
    string,
    string,
  ][] = [
    ['post', 'image/jpeg', `r2://post-images/${memberId}/${sha256}.jpg`],
    ['video', 'video/webm', `r2://post-videos/${memberId}/${sha256}.webm`],
    ['voice', 'audio/webm', `r2://voice-encouragements/${memberId}/${sha256}.webm`],
    ['share', 'image/png', `r2://share-cards/${memberId}/${sha256}.png`],
  ];

  test.each(exactDigestRefs)('accepts only the exact digest-addressed %s reference', (kind, contentType, mediaRef) => {
    expect(isExpectedDigestMediaRef(mediaRef, kind, sha256, contentType)).toBe(true);
    expect(isExpectedDigestMediaRef(mediaRef.replace(sha256, 'f'.repeat(64)), kind, sha256, contentType)).toBe(false);
    expect(isExpectedDigestMediaRef(mediaRef.replace(`/${sha256}.`, `/prefix-${sha256}.`), kind, sha256, contentType)).toBe(false);
  });
});
