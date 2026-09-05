import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

describe('R2 operation cleanup signer', () => {
  test('binds signed DELETE requests to the authenticated owner and exact digest media reference', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/r2-sign/index.ts'), 'utf8');
    expect(source).toContain("action === 'delete'");
    expect(source).toMatch(/expectedOwnerId.*user\.id/);
    expect(source).toMatch(/mediaRef.*expectedMediaRef/);
    expect(source).toMatch(/method:\s*'DELETE'/);
    expect(source).toContain('deleteUrl');
    expect(source).toMatch(/x-amz-meta-operation-id[\s\S]*?shared:\s*true/);
  });

  test('operation-scoped cleanup derives the exact owner, operation, digest path', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/r2-sign/index.ts'), 'utf8');
    expect(source).toContain('operationDigestObjectFilename(operationId, sha256, safeExt)');
    expect(source).toMatch(/keyMode === 'operation'[\s\S]*?operationDigestObjectFilename/);
  });
});
