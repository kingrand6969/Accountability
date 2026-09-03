import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

describe('R2 signer security contract', () => {
  const source = readFileSync(resolve(process.cwd(), 'supabase/functions/r2-sign/index.ts'), 'utf8');

  test('retains exact signed length for every presigned non-share upload', () => {
    const uploadHeaders = source.match(/const uploadHeaders = \{([\s\S]*?)\n    \};/)?.[1];

    expect(source).toContain("typeof bytes !== 'number'");
    expect(source).toContain('bytes > MAX_BYTES[kind!]');
    expect(source).toMatch(/if \(action === 'direct-upload'\)[\s\S]*?return json\(\{ uploaded: true,[\s\S]*?const uploadHeaders/);
    expect(uploadHeaders).toContain("'content-length': String(bytes)");
    expect(uploadHeaders).toContain("'content-type': contentType");
    expect(uploadHeaders).toContain("'x-amz-content-sha256': sha256");
    expect(uploadHeaders).toContain("'if-none-match': '*'");
    expect(uploadHeaders).toContain("'x-amz-meta-operation-id': operationId");
    expect(source).toContain('const SHA256 = /^[a-f0-9]{64}$/;');
  });

  test('uses a digest-addressed immutable key for operation retries', () => {
    expect(source).toContain('digestObjectFilename(sha256, safeExt)');
    expect(source).toContain("'if-none-match': '*'");
    expect(source).toMatch(/operationId\s*\?\s*\{[^}]*'if-none-match'/s);
  });

  test('offers an operation-scoped key only for exact post operations', () => {
    expect(source).toContain("keyMode === 'operation'");
    expect(source).toContain('operationDigestObjectFilename(operationId, sha256, safeExt)');
    expect(source).toMatch(/keyMode.*operation[\s\S]*?kind !== 'post'/);
  });
});
