import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const FUNCTION_PATH = 'supabase/functions/media-read/index.ts';
const MIGRATION_PATH = 'supabase/migrations/0111_media_read_post_videos.sql';
const CLIENT_PATH = 'src/media/privateMedia.ts';
const EXPECTED_KINDS = [
  'avatars',
  'covers',
  'post-images',
  'post-videos',
  'voice-encouragements',
];

function numericConstant(source: string, name: string): number {
  const match = source.match(new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*([0-9_]+)`));
  if (!match) throw new Error(`Missing numeric constant ${name}`);
  return Number(match[1].replaceAll('_', ''));
}

function functionKinds(source: string): string[] {
  const match = source.match(/const PRIVATE_REF = \/\^r2:\\\/\\\/\(([^)]+)\)/);
  if (!match) throw new Error('Missing media-read PRIVATE_REF kinds');
  return match[1].split('|').sort();
}

function migrationKinds(source: string): string[] {
  const match = source.match(
    /add constraint media_read_log_media_kind_check\s+check\s*\(media_kind in\s*\(([^)]+)\)\)/i,
  );
  if (!match) throw new Error('Missing media_read_log_media_kind_check definition');
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]).sort();
}

describe('media-read compatibility rollout', () => {
  test('keeps signed reads valid beyond the client refresh headroom', () => {
    const readSeconds = numericConstant(read(FUNCTION_PATH), 'READ_SECONDS');
    const refreshHeadroomMs = numericConstant(read(CLIENT_PATH), 'PRIVATE_MEDIA_REFRESH_HEADROOM_MS');

    expect(readSeconds * 1_000).toBeGreaterThan(refreshHeadroomMs);
  });

  test('authorizes the complete private-media vocabulary including post videos', () => {
    const mediaRead = read(FUNCTION_PATH);

    expect(functionKinds(mediaRead)).toEqual([...EXPECTED_KINDS].sort());
    expect(mediaRead).toContain("folder === 'post-images' || folder === 'post-videos'");
  });

  test('replay-safely aligns the database constraint without data or grant changes', () => {
    const migration = read(MIGRATION_PATH);
    const statements = migration.trim();

    expect(statements).toMatch(/^begin;/i);
    expect(statements).toMatch(/commit;$/i);
    expect(migration).toMatch(
      /drop constraint if exists media_read_log_media_kind_check/i,
    );
    expect(migrationKinds(migration)).toEqual(functionKinds(read(FUNCTION_PATH)));
    expect(migrationKinds(migration)).toEqual([...EXPECTED_KINDS].sort());
    expect(migration).not.toMatch(/\b(insert|update|delete|truncate|merge)\b/i);
    expect(migration).not.toMatch(/\b(grant|revoke)\b/i);
  });
});
