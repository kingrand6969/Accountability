import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TextDecoder as NodeTextDecoder } from 'node:util';
import { runInNewContext } from 'node:vm';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, jest, test } from '@jest/globals';
import * as ts from 'typescript';

const operationId = '123e4567-e89b-42d3-a456-426614174000';
const memberId = '00000000-0000-4000-8000-000000000001';
const sharePngBytes = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
));
const requestBodyMaxBytes = 4 * Math.ceil((4 * 1024 * 1024) / 3) + 4096;

type R2Call = { url: string; init: RequestInit };
type R2Responder = Response | ((callIndex: number, init: RequestInit) => Promise<Response>);
type Harness = {
  handler: (request: Request) => Promise<Response>;
  insert: jest.Mock;
  r2Calls: R2Call[];
  sign: jest.Mock;
};

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function withIhdrField(offset: number, value: number): Uint8Array {
  const bytes = Buffer.from(sharePngBytes);
  bytes[offset] = value;
  bytes.writeUInt32BE(crc32(bytes, 12, 29), 29);
  return new Uint8Array(bytes);
}

function withNonEmptyIend(): Uint8Array {
  const bytes = Buffer.alloc(69);
  Buffer.from(sharePngBytes.slice(0, 56)).copy(bytes);
  bytes.writeUInt32BE(1, 56);
  bytes.write('IEND', 60, 'ascii');
  bytes[64] = 0;
  bytes.writeUInt32BE(crc32(bytes, 60, 65), 65);
  return new Uint8Array(bytes);
}

function loadHandler(r2Response: R2Responder = new Response(null, { status: 200 })): Harness {
  const sourcePath = resolve(process.cwd(), 'supabase/functions/r2-sign/index.ts');
  const source = readFileSync(sourcePath, 'utf8')
    .replace(/^import \{ createClient \}.*;\r?\n/m, 'const createClient = globalThis.__createClient;\n')
    .replace(/^import \{ AwsClient \}.*;\r?\n/m, 'const AwsClient = globalThis.__AwsClient;\n')
    .replace(
      /^import \{ digestObjectFilename, operationDigestObjectFilename \}.*;\r?\n/m,
      'const { digestObjectFilename, operationDigestObjectFilename } = globalThis.__objectKeys;\n',
    )
    .replace('Deno.serve(async (req) => {', 'globalThis.__handler = async (req) => {')
    .replace(/\r?\n\}\);\s*$/, '\n};\n')
    .replaceAll('Deno.env.get', 'globalThis.__envGet');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const insert = jest.fn(async () => ({ error: null }));
  const r2Calls: R2Call[] = [];
  const sign = jest.fn(async () => ({ url: 'https://private-r2.example/signed' }));
  class AwsClientMock {
    sign = sign;

    async fetch(url: string, init: RequestInit): Promise<Response> {
      r2Calls.push({ url, init });
      return typeof r2Response === 'function'
        ? r2Response(r2Calls.length - 1, init)
        : r2Response;
    }
  }
  const sandbox: Record<string, unknown> = {
    Request,
    Response,
    Headers,
    TextDecoder: NodeTextDecoder,
    URL,
    console,
    atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value: string) => Buffer.from(value, 'binary').toString('base64'),
    crypto: { subtle: webcrypto.subtle, randomUUID: () => operationId },
    AbortController,
    setTimeout,
    clearTimeout,
    __envGet: (name: string) => ({
      SUPABASE_URL: 'https://supabase.example',
      SUPABASE_ANON_KEY: 'anon-key',
      R2_ACCOUNT_ID: 'account-id',
      R2_ACCESS_KEY_ID: 'access-key',
      R2_SECRET_ACCESS_KEY: 'secret-key',
      R2_BUCKET: 'bucket',
    }[name]),
    __createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: memberId } }, error: null }) },
      from: () => ({ insert }),
    }),
    __AwsClient: AwsClientMock,
    __objectKeys: {
      digestObjectFilename: (digest: string, ext: string) => `${digest}.${ext}`,
      operationDigestObjectFilename: (id: string, digest: string, ext: string) => `${id}/${digest}.${ext}`,
    },
  };
  sandbox.globalThis = sandbox;
  runInNewContext(compiled, sandbox, { filename: sourcePath });

  return {
    handler: sandbox.__handler as Harness['handler'],
    insert,
    r2Calls,
    sign,
  };
}

function directUploadRequest(overrides: Record<string, unknown> = {}): Request {
  const bytes = sharePngBytes;
  return new Request('https://supabase.example/functions/v1/r2-sign', {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'direct-upload',
      kind: 'share',
      ext: 'png',
      bytes: bytes.byteLength,
      contentType: 'image/png',
      sha256: sha256(bytes),
      operationId,
      base64: Buffer.from(bytes).toString('base64'),
      ...overrides,
    }),
  });
}

describe('R2 direct share upload', () => {
  test('rejects a decoded-size mismatch before storing', async () => {
    const harness = loadHandler();

    const response = await harness.handler(directUploadRequest({ bytes: 2 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'upload payload mismatch' });
    expect(harness.r2Calls).toHaveLength(0);
    expect(harness.sign).not.toHaveBeenCalled();
  });

  test('rejects a digest mismatch before storing', async () => {
    const harness = loadHandler();

    const response = await harness.handler(directUploadRequest({ sha256: '0'.repeat(64) }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'upload payload mismatch' });
    expect(harness.insert).toHaveBeenCalledTimes(1);
    expect(harness.r2Calls).toHaveLength(0);
    expect(harness.sign).not.toHaveBeenCalled();
  });

  test('rejects non-canonical base64 before rate-limiting or decoding', async () => {
    const harness = loadHandler();

    const response = await harness.handler(directUploadRequest({ base64: 'AQ?D' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid upload payload' });
    expect(harness.insert).not.toHaveBeenCalled();
    expect(harness.r2Calls).toHaveLength(0);
  });

  test('rejects an encoded share payload that can exceed the decoded limit', async () => {
    const harness = loadHandler();
    const oversizedBase64 = 'AAAA'.repeat(Math.ceil((4 * 1024 * 1024) / 3) + 1);

    const response = await harness.handler(directUploadRequest({ base64: oversizedBase64 }));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'file too large' });
    expect(harness.insert).not.toHaveBeenCalled();
    expect(harness.r2Calls).toHaveLength(0);
  });

  test.each([200, 412])('stores a verified share server-side and treats R2 %s as success', async (status) => {
    const bytes = sharePngBytes;
    const digest = sha256(bytes);
    const harness = loadHandler(new Response(null, { status }));

    const response = await harness.handler(directUploadRequest({
      bytes: bytes.byteLength,
      sha256: digest,
      base64: Buffer.from(bytes).toString('base64'),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      uploaded: true,
      mediaRef: `r2://share-cards/${memberId}/${digest}.png`,
    });
    expect(harness.insert).toHaveBeenCalledTimes(1);
    expect(harness.sign).not.toHaveBeenCalled();
    expect(harness.r2Calls).toHaveLength(1);
    expect(harness.r2Calls[0]?.url).toBe(
      `https://account-id.r2.cloudflarestorage.com/bucket/share-cards/${memberId}/${digest}.png`,
    );
    expect(harness.r2Calls[0]?.init).toEqual(expect.objectContaining({
      method: 'PUT',
      headers: {
        'content-type': 'image/png',
        'x-amz-content-sha256': digest,
        'if-none-match': '*',
        'x-amz-meta-operation-id': operationId,
      },
      aws: { allHeaders: true },
    }));
    expect(Array.from(harness.r2Calls[0]?.init.body as Uint8Array)).toEqual(Array.from(bytes));
  });

  test('rejects a non-identity content encoding before reading the body', async () => {
    const harness = loadHandler();
    const request = new Request('https://supabase.example/functions/v1/r2-sign', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Encoding': 'gzip' },
      body: '{}',
    });

    const response = await harness.handler(request);

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: 'unsupported content encoding' });
    expect(harness.insert).not.toHaveBeenCalled();
  });

  test('rejects an oversized declared request before reading its body', async () => {
    const harness = loadHandler();
    const request = new Request('https://supabase.example/functions/v1/r2-sign', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Length': String(requestBodyMaxBytes + 1),
      },
      body: '{}',
    });

    const response = await harness.handler(request);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'request too large' });
    expect(harness.insert).not.toHaveBeenCalled();
  });

  test('stops a chunked request once its cumulative body exceeds the cap', async () => {
    const harness = loadHandler();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(requestBodyMaxBytes));
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    });
    const request = new Request('https://supabase.example/functions/v1/r2-sign', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const response = await harness.handler(request);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'request too large' });
    expect(harness.insert).not.toHaveBeenCalled();
  });

  test('rejects base64 with non-canonical padding bits', async () => {
    const harness = loadHandler();
    const bytes = sharePngBytes;
    const canonical = Buffer.from(bytes).toString('base64');
    const nonCanonical = `${canonical.slice(0, -2)}J=`;

    const response = await harness.handler(directUploadRequest({
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      base64: nonCanonical,
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid upload payload' });
    expect(harness.r2Calls).toHaveLength(0);
  });

  test.each([
    { name: 'wrong signature', bytes: new Uint8Array(sharePngBytes).fill(0, 0, 8) },
    { name: 'excessive dimensions', bytes: withIhdrField(18, 32) },
  ])('rejects a PNG with $name', async ({ bytes }) => {
    const harness = loadHandler();

    const response = await harness.handler(directUploadRequest({
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      base64: Buffer.from(bytes).toString('base64'),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid upload payload' });
    expect(harness.r2Calls).toHaveLength(0);
  });

  test('rejects a PNG whose IDAT CRC does not match its bytes', async () => {
    const harness = loadHandler();
    const bytes = new Uint8Array(sharePngBytes);
    bytes[41] ^= 1;

    const response = await harness.handler(directUploadRequest({
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      base64: Buffer.from(bytes).toString('base64'),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid upload payload' });
    expect(harness.r2Calls).toHaveLength(0);
  });

  test.each([
    { name: 'is truncated', bytes: sharePngBytes.slice(0, -1) },
    { name: 'has trailing bytes', bytes: new Uint8Array([...sharePngBytes, 0]) },
    { name: 'declares chunk data beyond EOF', bytes: new Uint8Array([...sharePngBytes.slice(0, 33), 0x7f, 0xff, 0xff, 0xff, ...sharePngBytes.slice(37)]) },
    { name: 'has no IDAT', bytes: new Uint8Array([...sharePngBytes.slice(0, 33), ...sharePngBytes.slice(56)]) },
    { name: 'has a non-empty IEND', bytes: withNonEmptyIend() },
  ])('rejects a PNG that $name', async ({ bytes }) => {
    const harness = loadHandler();

    const response = await harness.handler(directUploadRequest({
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      base64: Buffer.from(bytes).toString('base64'),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid upload payload' });
    expect(harness.r2Calls).toHaveLength(0);
  });

  test.each([
    { name: 'bit depth', bytes: withIhdrField(24, 3) },
    { name: 'color type', bytes: withIhdrField(25, 1) },
    { name: 'compression method', bytes: withIhdrField(26, 1) },
    { name: 'filter method', bytes: withIhdrField(27, 1) },
    { name: 'interlace method', bytes: withIhdrField(28, 2) },
  ])('rejects an invalid IHDR $name even when its CRC is valid', async ({ bytes }) => {
    const harness = loadHandler();

    const response = await harness.handler(directUploadRequest({
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      base64: Buffer.from(bytes).toString('base64'),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid upload payload' });
    expect(harness.r2Calls).toHaveLength(0);
  });

  test.each([403, 409])('sanitizes an R2 %s failure without exposing provider details', async (status) => {
    const harness = loadHandler(new Response('private provider details', { status }));

    const response = await harness.handler(directUploadRequest());
    const responseText = await response.text();

    expect(response.status).toBe(502);
    expect(JSON.parse(responseText)).toEqual({ error: 'media upload failed' });
    expect(responseText).not.toContain('private provider details');
    expect(harness.r2Calls).toHaveLength(status === 409 ? 3 : 1);
  });

  test('aborts a stalled R2 PUT after the bounded per-attempt timeout', async () => {
    jest.useFakeTimers();
    let markFetchStarted: (() => void) | undefined;
    const fetchStarted = new Promise<void>((resolve) => { markFetchStarted = resolve; });
    const harness = loadHandler(async (_callIndex, init) => {
      markFetchStarted?.();
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('private timeout detail')));
      });
    });

    try {
      const pendingResponse = harness.handler(directUploadRequest());
      await fetchStarted;
      await jest.advanceTimersByTimeAsync(9_999);
      expect(harness.r2Calls).toHaveLength(1);

      await jest.advanceTimersByTimeAsync(1);
      const response = await pendingResponse;

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'media upload failed' });
      expect(harness.r2Calls[0]?.init.signal?.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test('waits a small bounded interval before retrying an R2 409', async () => {
    jest.useFakeTimers();
    let markFirstCall: (() => void) | undefined;
    const firstCall = new Promise<void>((resolve) => { markFirstCall = resolve; });
    const harness = loadHandler(async (callIndex) => {
      if (callIndex === 0) {
        markFirstCall?.();
        return new Response(null, { status: 409 });
      }
      return new Response(null, { status: 200 });
    });

    try {
      const pendingResponse = harness.handler(directUploadRequest());
      await firstCall;
      await Promise.resolve();
      expect(harness.r2Calls).toHaveLength(1);

      await jest.advanceTimersByTimeAsync(74);
      expect(harness.r2Calls).toHaveLength(1);

      await jest.advanceTimersByTimeAsync(1);
      const response = await pendingResponse;
      expect(response.status).toBe(200);
      expect(harness.r2Calls).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test('keeps exact Content-Length in the non-share presigned contract', async () => {
    const harness = loadHandler();
    const response = await harness.handler(directUploadRequest({
      action: undefined,
      base64: undefined,
      kind: 'post',
      ext: 'jpg',
      contentType: 'image/jpeg',
    }));

    expect(response.status).toBe(200);
    expect(harness.r2Calls).toHaveLength(0);
    expect(harness.sign).toHaveBeenCalledTimes(1);
    const signedRequest = harness.sign.mock.calls[0]?.[0] as Request;
    expect(signedRequest.headers.get('content-length')).toBe(String(sharePngBytes.byteLength));
    expect(signedRequest.headers.get('content-type')).toBe('image/jpeg');
    expect(signedRequest.headers.get('x-amz-content-sha256')).toBe(sha256(sharePngBytes));
  });

  test.each(['__proto__', 'constructor'])('rejects inherited kind key %s', async (kind) => {
    const harness = loadHandler();

    const response = await harness.handler(directUploadRequest({
      action: undefined,
      base64: undefined,
      kind,
      operationId: undefined,
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid kind' });
    expect(harness.insert).not.toHaveBeenCalled();
    expect(harness.sign).not.toHaveBeenCalled();
    expect(harness.r2Calls).toHaveLength(0);
  });
});
