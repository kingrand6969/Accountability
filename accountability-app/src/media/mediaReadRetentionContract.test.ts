import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  __dirname,
  '../../supabase/migrations/0113_schedule_media_read_retention.sql',
);

function readMigration(): string {
  return fs.readFileSync(migrationPath, 'utf8');
}

describe('private-media read-log retention', () => {
  test('installs the cleanup and schedule atomically', () => {
    const migration = readMigration().trim();

    expect(migration).toMatch(/^begin;/i);
    expect(migration).toMatch(/commit;$/i);
    expect(migration).toMatch(/set local lock_timeout = '5s'/i);
    expect(migration).toMatch(/set local statement_timeout = '60s'/i);
    expect(migration).toMatch(/create extension if not exists pg_cron;/i);
    expect(migration).not.toMatch(/exception\s+when\s+others/i);
  });

  test('keeps pruning bounded, indexed, and unavailable to clients', () => {
    const migration = readMigration();

    expect(migration).toMatch(
      /create index if not exists media_read_log_created_at_idx\s+on public\.media_read_log\s*\(created_at, id\)/i,
    );
    expect(migration).toMatch(
      /create or replace function public\.prune_media_read_log\(\)[\s\S]*?security definer[\s\S]*?set search_path = ''[\s\S]*?select id[\s\S]*?created_at < pg_catalog\.now\(\) - interval '2 days'[\s\S]*?order by created_at, id[\s\S]*?limit 5000[\s\S]*?delete from public\.media_read_log as log[\s\S]*?where log\.id = doomed\.id/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.prune_media_read_log\(\) from public, anon, authenticated/i,
    );
  });

  test('uses one replay-safe five-minute job and prunes the existing backlog once', () => {
    const migration = readMigration();

    expect(migration.match(/cron\.schedule\(/gi)).toHaveLength(1);
    expect(migration).toMatch(
      /cron\.schedule\(\s*'prune-media-read-log',\s*'\*\/5 \* \* \* \*',\s*'select public\.prune_media_read_log\(\)'/i,
    );
    expect(migration).toMatch(/select public\.prune_media_read_log\(\);[\s\S]*commit;/i);
  });
});
