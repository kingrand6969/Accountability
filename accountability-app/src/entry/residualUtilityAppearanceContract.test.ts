import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = (file: string) => readFileSync(path.resolve(__dirname, file), 'utf8');

const achievementSource = source('./AchievementSharePrompt.tsx');
const createHubSource = source('./CreateHub.tsx');
const uploadSource = source('../activity/UploadStatus.tsx');
const moderationSource = source('../moderation/ModerationGate.tsx');
const helpSource = source('../app/help.tsx');
const legalSource = source('../app/legal/[doc].tsx');

describe('residual utility manual appearance contract', () => {
  test.each([
    ['achievement sharing', achievementSource],
    ['Create hub', createHubSource],
  ])('%s follows the live Light/Dark appearance', (_name, componentSource) => {
    expect(componentSource).toContain('useAppTheme');
    expect(componentSource).toContain('useMemo(() => createStyles(theme, mode), [theme, mode])');
    expect(componentSource).toContain('function createStyles(theme: AppThemeColors, mode: AppThemeMode)');
    expect(componentSource).not.toContain('const styles = StyleSheet.create({');
  });

  test.each([
    ['Help', helpSource],
    ['Legal document', legalSource],
  ])('%s route uses permanent dark semantic chrome', (_name, componentSource) => {
    expect(componentSource).toContain('useAppTheme');
    expect(componentSource).toContain('const { colors: theme } = useAppTheme()');
    expect(componentSource).toContain('useMemo(() => createStyles(theme), [theme])');
    expect(componentSource).toContain('background: theme.surface.canvas');
    expect(componentSource).toContain('ink: theme.ink.primary');
    expect(componentSource).toContain('muted: theme.ink.muted');
    expect(componentSource).not.toContain("mode === 'light'");
    expect(componentSource).not.toContain("mode === 'dark'");
    expect(componentSource).not.toContain('legacyColors');
  });

  test('Help keeps support and legal navigation semantics intact', () => {
    expect(helpSource).toContain("router.push('/legal/privacy')");
    expect(helpSource).toContain("router.push('/legal/terms')");
    expect(helpSource).toContain('Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${subj}`)');
    expect(helpSource).toMatch(/pill:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(helpSource).toMatch(/emailRow:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(helpSource).toMatch(/linkRow:\s*\{[^}]*minHeight: spacing\.touch/s);
  });

  test('activity uploads uses the permanent semantic dark appearance', () => {
    expect(uploadSource).toContain('useAppTheme');
    expect(uploadSource).toContain('useMemo(() => createStyles(theme), [theme])');
    expect(uploadSource).toContain('function createStyles(theme: AppThemeColors)');
    expect(uploadSource).not.toContain("mode === 'light'");
    expect(uploadSource).not.toContain('legacyColors');
    expect(uploadSource).not.toContain('const styles = StyleSheet.create({');
  });

  test('achievement prompt preserves its Light modal and uses a Dark-native action set', () => {
    expect(achievementSource).toContain(
      "card: mode === 'light' ? legacyColors.card : theme.surface.card",
    );
    expect(achievementSource).toContain(
      "ink: mode === 'light' ? legacyColors.text : theme.ink.primary",
    );
    expect(achievementSource).toContain("mode === 'light' ? (");
    expect(achievementSource).toContain('<Button');
    expect(achievementSource).toContain('<DarkPromptButton');
    expect(achievementSource).toContain('minHeight: spacing.touch');
  });

  test('Create keeps its exact cream Light canvas and semantic Dark hierarchy', () => {
    expect(createHubSource).toContain(
      "canvas: mode === 'light' ? '#F4F5F1' : theme.surface.canvas",
    );
    expect(createHubSource).toContain(
      "divider: mode === 'light' ? '#E8E2D7' : theme.border.subtle",
    );
    expect(createHubSource).toContain('backgroundColor: palette.canvas');
    expect(createHubSource).toContain('backgroundColor: palette.card');
    expect(createHubSource).toContain('width: 48');
    expect(createHubSource).toContain('minHeight: 48');
  });

  test('upload states keep privacy-safe behavior and receive readable Dark surfaces', () => {
    expect(uploadSource).toContain('row: theme.surface.raised');
    expect(uploadSource).toContain('aggregate: theme.surface.card');
    expect(uploadSource).toContain('danger: theme.status.danger');
    expect(uploadSource).toContain('action: theme.ink.action');
    expect(uploadSource).toContain('activityUploadsPreview(queued)');
    expect(uploadSource).toContain('if (retryingRef.current) return');
    expect(uploadSource).toContain('hitSlop={2}');
  });

  test('moderation preserves fail-closed sanctions with permanent dark walls and sheets', () => {
    expect(moderationSource).toContain('const { colors: theme } = useAppTheme()');
    expect(moderationSource).toContain('useMemo(() => createStyles(theme), [theme])');
    expect(moderationSource).toContain('sheet: theme.surface.card');
    expect(moderationSource).toContain('sheetInk: theme.ink.primary');
    expect(moderationSource).toContain('sheetSecondary: theme.ink.secondary');
    expect(moderationSource).toContain('sheetAction: theme.ink.action');
    expect(moderationSource).toContain('sheetOnAction: theme.ink.inverse');
    expect(moderationSource).toContain('scrim: theme.interaction.scrim');
    expect(moderationSource).toContain('theme.status.dangerSoft');
    expect(moderationSource).not.toContain("mode === 'light'");
    expect(moderationSource).not.toContain("mode === 'dark'");
    expect(moderationSource).not.toContain('legacyColors');
    expect(moderationSource).not.toMatch(/rgba\(255,255,255/);
    expect(moderationSource).toContain('if (state.banned) return <BanWall');
    expect(moderationSource).toContain('if (ipBanned)');
    expect(moderationSource).toContain('await acknowledgeWarning()');
    expect(moderationSource).toMatch(/wallBtn:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(moderationSource).toMatch(/sheetBtn:\s*\{[^}]*minHeight: spacing\.touch/s);
  });
});
