import path from 'node:path';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLocalCanonicalCollector } from './local-canonical-collector.mjs';
import { validateApprovedLocalPin } from './local-reviewed-pin.mjs';

const USAGE = 'Usage: node local-canonical-cli.mjs collect <absolute-approved-pin> <approved-pin-sha256> <absolute-output-directory>';

export function parseLocalCliArgs(args) {
  if (args.length !== 4 || args[0] !== 'collect' || !path.isAbsolute(args[1]) ||
      !/^[0-9a-f]{64}$/u.test(args[2]) || !path.isAbsolute(args[3])) throw new Error(USAGE);
  return { command: 'collect', pinPath: args[1], approvedDigest: args[2], outputDir: args[3] };
}

async function main() {
  const request = parseLocalCliArgs(process.argv.slice(2));
  const pinInfo = lstatSync(request.pinPath);
  if (!pinInfo.isFile() || pinInfo.isSymbolicLink() || realpathSync.native(request.pinPath).toLowerCase() !== path.resolve(request.pinPath).toLowerCase()) {
    throw new Error('Approved local pin must be a canonical regular non-link file.');
  }
  const approvedPin = validateApprovedLocalPin(readFileSync(request.pinPath), request.approvedDigest);
  const result = await createLocalCanonicalCollector({ approvedPin, enforceHeadClean: true })(request);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
