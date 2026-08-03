import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(require.resolve('./renderBeautyImage.native'), 'utf8');

describe('native beauty renderer import contract', () => {
  test('loads native dependencies lazily with supported dynamic imports', () => {
    expect(source).toContain("await import('expo-file-system')");
    expect(source).toContain("await import('expo-image-manipulator')");
    expect(source).toContain("await import('react-native')");
    expect(source).toContain("await import('@shopify/react-native-skia')");
    expect(source).toContain("await import('../saveRunMedia')");
    expect(source).toContain("'react-native-vision-camera-face-detector'");
    expect(source).not.toContain('require(');
  });

  test('keeps rendering and face-detector safety boundaries intact', () => {
    expect(source).toContain('export async function renderBeautyImage(');
    expect(source).toContain('throwIfAborted(input.signal);');
    expect(source).toContain('const sourceUri = requireLocalSourceUri(input.sourceUri);');
    expect(source).toContain('async function detectFacesFromUri(uri: string)');
    expect(source).toContain('return detector.detectFaces(uri);');
    expect(source).toContain('detector.dispose();');
  });
});
