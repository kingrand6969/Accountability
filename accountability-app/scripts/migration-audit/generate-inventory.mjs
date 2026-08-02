import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInvariantInventory } from './core.mjs';
const directory = path.dirname(fileURLToPath(import.meta.url));
const frozen = JSON.parse(readFileSync(path.join(directory, 'frozen-ledger.json'), 'utf8'));
writeFileSync(
  path.join(directory, 'invariant-inventory.json'),
  `${JSON.stringify(buildInvariantInventory(frozen, path.resolve(directory, '../../supabase/migrations')), null, 2)}\n`,
);
