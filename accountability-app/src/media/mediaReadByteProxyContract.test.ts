import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';

const source = readFileSync(
  resolve(process.cwd(), 'supabase/functions/media-read/index.ts'),
  'utf8',
);

type BoundedBodyReader = (
  body: {
    getReader(): {
      read(): Promise<{ done: boolean; value?: Uint8Array }>;
      cancel(): Promise<void>;
      releaseLock(): void;
    };
  } | null,
  maxBytes: number,
) => Promise<Uint8Array | null>;

function loadBoundedBodyReader(): BoundedBodyReader {
  const start = source.indexOf('async function readBoundedBody(');
  expect(start).toBeGreaterThanOrEqual(0);
  const openingBrace = source.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) {
      end = index + 1;
      break;
    }
  }
  expect(end).toBeGreaterThan(openingBrace);
  const compiled = transpileModule(source.slice(start, end), {
    compilerOptions: { module: ModuleKind.None, target: ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(`${compiled}\nreadBoundedBody`) as BoundedBodyReader;
}

describe('media-read authenticated image-byte delivery', () => {
  test('keeps signed links as the default and requires one raw ref for byte delivery', () => {
    expect(source).toContain("input.delivery === 'bytes'");
    expect(source).toMatch(/byteDelivery[\s\S]*?input\.refs !== undefined/);
    expect(source).toMatch(/byteDelivery[\s\S]*?typeof input\.ref !== 'string'/);
    expect(source).toContain("return Array.isArray(input.refs) ? json({ items }) : json(items[0]);");
  });

  test('allows byte delivery only for the three image folders after existing visibility checks', () => {
    expect(source).toContain(
      "const BYTE_IMAGE_FOLDERS = new Set(['avatars', 'covers', 'post-images']);",
    );
    expect(source).toMatch(/byteDelivery[\s\S]*?!BYTE_IMAGE_FOLDERS\.has\(readable\[0\]\.folder\)/);

    const authorization = source.indexOf('const authorized = await Promise.all');
    const rateCharge = source.indexOf("supabase.from('media_read_log').insert");
    const upstreamFetch = source.indexOf('await fetch(upstreamRequest');
    expect(authorization).toBeGreaterThanOrEqual(0);
    expect(rateCharge).toBeGreaterThan(authorization);
    expect(upstreamFetch).toBeGreaterThan(rateCharge);
    expect(source.match(/supabase\.from\('media_read_log'\)\.insert/g)).toHaveLength(1);
  });

  test('accepts only bounded JPEG, PNG, or WebP bodies from a successful R2 response', () => {
    expect(source).toContain('const BYTE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;');
    expect(source).toContain('const BYTE_IMAGE_FETCH_TIMEOUT_MS = 15_000;');
    expect(source).toContain("const BYTE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);");
    expect(source).toContain('if (!upstream.ok)');
    expect(source).toContain("upstream.headers.get('content-type')");
    expect(source).toContain("upstream.headers.get('content-length')");
    expect(source).not.toContain('upstream.arrayBuffer(');
    expect(source).toContain('await readBoundedBody(upstream.body, BYTE_IMAGE_MAX_BYTES)');
    expect(source).toContain(
      'await fetch(upstreamRequest, { signal: AbortSignal.timeout(BYTE_IMAGE_FETCH_TIMEOUT_MS) })',
    );
    expect(source).toContain('value.byteLength > maxBytes - totalBytes');
    expect(source).toContain('await reader.cancel()');
    expect(source).toContain('const merged = new Uint8Array(totalBytes);');
    const cumulativeCap = source.indexOf('value.byteLength > maxBytes - totalBytes');
    const oversizeCancel = source.indexOf('await reader.cancel()', cumulativeCap);
    const boundedAllocation = source.indexOf('const merged = new Uint8Array(totalBytes);');
    expect(cumulativeCap).toBeGreaterThanOrEqual(0);
    expect(oversizeCancel).toBeGreaterThan(cumulativeCap);
    expect(boundedAllocation).toBeGreaterThan(oversizeCancel);
    expect(source).toMatch(/bytes\.byteLength < 1[\s\S]*?bytes\.byteLength > BYTE_IMAGE_MAX_BYTES/);
    expect(source).toContain('const magicType = imageTypeForBytes(bytes);');
    expect(source).toContain('magicType !== contentType');
    expect(source).toMatch(/0xff[\s\S]*?0xd8[\s\S]*?0xff[\s\S]*?return 'image\/jpeg'/);
    expect(source).toMatch(/0x89[\s\S]*?0x50[\s\S]*?0x4e[\s\S]*?0x47[\s\S]*?return 'image\/png'/);
    expect(source).toMatch(/0x52[\s\S]*?0x49[\s\S]*?0x46[\s\S]*?0x46[\s\S]*?0x57[\s\S]*?0x45[\s\S]*?0x42[\s\S]*?0x50[\s\S]*?return 'image\/webp'/);
  });

  test('cancels an upstream stream immediately when cumulative bytes cross the cap', async () => {
    const readBoundedBody = loadBoundedBodyReader();
    let reads = 0;
    let cancels = 0;
    let releases = 0;
    const body = {
      getReader: () => ({
        read: async () => {
          reads += 1;
          if (reads === 1) return { done: false, value: new Uint8Array(12) };
          if (reads === 2) return { done: false, value: new Uint8Array(9) };
          throw new Error('reader continued after crossing the byte cap');
        },
        cancel: async () => {
          cancels += 1;
        },
        releaseLock: () => {
          releases += 1;
        },
      }),
    };

    await expect(readBoundedBody(body, 20)).resolves.toBeNull();
    expect(reads).toBe(2);
    expect(cancels).toBe(1);
    expect(releases).toBe(1);
  });

  test('returns non-cacheable sniff-resistant bytes without exposing storage identifiers', () => {
    expect(source).toContain("'Cache-Control': 'private, no-store'");
    expect(source).toContain("'Vary': 'Authorization'");
    expect(source).toContain("'X-Content-Type-Options': 'nosniff'");
    expect(source).toContain("'Access-Control-Expose-Headers': 'X-Private-Image-Type, Content-Length'");
    expect(source).toMatch(/new Response\(bytes,[\s\S]*?'Content-Type': 'application\/octet-stream'/);
    expect(source).toContain("'X-Private-Image-Type': contentType");
    expect(source).not.toMatch(/console\.(?:log|info|warn|error)/);
    expect(source).not.toMatch(/json\(\{\s*error:\s*`/);
  });
});
