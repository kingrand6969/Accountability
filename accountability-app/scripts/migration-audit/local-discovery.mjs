import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { normalizedJson } from './core.mjs';

const CONTAINER = 'supabase_db_tmp-ledger-replay-0079';
const DOCKER = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
const DOCKER_SHA256 = 'c11b843b727ea76e6c63b393bccb73d957b6fcc12ba871c8265699e3a12e933c';
const USAGE = 'Usage: node local-discovery.mjs discover';

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function defaultVerifyDockerExecutable() { return sha256(readFileSync(DOCKER)) === DOCKER_SHA256; }
function defaultRunDocker({ args }) {
  const result = spawnSync(DOCKER, args, {
    encoding: 'utf8', windowsHide: true, timeout: 10_000, maxBuffer: 4 * 1024 * 1024,
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error };
}
function exactObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} inspect shape rejected.`);
  return value;
}
function inspectResult(result, label) {
  if (!result || result.status !== 0 || result.error || Buffer.byteLength(result.stdout ?? '', 'utf8') > 4 * 1024 * 1024) {
    throw new Error(`${label} inspect failed.`);
  }
  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch { throw new Error(`${label} inspect JSON rejected.`); }
  if (!Array.isArray(parsed) || parsed.length !== 1) throw new Error(`${label} inspect cardinality rejected.`);
  return exactObject(parsed[0], label);
}
function sortedObject(value) {
  const source = exactObject(value ?? {}, 'Map');
  return Object.fromEntries(Object.entries(source).sort(([left], [right]) => left.localeCompare(right)));
}

export function parseDiscoveryArgs(args) {
  if (args.length !== 1 || args[0] !== 'discover') throw new Error(USAGE);
  return { command: 'discover' };
}

export function createLocalDiscovery({
  runDocker = defaultRunDocker,
  verifyDockerExecutable = defaultVerifyDockerExecutable,
} = {}) {
  return function discover() {
    if (!verifyDockerExecutable()) throw new Error('Pinned Docker executable hash mismatch.');
    const rawContainer = inspectResult(runDocker({
      args: ['container', 'inspect', CONTAINER],
    }), 'Container');
    if (rawContainer.Name !== `/${CONTAINER}` || !/^[0-9a-f]{64}$/.test(rawContainer.Id ?? '') ||
        !/^sha256:[0-9a-f]{64}$/.test(rawContainer.Image ?? '')) {
      throw new Error('Disposable container identity rejected.');
    }
    const rawImage = inspectResult(runDocker({
      args: ['image', 'inspect', rawContainer.Image],
    }), 'Image');
    if (rawImage.Id !== rawContainer.Image || !Array.isArray(rawImage.RepoDigests) ||
        rawImage.RepoDigests.some((digest) => typeof digest !== 'string' || !/@sha256:[0-9a-f]{64}$/.test(digest))) {
      throw new Error('Container image identity rejected.');
    }
    const config = exactObject(rawContainer.Config, 'Container config');
    const state = exactObject(rawContainer.State, 'Container state');
    const networkSettings = exactObject(rawContainer.NetworkSettings, 'Container network settings');
    const networks = sortedObject(networkSettings.Networks);
    const normalizedNetworks = Object.fromEntries(Object.entries(networks).map(([name, network]) => {
      const item = exactObject(network, 'Container network');
      return [name, {
        aliases: Array.isArray(item.Aliases) ? [...item.Aliases].sort() : [],
        endpointId: item.EndpointID ?? '', gateway: item.Gateway ?? '', ipAddress: item.IPAddress ?? '',
        ipPrefixLength: item.IPPrefixLen ?? 0, macAddress: item.MacAddress ?? '', networkId: item.NetworkID ?? '',
      }];
    }));
    const mounts = Array.isArray(rawContainer.Mounts) ? rawContainer.Mounts.map((mount) => ({
      destination: mount.Destination ?? '', mode: mount.Mode ?? '', name: mount.Name ?? '',
      propagation: mount.Propagation ?? '', readWrite: mount.RW === true, source: mount.Source ?? '', type: mount.Type ?? '',
    })).sort((left, right) => left.destination.localeCompare(right.destination)) : [];
    return {
      formatVersion: 1,
      trust: 'UNTRUSTED_DISCOVERY',
      warning: 'Observation only. Review and pin every value before trusted collection.',
      docker: { absolutePath: DOCKER, sha256: DOCKER_SHA256 },
      container: {
        name: CONTAINER, id: rawContainer.Id, imageId: rawContainer.Image,
        configuredImage: config.Image ?? '', running: state.Running === true,
        labels: sortedObject(config.Labels),
        entrypointCommandSha256: sha256(normalizedJson({
          entrypoint: config.Entrypoint ?? null,
          command: config.Cmd ?? null,
        })),
        mounts, networks: normalizedNetworks,
      },
      image: { id: rawImage.Id, repoDigests: [...rawImage.RepoDigests].sort() },
      psql: { absolutePathCandidate: '/usr/bin/psql', verified: false },
    };
  };
}

async function main() {
  parseDiscoveryArgs(process.argv.slice(2));
  process.stdout.write(normalizedJson(createLocalDiscovery()()));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
