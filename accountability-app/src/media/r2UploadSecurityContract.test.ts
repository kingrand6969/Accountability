import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

describe('R2 signer security contract', () => {
  const source = readFileSync(resolve(process.cwd(), 'supabase/functions/r2-sign/index.ts'), 'utf8');

  test('binds the approved byte count and content digest into the signed PUT', () => {
    expect(source).toContain("'content-length': String(bytes)");
    expect(source).toContain("'x-amz-content-sha256': sha256");
    expect(source).toContain('const SHA256 = /^[a-f0-9]{64}$/;');
  });

  test('uses a digest-addressed immutable key for operation retries', () => {
    expect(source).toContain('digestObjectFilename(sha256, safeExt)');
    expect(source).toContain("'if-none-match': '*'");
    expect(source).toMatch(/operationId\s*\?\s*\{[^}]*'if-none-match'/s);
  });
});
