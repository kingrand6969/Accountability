import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('phone-only media library boundary', () => {
  test('root-loaded share routes do not initialize the native module on web', () => {
    const winCard = source('src/app/win-card.tsx');
    const run = source('src/activity/RunShareSheet.tsx');
    expect(winCard).not.toContain("import * as MediaLibrary from 'expo-media-library'");
    expect(run).not.toContain("import * as MediaLibrary from 'expo-media-library'");
    expect(winCard).toContain("from '../media/phoneMediaLibrary'");
    expect(run).toContain("from '../media/phoneMediaLibrary'");
  });

  test('the shared boundary rejects web before lazily loading native code', () => {
    const helper = source('src/media/phoneMediaLibrary.ts');
    expect(helper).toMatch(/Platform\.OS === 'web'[\s\S]*?throw new Error[\s\S]*?await import\('expo-media-library'\)/);
  });

  test('uses the SDK 56 Asset API instead of the legacy method that throws at runtime', () => {
    const helper = source('src/media/phoneMediaLibrary.ts');
    expect(helper).toContain('mediaLibrary.Asset.create(uri)');
    expect(helper).not.toContain('mediaLibrary.createAssetAsync(uri)');
  });
});
