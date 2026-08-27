import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const header = readFileSync(require.resolve('./SocialBrandHeader'), 'utf8');
const feed = readFileSync(require.resolve('../app/(app)/index'), 'utf8');
const storyRail = readFileSync(require.resolve('../stories/StoryRail'), 'utf8');

describe('Feed first-impression design', () => {
  test('renders the approved Accountability lockup instead of the legacy casing', () => {
    expect(header).toContain("import { BRAND_WORDMARK } from '../ui/brandGeometry'");
    expect(header).toContain('{BRAND_WORDMARK}');
    expect(header).not.toContain('Account<Text style={styles.ability}>Ability</Text>');
    expect(header).not.toContain('accessibilityLabel="AccountAbility"');
  });

  test('starts the Feed with My Day and no boxed composer', () => {
    expect(feed).not.toContain('styles.promptWrap');
    expect(feed).not.toContain('styles.composerDivider');
    expect(feed).not.toContain('styles.quickShareDivider');
    expect(feed).toContain('onCreate={() => setCreateOpen(true)}');
    expect(feed).toMatch(/const feedHeader = \(\s*<>\s*\{myId \? \(\s*<StoryRail/);
  });

  test('keeps My Day and its add control separate on the circular story rail', () => {
    expect(storyRail).toContain('<Text style={styles.createLabel}>My Day</Text>');
    expect(storyRail).toContain('const STORY_BUBBLE = 52');
    expect(storyRail).toContain('style={styles.createPlus}');
    expect(storyRail).not.toContain("My Day{'\\n'}{meName?.trim().split(/\\s+/)[0] || 'You'}");
  });
});
