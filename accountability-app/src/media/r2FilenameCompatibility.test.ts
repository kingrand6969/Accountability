import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

import { digestObjectFilename, operationDigestObjectFilename } from '../../supabase/functions/_shared/r2ObjectKey';
import { parsePostImageObjectRef } from '../../supabase/functions/_shared/postImageRef';

const MEMBER = '00000000-0000-4000-8000-000000000001';
const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function edgeRegex(path: string, name: string): RegExp {
  const match = source(path).match(new RegExp(`const ${name} = /(.+)/i;`));
  if (!match?.[1]) throw new Error(`Missing ${name} validator.`);
  return new RegExp(match[1], 'i');
}

function sqlCheckRegex(path: string, marker: string): RegExp {
  const text = source(path);
  const start = text.indexOf(marker);
  const match = start >= 0 ? text.slice(start).match(/~ '([^']+)'/) : null;
  if (!match?.[1]) throw new Error(`Missing ${marker} database check.`);
  return new RegExp(match[1]);
}

describe('digest R2 filename compatibility', () => {
  const privateRef = edgeRegex('supabase/functions/media-read/index.ts', 'PRIVATE_REF');
  const publicShareRef = edgeRegex('supabase/functions/public-share-preview/index.ts', 'SHARE_REF');
  const voiceDbRef = sqlCheckRegex('supabase/migrations/0086_voice_encouragement.sql', 'constraint encouragement_voice_ref');
  const shareDbRef = sqlCheckRegex('supabase/migrations/0091_private_rendered_public_shares.sql', 'public_shares_preview_image_ref_check');

  const privateMediaCases: [string, string][] = [
    ['post-images', 'jpg'],
    ['post-videos', 'webm'],
    ['voice-encouragements', 'm4a'],
  ];

  test.each(privateMediaCases)('the signer filename is accepted by private reads for %s', (folder, extension) => {
    const filename = digestObjectFilename(DIGEST_A, extension);
    expect(filename.length).toBeLessThanOrEqual(100);
    expect(privateRef.test(`r2://${folder}/${MEMBER}/${filename}`)).toBe(true);
  });

  test('the signer share filename is accepted by both public-share gates', () => {
    const ref = `r2://share-cards/${MEMBER}/${digestObjectFilename(DIGEST_A, 'png')}`;
    expect(publicShareRef.test(ref)).toBe(true);
    expect(shareDbRef.test(ref)).toBe(true);
  });

  test('the signer voice filename is accepted by the voice database check', () => {
    const ref = `r2://voice-encouragements/${MEMBER}/${digestObjectFilename(DIGEST_A, 'webm')}`;
    expect(voiceDbRef.test(ref)).toBe(true);
  });

  test('changed bytes select a different immutable object instead of overwriting', () => {
    const first = digestObjectFilename(DIGEST_A, 'jpg');
    const changed = digestObjectFilename(DIGEST_B, 'jpg');
    expect(changed).not.toBe(first);
    expect(source('supabase/functions/r2-sign/index.ts')).toContain("'if-none-match': '*'");
  });

  test('legacy UUID filenames remain readable without loosening validators', () => {
    const legacy = `r2://post-images/${MEMBER}/123e4567-e89b-42d3-a456-426614174000.jpg`;
    expect(privateRef.test(legacy)).toBe(true);
  });

  test('operation-scoped Journey filenames remain readable and separate identical bytes', () => {
    const operationA = '123e4567-e89b-42d3-a456-426614174000';
    const operationB = '223e4567-e89b-42d3-a456-426614174000';
    const first = operationDigestObjectFilename(operationA, DIGEST_A, 'jpg');
    const second = operationDigestObjectFilename(operationB, DIGEST_A, 'jpg');
    expect(first).toBe(`${operationA}/${DIGEST_A}.jpg`);
    expect(first).not.toBe(second);
    expect(privateRef.test(`r2://post-images/${MEMBER}/${first}`)).toBe(true);
    expect(privateRef.test(`r2://post-images/${MEMBER}/${second}`)).toBe(true);
    expect(parsePostImageObjectRef(`r2://post-images/${MEMBER}/${first}`, MEMBER)).toEqual({
      ownerId: MEMBER,
      key: `post-images/${MEMBER}/${first}`,
      format: 'operation',
    });
  });
});
