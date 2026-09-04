import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

const source = fs.readFileSync(path.join(__dirname, 'StoryRail.tsx'), 'utf8');

function styleBlock(name: string): string {
  return source.match(new RegExp(`${name}:\\s*\\{([\\s\\S]*?)\\n  \\},`))?.[1] ?? '';
}

test('uses one quiet divider and preserves the 52dp story image', () => {
  expect(source).toContain('const STORY_BUBBLE = 52');
  expect(styleBlock('rail')).toContain('paddingBottom: spacing.md');
  expect(styleBlock('rail')).toContain('gap: spacing.md');
  expect(styleBlock('rail')).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
  expect(styleBlock('rail')).toContain('borderBottomColor: theme.border.subtle');
  expect(styleBlock('rail')).not.toContain('borderTopWidth');
  expect(styleBlock('createLabel')).toContain('color: theme.ink.secondary');
  expect(styleBlock('createLabel')).toContain('fontFamily: font.semibold');
  expect(styleBlock('storyName')).toContain('color: theme.ink.muted');
});

describe('StoryRail large-text layout', () => {
  test('grows circular story items and buddy suggestions without limiting font scaling', () => {
    expect(source).toContain('storyTileSizeForFontScale(fontScale)');
    expect(source).toContain('style={[styles.storyItem, tileSize]}');
    expect(source).toContain('style={[styles.hintTile, { width: hintWidth');
    expect(source).not.toContain('maxFontSizeMultiplier');
  });
});

describe('StoryRail receipt and retry presentation', () => {
  test('uses viewed state for the circular story ring', () => {
    expect(source).toContain('viewed={g.viewed}');
    expect(source).toContain('viewed && styles.storyBubbleRingViewed');
    expect(source).toContain('`${name}, ${viewed ? \'viewed\' : \'unseen\'} story`');
  });

  test('renders a compact retry action and guards stale loads', () => {
    expect(source).toContain("Couldn’t load My Day · Retry");
    expect(source).toContain('onPress={() => void load()}');
    expect(source).toContain('generation !== loadGeneration.current');
    expect(source).toContain('mountedRef.current');
  });

  test('drops editor and posting results when the rail loses focus or ownership', () => {
    expect(source).toContain('mutationGeneration.current += 1');
    expect(source).toContain('setEditorUri(null)');
    expect(source).toContain('generation !== mutationGeneration.current');
  });
});

describe('StoryRail circular-bubble presentation', () => {
  test('uses a flat circular story canvas with accessible controls', () => {
    expect(source).toContain('const STORY_BUBBLE = 52');
    expect(source).toContain('borderRadius: STORY_BUBBLE / 2');
    expect(source).toContain('borderColor: theme.ink.action');
    expect(source).toContain('accessibilityRole="button"');
    expect(source).not.toContain('const TILE_H = 132');
    expect(source).not.toContain('LinearGradient');
  });

  test('keeps the buddy prompt as an unframed canvas control', () => {
    const hintTile = source.match(/hintTile:\s*\{([\s\S]*?)\},\s*retryTile:/)?.[1];

    expect(hintTile).toContain('width: STORY_ITEM');
    expect(hintTile).not.toContain('backgroundColor');
    expect(hintTile).not.toContain('borderWidth');
    expect(hintTile).not.toContain('borderColor');
    expect(hintTile).not.toContain('borderRadius');
    expect(hintTile).not.toContain('shadow');
    expect(hintTile).not.toContain('elevation');
    expect(source).toContain('accessibilityLabel="Find accountability buddies"');
    expect(source).toContain("onPress={() => router.push('/discover')}");
  });
});
