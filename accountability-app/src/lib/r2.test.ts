import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import * as Crypto from 'expo-crypto';

import { supabase } from './supabase';
import { isExpectedDigestMediaRef, isExpectedOperationDigestMediaRef, uploadToR2WithDigest } from './r2';

jest.mock('./supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
  },
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: jest.fn(async (_algorithm: string, bytes: ArrayBuffer | ArrayBufferView) => {
    if (!ArrayBuffer.isView(bytes)) {
      throw new Error("[digest] Cannot convert '[object ArrayBuffer]' to a Kotlin type. no ArrayBuffer attached");
    }
    return Uint8Array.from({ length: 32 }, (_, index) => index).buffer;
  }),
}));

jest.mock('base64-arraybuffer', () => ({
  decode: jest.fn(() => new Uint8Array([1, 2, 3]).buffer),
}));

const operationId = '123e4567-e89b-42d3-a456-426614174000';
const memberId = '00000000-0000-4000-8000-000000000001';
const sha256 = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, '0')).join('');
const invoke = supabase.functions.invoke as jest.MockedFunction<typeof supabase.functions.invoke>;
const digest = Crypto.digest as jest.MockedFunction<typeof Crypto.digest>;

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
        'x-amz-meta-operation-id': operationId,
      }),
    }));
  });

  test('digests typed share-card bytes before signing and preserves the final PUT', async () => {
    const mediaRef = `r2://share-cards/${memberId}/${sha256}.png`;
    invoke.mockResolvedValue({
      data: { uploadUrl: 'https://uploads.example/share-card', mediaRef },
      error: null,
    } as never);
    global.fetch = jest.fn(async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;

    await expect(uploadToR2WithDigest('AQID', 'share', 'png', { operationId })).resolves.toEqual({
      mediaRef,
      sha256,
    });

    expect(digest).toHaveBeenCalledWith(
      Crypto.CryptoDigestAlgorithm.SHA256,
      expect.any(Uint8Array),
    );
    const digestBytes = digest.mock.calls[0]?.[1];
    expect(Array.from(digestBytes as Uint8Array)).toEqual([1, 2, 3]);
    expect(digest.mock.invocationCallOrder[0]).toBeLessThan(invoke.mock.invocationCallOrder[0] ?? 0);
    expect(invoke).toHaveBeenCalledWith('r2-sign', {
      body: {
        kind: 'share',
        ext: 'png',
        bytes: 3,
        contentType: 'image/png',
        sha256,
        operationId,
      },
    });
    expect(global.fetch).toHaveBeenCalledWith('https://uploads.example/share-card', expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({
        'Content-Type': 'image/png',
        'Content-Length': '3',
        'If-None-Match': '*',
        'x-amz-content-sha256': sha256,
        'x-amz-meta-operation-id': operationId,
      }),
      body: expect.any(ArrayBuffer),
    }));
    const uploadBody = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[0]?.[1]?.body;
    expect(Array.from(new Uint8Array(uploadBody as ArrayBuffer))).toEqual([1, 2, 3]);
  });

  test('surfaces only sanitized provider diagnostics when a share-card PUT is forbidden', async () => {
    const mediaRef = `r2://share-cards/${memberId}/${sha256}.png`;
    const uploadUrl = 'https://uploads.example/share-card'
      + '?X-Amz-Credential=AKIA_PRIVATE%2F20260827%2Fauto%2Fs3%2Faws4_request'
      + '&X-Amz-Signature=private-signature'
      + '&X-Amz-SignedHeaders=content-type%3Bhost%3Bif-none-match%3Bx-amz-content-sha256%3Bx-amz-meta-operation-id';
    const responseBody = [
      '<Error>',
      '<Code>SignatureDoesNotMatch</Code>',
      '<Message>private user content and Bearer private-auth-token must never be logged</Message>',
      '<RequestId>private-body-request-id</RequestId>',
      '<HostId>private-body-host-id</HostId>',
      '<Details>private-body-details</Details>',
      '</Error>',
    ].join('');
    invoke.mockResolvedValue({ data: { uploadUrl, mediaRef }, error: null } as never);
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 403,
      text: jest.fn(async () => responseBody),
      headers: {
        get: jest.fn((name: string) => ({
          'x-amz-request-id': 'safe-request-id_123',
          'cf-ray': 'safe-ray.456-SYD',
        }[name.toLowerCase()] ?? null)),
      },
    })) as unknown as typeof fetch;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(uploadToR2WithDigest('AQID', 'share', 'png', { operationId }))
      .rejects.toThrow('Upload failed (403: SignatureDoesNotMatch).');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('R2 upload failed', {
      status: 403,
      byteLength: 3,
      kind: 'share',
      keyClass: 'digest',
      operationIdPresent: true,
      signedHeaders: [
        'content-type',
        'host',
        'if-none-match',
        'x-amz-content-sha256',
        'x-amz-meta-operation-id',
      ],
      providerCode: 'SignatureDoesNotMatch',
      requestId: 'safe-request-id_123',
      cfRay: 'safe-ray.456-SYD',
    });
    const serializedWarning = JSON.stringify(warn.mock.calls);
    expect(serializedWarning).not.toContain(uploadUrl);
    expect(serializedWarning).not.toContain('private-signature');
    expect(serializedWarning).not.toContain('AKIA_PRIVATE');
    expect(serializedWarning).not.toContain(mediaRef);
    expect(serializedWarning).not.toContain('<Message>');
    expect(serializedWarning).not.toContain(responseBody);
    expect(serializedWarning).not.toContain('private user content');
    expect(serializedWarning).not.toContain('AQID');
    expect(serializedWarning).not.toContain('private-auth-token');
    expect(serializedWarning).not.toContain('private-body-request-id');
    expect(serializedWarning).not.toContain('private-body-host-id');
    expect(serializedWarning).not.toContain('private-body-details');
  });

  test.each([
    {
      caseName: 'the response has no Code element',
      responseBody: '<Error><Message>private-missing-code</Message><Details>private-missing-detail</Details></Error>',
      privateDetail: 'private-missing-detail',
    },
    {
      caseName: 'the Code contains unsafe characters',
      responseBody: '<Error><Code>Signature Does Not Match!</Code><Details>private-unsafe-detail</Details></Error>',
      privateDetail: 'private-unsafe-detail',
    },
    {
      caseName: 'the Code appears after the 4096-character analysis limit',
      responseBody: `${'x'.repeat(4096)}<Code>SignatureDoesNotMatch</Code><Details>private-late-detail</Details>`,
      privateDetail: 'private-late-detail',
    },
  ])('keeps the user-facing R2 error status-only when $caseName', async ({ responseBody, privateDetail }) => {
    const mediaRef = `r2://share-cards/${memberId}/${sha256}.png`;
    invoke.mockResolvedValue({
      data: {
        uploadUrl: 'https://uploads.example/share-card?X-Amz-Signature=private-signature',
        mediaRef,
      },
      error: null,
    } as never);
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 403,
      text: jest.fn(async () => responseBody),
      headers: { get: jest.fn(() => null) },
    })) as unknown as typeof fetch;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(uploadToR2WithDigest('AQID', 'share', 'png', { operationId }))
      .rejects.toMatchObject({ message: 'Upload failed (403).' });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('R2 upload failed', expect.objectContaining({
      status: 403,
      providerCode: 'unknown',
    }));
    const serializedWarning = JSON.stringify(warn.mock.calls);
    expect(serializedWarning).not.toContain(responseBody);
    expect(serializedWarning).not.toContain(privateDetail);
    expect(serializedWarning).not.toContain(mediaRef);
    expect(serializedWarning).not.toContain('private-signature');
  });

  test('safely reuses an immutable object only when its digest-addressed key already exists', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 412 })) as unknown as typeof fetch;

    await expect(uploadToR2WithDigest('AQID', 'post', 'jpg', { operationId })).resolves.toEqual({
      mediaRef: `r2://post-images/${memberId}/${sha256}.jpg`,
      sha256,
    });
  });

  test('uses an exact operation-scoped object for Journey derivatives and safely accepts same-operation 412', async () => {
    const operationRef = `r2://post-images/${memberId}/${operationId}/${sha256}.jpg`;
    invoke.mockResolvedValue({
      data: { uploadUrl: 'https://uploads.example/journey', mediaRef: operationRef },
      error: null,
    } as never);
    global.fetch = jest.fn(async () => ({ ok: false, status: 412 })) as unknown as typeof fetch;

    await expect(uploadToR2WithDigest('AQID', 'post', 'jpg', {
      operationId,
      expectedOwnerId: memberId,
      keyMode: 'operation',
    })).resolves.toEqual({ mediaRef: operationRef, sha256 });
    expect(invoke).toHaveBeenCalledWith('r2-sign', { body: expect.objectContaining({
      operationId,
      expectedOwnerId: memberId,
      keyMode: 'operation',
    }) });
    expect(isExpectedOperationDigestMediaRef(operationRef, 'post', operationId, sha256, 'image/jpeg')).toBe(true);
  });

  test('rejects another operation object even when owner and digest match', async () => {
    const otherOperation = '223e4567-e89b-42d3-a456-426614174000';
    const otherRef = `r2://post-images/${memberId}/${otherOperation}/${sha256}.jpg`;
    invoke.mockResolvedValue({ data: { uploadUrl: 'https://uploads.example/other', mediaRef: otherRef }, error: null } as never);
    global.fetch = jest.fn(async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;

    await expect(uploadToR2WithDigest('AQID', 'post', 'jpg', {
      operationId,
      keyMode: 'operation',
    })).rejects.toThrow('Upload service is out of date.');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('rejects an operation object signed into another owner namespace', async () => {
    const foreignOwner = '00000000-0000-4000-8000-000000000099';
    invoke.mockResolvedValue({
      data: {
        uploadUrl: 'https://uploads.example/foreign',
        mediaRef: `r2://post-images/${foreignOwner}/${operationId}/${sha256}.jpg`,
      },
      error: null,
    } as never);
    global.fetch = jest.fn(async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;

    await expect(uploadToR2WithDigest('AQID', 'post', 'jpg', {
      operationId,
      expectedOwnerId: memberId,
      keyMode: 'operation',
    })).rejects.toThrow('Upload service is out of date.');
    expect(global.fetch).not.toHaveBeenCalled();
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
    const responses = [
      { ok: false, status: 409 },
      { ok: true, status: 200 },
    ];
    global.fetch = jest.fn(async () => responses.shift()!) as unknown as typeof fetch;

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
    expect(invoke.mock.calls.every((call) => {
      const body = call[1]?.body as { operationId?: string } | undefined;
      return body?.operationId === operationId;
    })).toBe(true);
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
