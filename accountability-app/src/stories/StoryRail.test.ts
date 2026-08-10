import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

const source = fs.readFileSync(path.join(__dirname, 'StoryRail.tsx'), 'utf8');

describe('StoryRail large-text layout', () => {
  test('grows the story and buddy tiles without limiting font scaling', () => {
    expect(source).toContain('storyTileSizeForFontScale(fontScale)');
    expect(source).toContain('style={[styles.tile, tileSize]}');
    expect(source).toContain('style={[styles.hintTile, { width: hintWidth');
    expect(source).not.toContain('maxFontSizeMultiplier');
  });
});

describe('StoryRail receipt and retry presentation', () => {
  test('uses viewed state for the existing story ring', () => {
    expect(source).toContain('viewed={g.viewed}');
    expect(source).toContain('viewed && styles.tileAvatarRingViewed');
  });

  test('renders a compact retry action and guards stale loads', () => {
    expect(source).toContain("Couldn’t load My Day · Retry");
    expect(source).toContain('onPress={() => void load()}');
    expect(source).toContain('generation !== loadGeneration.current');
    expect(source).toContain('mountedRef.current');
  });
});
