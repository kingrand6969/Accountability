import { readdir, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const UPDATE_WARN_BYTES = 15 * 1024 * 1024;
export const UPDATE_MAX_BYTES = 25 * 1024 * 1024;

export function evaluateUpdateBudget(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) throw new Error('Update bytes must be a non-negative number.');
  return {
    bytes,
    estimatedTransferFor1000Users: bytes * 1000,
    status: bytes > UPDATE_MAX_BYTES ? 'blocked' : bytes > UPDATE_WARN_BYTES ? 'warning' : 'ok',
  };
}

async function directoryBytes(root) {
  let total = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(target);
    else if (entry.isFile()) total += (await stat(target)).size;
  }
  return total;
}

const formatMiB = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;

async function main() {
  const root = path.resolve(process.argv[2] ?? 'dist');
  const result = evaluateUpdateBudget(await directoryBytes(root));
  process.stdout.write(
    `Update bundle: ${formatMiB(result.bytes)}\n` +
      `Estimated transfer to 1,000 devices: ${formatMiB(result.estimatedTransferFor1000Users)}\n` +
      `Budget status: ${result.status.toUpperCase()}\n`,
  );
  if (result.status === 'blocked') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

