import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const migrationsDirectory = resolve(process.cwd(), 'supabase/migrations');
const creatorDefinition = /create\s+or\s+replace\s+function\s+public\.create_public_post_share\s*\(/i;
const migrationNames = readdirSync(migrationsDirectory)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();
const latestCreatorMigrationName = [...migrationNames]
  .reverse()
  .find((name) => creatorDefinition.test(readFileSync(resolve(migrationsDirectory, name), 'utf8')));
const latestCreatorMigration = latestCreatorMigrationName
  ? readFileSync(resolve(migrationsDirectory, latestCreatorMigrationName), 'utf8')
  : '';
const normalizedMigration = latestCreatorMigration.replace(/\s+/g, ' ').trim();
const oldBrand = ['Account', 'Ability'].join('');
const creatorBody = latestCreatorMigration.match(
  /create\s+or\s+replace\s+function\s+public\.create_public_post_share\s*\([\s\S]*?\)\s*returns\s+uuid[\s\S]*?as\s+\$\$([\s\S]*?)\$\$;/i,
)?.[1] ?? '';

describe('Mantle public-share metadata migration', () => {
  test('the latest creator definition is a forward override of the historical migration', () => {
    expect(latestCreatorMigrationName).toBeDefined();
    expect(Number(latestCreatorMigrationName?.slice(0, 4))).toBeGreaterThan(96);
    expect(creatorBody).toContain("'A win from Mantle'");
    expect(creatorBody).toContain("'A progress update shared with permission from Mantle.'");
    expect(creatorBody).not.toContain(oldBrand);
  });

  test('preserves the latest creator signature and security contract', () => {
    expect(normalizedMigration).toMatch(
      /create or replace function public\.create_public_post_share\s*\(\s*p_post uuid,\s*p_preview_ref text\s*\) returns uuid language plpgsql security definer set search_path = public as \$\$/i,
    );
    expect(creatorBody.replace(/\s+/g, ' ')).toMatch(
      /p_preview_ref !~ '\^r2:\/\/share-cards\/' or split_part\(p_preview_ref, '\/', 4\) <> auth\.uid\(\)::text/i,
    );
    expect(creatorBody.replace(/\s+/g, ' ')).toMatch(
      /from public\.posts where id = p_post and user_id = auth\.uid\(\) and moderation_state = 'visible'/i,
    );
    expect(creatorBody.replace(/\s+/g, ' ')).toMatch(
      /insert into public\.public_shares\s*\(owner_id, post_id, title, description, preview_image_url, preview_image_ref\) values \(auth\.uid\(\), p\.id,[\s\S]*null, p_preview_ref\)/i,
    );
    expect(normalizedMigration).toContain(
      'revoke execute on function public.create_public_post_share(uuid, text) from public, anon;',
    );
    expect(normalizedMigration).toContain(
      'grant execute on function public.create_public_post_share(uuid, text) to authenticated, service_role;',
    );
    expect(normalizedMigration).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.(get_public_share|resolve_public_share_post)/i);
    expect(normalizedMigration).not.toMatch(/(?:create|alter|drop)\s+policy/i);
  });

  test('normalizes only active rows with exact old system templates', () => {
    expect(normalizedMigration).toContain(
      `when s.description = 'Shared from ${oldBrand}' then 'Shared from Mantle'`,
    );
    expect(normalizedMigration).toContain(
      `when s.description = 'A progress update shared with permission from ${oldBrand}.' then 'A progress update shared with permission from Mantle.'`,
    );
    expect(normalizedMigration).toContain('s.revoked_at is null and s.expires_at > now()');
    expect(normalizedMigration).toContain(`s.title = 'A win from ${oldBrand}'`);
    expect(normalizedMigration).toContain("nullif(trim(p.body), '') is null");
    expect(normalizedMigration).not.toMatch(/\blike\b|regexp_replace|\breplace\s*\(/i);
  });
});
