import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.resolve(
  __dirname,
  '../../supabase/migrations/0112_serialize_rate_limit_admission.sql',
);

function readMigration(): string {
  return fs.readFileSync(migrationPath, 'utf8');
}

function limiterFunction(source: string): string {
  return (
    source.match(
      /create or replace function public\.enforce_rate_limit\(\)[\s\S]*?\$function\$;/i,
    )?.[0] ?? ''
  );
}

describe('concurrency-safe database rate admission', () => {
  test('installs the limiter atomically without changing grants or data', () => {
    const migration = readMigration().trim();

    expect(migration).toMatch(/^begin;/i);
    expect(migration).toMatch(/commit;$/i);
    expect(migration).not.toMatch(/\b(insert|update|delete|truncate|merge)\b/i);
    expect(migration).not.toMatch(/\b(grant|revoke)\b/i);
  });

  test('serializes each authenticated user and configured table before counting', () => {
    const fn = limiterFunction(readMigration());
    const normalized = fn.replace(/\s+/g, ' ');
    const loadConfig = normalized.indexOf('select * into cfg from public.rate_limits');
    const genericLock = normalized.indexOf(
      "'rate-limit:' || tg_table_schema || '.' || tg_table_name || ':' || uid::text",
    );
    const countRows = normalized.indexOf("'select pg_catalog.count(*) from public.%I");

    expect(fn).toMatch(/security definer[\s\S]*set search_path = ''/i);
    expect(fn).toMatch(/uid uuid := auth\.uid\(\)/i);
    expect(fn).toMatch(/if uid is null then\s+return new;\s+end if;/i);
    expect(fn).toMatch(/if not found then\s+return new;\s+end if;/i);
    expect(fn).toMatch(
      /if tg_table_name <> 'buddy_reports' then[\s\S]*pg_catalog\.pg_advisory_xact_lock\([\s\S]*pg_catalog\.hashtextextended/i,
    );
    expect(loadConfig).toBeGreaterThanOrEqual(0);
    expect(genericLock).toBeGreaterThan(loadConfig);
    expect(countRows).toBeGreaterThan(genericLock);
  });

  test('preserves Buddy report serialization and the configured limit decision', () => {
    const fn = limiterFunction(readMigration());

    expect(fn).toMatch(
      /if tg_table_name = 'buddy_reports' then[\s\S]*'report_content:' \|\| new\.reporter::text/i,
    );
    expect(fn).toMatch(
      /where %I = \$1 and created_at > pg_catalog\.now\(\) - pg_catalog\.make_interval\(secs => \$2\)/i,
    );
    expect(fn).toMatch(/if n >= cfg\.max_rows then[\s\S]*errcode = '54000'/i);
  });
});
