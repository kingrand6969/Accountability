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
