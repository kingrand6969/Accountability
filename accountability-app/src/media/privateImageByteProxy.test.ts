import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  createPrivateImageByteProxyDownloader,
  createPrivateImageByteProxyRequest,
  isPrivateImageRef,
} from './privateImageByteProxy';

const PRIVATE_REF = 'r2://avatars/00000000-0000-4000-8000-000000000000/dog.jpg';

function jpegBytes(size = 12): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(size));
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
}

function byteResponse(
  bytes = jpegBytes(),
  type = 'image/jpeg',
  length = bytes.byteLength,
  transportType = 'application/octet-stream',
): Response {
  return new Response(bytes.buffer, {
    status: 200,
    headers: {
      'Content-Type': transportType,
      'Content-Length': String(length),
      'X-Private-Image-Type': type,
    },
  });
}

describe('private image byte proxy', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('recognizes only raw image-folder references', () => {
    expect(isPrivateImageRef(PRIVATE_REF)).toBe(true);
    expect(isPrivateImageRef('r2://covers/member/cover.webp')).toBe(true);
    expect(isPrivateImageRef('r2://post-images/member/post.png')).toBe(true);
    expect(isPrivateImageRef('r2://post-videos/member/post.mp4')).toBe(false);
    expect(isPrivateImageRef('r2://voice-encouragements/member/voice.m4a')).toBe(false);
    expect(isPrivateImageRef('https://media.example/dog.jpg')).toBe(false);
  });

  it('builds one authenticated Supabase-origin bytes request without signed-url authorization', async () => {
    const fetchBytes = jest.fn(async () => byteResponse());
    const getAccessToken = jest.fn(async () => 'session.jwt.secret');
    const request = createPrivateImageByteProxyRequest(
      fetchBytes,
      getAccessToken,
      'https://project.supabase.co',
      'public-anon-key',
    );
    const signal = new AbortController().signal;

    await request(PRIVATE_REF, signal);

    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchBytes).toHaveBeenCalledTimes(1);
    expect(fetchBytes).toHaveBeenCalledWith(
      'https://project.supabase.co/functions/v1/media-read',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer session.jwt.secret',
          apikey: 'public-anon-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: PRIVATE_REF, delivery: 'bytes' }),
        signal,
      },
    );
  });

  it('requests bytes once, validates MIME and magic, and writes the unique part', async () => {
    const bytes = jpegBytes();
    const request = jest.fn(async () => byteResponse(bytes));
    const write = jest.fn<(value: Uint8Array) => void>();
    const close = jest.fn<() => void>();
    const openPart = jest.fn(() => ({ write, close }));
    const download = createPrivateImageByteProxyDownloader(request, openPart);
    const controller = new AbortController();

    await download(PRIVATE_REF, 'file:///cache/private/opaque.part', 20 * 1024 * 1024, controller.signal);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(PRIVATE_REF, expect.any(AbortSignal));
    expect(write).toHaveBeenCalledTimes(1);
    expect(openPart).toHaveBeenCalledWith('file:///cache/private/opaque.part');
    expect(Array.from(write.mock.calls[0][0])).toEqual(Array.from(bytes));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing declared MIME', byteResponse(jpegBytes(), ''), false],
    ['wrong transport MIME', byteResponse(jpegBytes(), 'image/jpeg', 12, 'image/jpeg'), false],
    ['mismatched magic', byteResponse(jpegBytes(), 'image/png'), true],
    ['oversized declared length', byteResponse(jpegBytes(), 'image/jpeg', 21), false],
    ['oversized streamed body', byteResponse(jpegBytes(21), 'image/jpeg', 12), false],
  ])('rejects %s without publishing', async (_label, response, wrotePartial) => {
    const request = jest.fn(async () => response);
    const write = jest.fn<(value: Uint8Array) => void>();
    const openPart = jest.fn(() => ({ write, close: jest.fn() }));
    const download = createPrivateImageByteProxyDownloader(request, openPart);

    await expect(download(
      PRIVATE_REF,
      'file:///cache/private/opaque.part',
      20,
      new AbortController().signal,
    )).rejects.toThrow('Could not open this private image.');
    expect(request).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(wrotePartial ? 1 : 0);
  });

  it('aborts its only request after 15 seconds and never writes late bytes', async () => {
    jest.useFakeTimers();
    let requestSignal!: AbortSignal;
    const request = jest.fn((_ref: string, signal: AbortSignal) => {
      requestSignal = signal;
      return new Promise<Response>(() => undefined);
    });
    const write = jest.fn<(value: Uint8Array) => void>();
    const download = createPrivateImageByteProxyDownloader(
      request,
      jest.fn(() => ({ write, close: jest.fn() })),
    );
    const pending = download(
      PRIVATE_REF,
      'file:///cache/private/opaque.part',
      20,
      new AbortController().signal,
    );
    const rejection = expect(pending).rejects.toThrow('Could not open this private image.');

    await jest.advanceTimersByTimeAsync(15_000);

    await rejection;
    expect(request).toHaveBeenCalledTimes(1);
    expect(requestSignal.aborted).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });

  it('aborts and cancels the native response stream on validation failure', async () => {
    const cancel = jest.fn<() => void>();
    const body = new ReadableStream<Uint8Array>({
      pull() {
        // Leave the stream open so cancellation is observable.
      },
      cancel,
    });
    const response = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': '12',
        'X-Private-Image-Type': 'image/jpeg',
      },
    });
    let requestSignal!: AbortSignal;
    const request = jest.fn(async (_ref: string, signal: AbortSignal) => {
      requestSignal = signal;
      return response;
    });
    const openPart = jest.fn(() => ({ write: jest.fn(), close: jest.fn() }));
    const download = createPrivateImageByteProxyDownloader(request, openPart);

    await expect(download(
      PRIVATE_REF,
      'file:///cache/private/opaque.part',
      20,
      new AbortController().signal,
    )).rejects.toThrow('Could not open this private image.');

    expect(requestSignal.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(openPart).not.toHaveBeenCalled();
  });

  it('does not expose refs, paths, tokens, or raw transport errors', async () => {
    const secret = 'JWT.signature.secret';
    const request = jest.fn(async () => {
      throw new Error(`upstream ${secret} ${PRIVATE_REF} C:\\private\\opaque.part`);
    });
    const write = jest.fn<(value: Uint8Array) => void>();
    const download = createPrivateImageByteProxyDownloader(
      request,
      jest.fn(() => ({ write, close: jest.fn() })),
    );

    const error = await download(
      PRIVATE_REF,
      'file:///cache/private/opaque.part',
      20,
      new AbortController().signal,
    ).catch((reason: unknown) => reason);
    const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error as object));

    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(PRIVATE_REF);
    expect(serialized).not.toContain('opaque.part');
    expect(write).not.toHaveBeenCalled();
  });
});
