import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '0114_private_body_progress.sql',
);

const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, 'utf8').toLowerCase().replace(/\s+/g, ' ').trim()
  : '';

describe('0114 private body progress migration', () => {
  test('is an explicit transaction', () => {
    expect(migration).toMatch(/^begin\s*;/);
    expect(migration).toMatch(/commit\s*;$/);
  });

  test('creates constrained owner-scoped body measurements', () => {
    expect(migration).toMatch(/create table if not exists public\.body_measurements \( id uuid primary key default gen_random_uuid\(\), user_id uuid not null references auth\.users \(id\) on delete cascade, recorded_at timestamptz not null default now\(\), weight_kg numeric\(6,2\) not null check \(weight_kg between 20 and 500\), height_cm numeric\(5,2\) not null check \(height_cm between 80 and 250\), created_at timestamptz not null default now\(\) \)/);
    expect(migration).toContain(
      'create index if not exists body_measurements_owner_recorded_at_idx on public.body_measurements (user_id, recorded_at desc)',
    );
    expect(migration).toContain('alter table public.body_measurements enable row level security');
  });

  test('creates constrained private progress photo metadata', () => {
    expect(migration).toMatch(/create table if not exists public\.progress_photos \( id uuid primary key default gen_random_uuid\(\), user_id uuid not null references auth\.users \(id\) on delete cascade, storage_path text not null check \(char_length\(storage_path\) between 1 and 220\), captured_at timestamptz not null default now\(\), weight_kg numeric\(6,2\) check \(weight_kg between 20 and 500\), created_at timestamptz not null default now\(\), unique \(user_id, storage_path\) \)/);
    expect(migration).toContain(
      'create index if not exists progress_photos_owner_captured_at_idx on public.progress_photos (user_id, captured_at desc)',
    );
    expect(migration).toContain('alter table public.progress_photos enable row level security');
  });

  test.each([
    ['body_measurements', 'select', 'using (user_id = auth.uid())'],
    ['body_measurements', 'insert', 'with check (user_id = auth.uid())'],
    ['body_measurements', 'update', 'using (user_id = auth.uid()) with check (user_id = auth.uid())'],
    ['body_measurements', 'delete', 'using (user_id = auth.uid())'],
    ['progress_photos', 'select', 'using (user_id = auth.uid())'],
    ['progress_photos', 'insert', 'with check (user_id = auth.uid())'],
    ['progress_photos', 'update', 'using (user_id = auth.uid()) with check (user_id = auth.uid())'],
    ['progress_photos', 'delete', 'using (user_id = auth.uid())'],
  ])('gives authenticated owners self-only %s %s access', (table, operation, predicate) => {
    expect(migration).toContain(`drop policy if exists ${table}_${operation} on public.${table}`);
    expect(migration).toContain(
      `create policy ${table}_${operation} on public.${table} for ${operation} to authenticated ${predicate}`,
    );
  });

  test('keeps the progress photo bucket private on insert and replay', () => {
    expect(migration).toMatch(/insert into storage\.buckets \(id, name, public\) values \('progress-photos', 'progress-photos', false\) on conflict \(id\) do update set name = excluded\.name, public = false/);
  });

  test.each([
    ['select', 'using'],
    ['insert', 'with check'],
    ['delete', 'using'],
  ])('allows authenticated owners to %s only their first storage folder', (operation, clause) => {
    expect(migration).toContain(`drop policy if exists progress_photos_storage_${operation} on storage.objects`);
    expect(migration).toContain(
      `create policy progress_photos_storage_${operation} on storage.objects for ${operation} to authenticated ${clause} (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text)`,
    );
  });

  test('grants table access only to authenticated users and exposes nothing to anon or public', () => {
    for (const table of ['body_measurements', 'progress_photos']) {
      expect(migration).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
      expect(migration).toContain(`grant select, insert, update, delete on table public.${table} to authenticated`);
    }
    const createdPolicies = migration.match(/create policy [^;]+;/g) ?? [];
    expect(createdPolicies).toHaveLength(11);
    expect(createdPolicies.every((policy) => policy.includes(' to authenticated '))).toBe(true);
    expect(migration).not.toMatch(/create policy [^;]+\bto (?:anon|public)\b/);
    expect(migration).not.toMatch(/grant [^;]+\bto (?:anon|public)\b/);
  });

  test('is additive and has no privileged bypass', () => {
    expect(migration).not.toMatch(/\b(?:drop|truncate) (?:table|schema|database)\b/);
    expect(migration).not.toMatch(/\bdelete from\b/);
    expect(migration).not.toMatch(/(?:^|;)\s*update\s/);
    expect(migration.replace(/on delete cascade/g, '')).not.toMatch(/\bcascade\b/);
    expect(migration).not.toMatch(/\bservice_role\b|security definer/);
  });
});
