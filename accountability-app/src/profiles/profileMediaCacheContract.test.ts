import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(require.resolve('../app/edit-profile'), 'utf8');

function between(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('profile image cache invalidation', () => {
  test.each([
    ['avatar', 'async function onPickAvatar()', 'async function onPickCover()', 'avatar_url'],
    ['cover', 'async function onPickCover()', 'async function onSignOut()', 'cover_url'],
  ])('clears private image files after the %s profile commit succeeds', (_, start, end, field) => {
    const body = between(start, end);
    const commit = body.indexOf(`await updateMyProfile({ ${field}: url });`);
    const clear = body.indexOf('clearPrivateMediaCache();');
    const publish = body.indexOf(field === 'avatar_url' ? 'setAvatarUrl(url);' : 'setCoverUrl(url);');

    expect(source).toContain("import { clearPrivateMediaCache } from '../media/privateMedia'");
    expect(commit).toBeGreaterThanOrEqual(0);
    expect(clear).toBeGreaterThan(commit);
    expect(publish).toBeGreaterThan(clear);
  });
});
