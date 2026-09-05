import { describe, expect, test } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
) as { overrides?: Record<string, string> };
const packageLock = JSON.parse(
  fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'),
) as { packages: Record<string, { version?: string }> };

const securedVersions = {
  'image-size': '1.2.1',
  'js-yaml': '4.3.1',
  nanoid: '3.3.18',
  uuid: '11.1.1',
} as const;

describe('reachable dependency advisory patches', () => {
  test('pins patchable advisories and the Metro-compatible mitigated parser', () => {
    expect(packageJson.overrides).toMatchObject(securedVersions);

    for (const [name, version] of Object.entries(securedVersions)) {
      const installed =
        packageLock.packages[`node_modules/${name}`] ??
        packageLock.packages[`node_modules/metro/node_modules/${name}`];
      expect(installed?.version).toBe(version);
    }
  });

  test('keeps the CommonJS APIs used by Metro, Jest, and Expo config compatible', () => {
    const metroProbe = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '-e',
          "const path=require('node:path'); const {createRequire}=require('node:module'); const metroRequire=createRequire(require.resolve('metro/package.json')); const loaded=metroRequire('image-size'); const size=loaded.__esModule?loaded.default:loaded; const value=size(path.join(process.cwd(),'assets/images/icon.png')); process.stdout.write(JSON.stringify({kind:typeof size,width:value.width,height:value.height}));",
        ],
        { cwd: root, encoding: 'utf8' },
      ),
    ) as { kind: string; width: number; height: number };
    expect(metroProbe).toMatchObject({
      kind: 'function',
      width: expect.any(Number),
      height: expect.any(Number),
    });

    const yaml = require('js-yaml') as { load?: (value: string) => unknown };
    expect(typeof yaml.load).toBe('function');
    expect(yaml.load?.('ready: true')).toEqual({ ready: true });

    const uuid = execFileSync(
      process.execPath,
      ['-e', "process.stdout.write(require('uuid').v4())"],
      { cwd: root, encoding: 'utf8' },
    );
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  test('removes every unpatched infinite-loop parser from Metro asset detection', () => {
    const metroConfig = fs.readFileSync(
      path.join(root, 'metro.config.js'),
      'utf8',
    );
    expect(metroConfig).toMatch(
      /disableTypes\(\[\s*'heif',\s*'icns',\s*'j2c',\s*'jp2',\s*'jxl',\s*'jxl-stream'\s*\]\)/,
    );

    const probe = execFileSync(
      process.execPath,
      [
        '-e',
        "const {createRequire}=require('node:module'); require('./metro.config.js'); const metroRequire=createRequire(require.resolve('metro/package.json')); const loaded=metroRequire('image-size'); const size=loaded.__esModule?loaded.default:loaded; try { size(Uint8Array.from([0x69,0x63,0x6e,0x73,0,0,0,16,0x69,0x63,0x30,0x37,0,0,0,0])); } catch {} process.stdout.write('safe');",
      ],
      { cwd: root, encoding: 'utf8', timeout: 10_000 },
    );
    expect(probe).toBe('safe');
  });
});
