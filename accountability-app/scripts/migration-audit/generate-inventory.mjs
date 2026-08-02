import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInvariantInventory, sha256 } from './core.mjs';
const directory = path.dirname(fileURLToPath(import.meta.url));
const frozenPath = path.join(directory, 'frozen-ledger.json');
const frozen = JSON.parse(readFileSync(frozenPath, 'utf8'));
if (process.argv.includes('--refresh-ledger-lf')) {
  const repositoryRoot = path.resolve(directory, '../../..');
  for (const migration of frozen.migrations) {
    const relative = `accountability-app/supabase/migrations/${migration.filename}`;
    const blob = execFileSync('git', ['show', `:${relative}`], {
      cwd: repositoryRoot,
      encoding: 'buffer',
      maxBuffer: 2 * 1024 * 1024,
    });
    migration.sha256 = sha256(blob);
  }
  writeFileSync(frozenPath, `${JSON.stringify(frozen, null, 2)}\n`);
  const statusPath = path.join(directory, 'version-status-manifest.json');
  const status = JSON.parse(readFileSync(statusPath, 'utf8'));
  for (let index = 0; index < frozen.migrations.length; index += 1) {
    status.versions[index].evidence.canonicalSha256 = frozen.migrations[index].sha256;
  }
  writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`);
}
writeFileSync(
  path.join(directory, 'invariant-inventory.json'),
  `${JSON.stringify(buildInvariantInventory(frozen, path.resolve(directory, '../../supabase/migrations')), null, 2)}\n`,
);
