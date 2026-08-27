import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const shell = readFileSync(require.resolve('../app/buddy-card/[id]'), 'utf8');
const editor = readFileSync(require.resolve('../app/buddy-card-edit'), 'utf8');
const publicFace = readFileSync(require.resolve('./PublicBuddyCardFace'), 'utf8');

function publicFaceInvocation(source: string) {
  const start = source.indexOf('<PublicBuddyCardFace');
  return source.slice(start, source.indexOf('/>', start));
}

describe('Buddy Card supporting shell appearance contract', () => {
  test('binds only the surrounding screen chrome to the manual appearance', () => {
    expect(shell).toContain("import { useAppTheme } from '../../ui/AppThemeProvider'");
    expect(shell).toContain('const { colors: theme } = useAppTheme()');
    expect(shell).toContain('const palette = useMemo(() => buddyCardShellPalette(theme), [theme])');
    expect(shell).toContain('const styles = useMemo(() => createStyles(theme), [theme])');
    expect(shell).toContain('function buddyCardShellPalette(theme: AppThemeColors)');
    expect(shell).not.toMatch(/\bcolors\./);
  });

  test('uses permanent semantic dark shell roles without touching the public card artwork', () => {
    expect(shell).toContain('canvas: theme.surface.canvas');
    expect(shell).toContain('surface: theme.surface.card');
    expect(shell).toContain('ink: theme.ink.primary');
    expect(shell).toContain('secondaryInk: theme.ink.secondary');
    expect(shell).toContain('mutedInk: theme.ink.muted');
    expect(shell).toContain('border: theme.border.subtle');
    expect(shell).toContain('chipSurface: theme.surface.muted');
    expect(shell).toContain('action: theme.ink.action');
    expect(shell).toContain('success: theme.status.success');
    expect(shell).not.toContain("mode === 'light'");
  });

  test('themes loading, error, header action, About, posts and relationship chrome', () => {
    expect(shell).toContain('<ActivityIndicator size="large" color={palette.action} />');
    expect(shell).toContain('color={palette.faintInk}');
    expect(shell).toContain('color={palette.ink}');
    expect(shell).toContain('color={palette.action}');
    expect(shell).toContain('color={palette.success}');
    expect(shell).toContain('backgroundColor: palette.canvas');
    expect(shell).toContain('backgroundColor: palette.surface');
    expect(shell).toContain('borderColor: palette.border');
    expect(shell).toContain('backgroundColor: palette.chipSurface');
    expect(shell).toContain('optionAction: { minWidth: 48, minHeight: 48');
    expect(shell).toContain('retry: {');
    expect(shell).toContain('minHeight: 48');
  });

  test('does not theme or otherwise fork the approved public card face', () => {
    expect(publicFace).toContain("resolveBuddyCardPalette(card.palette_key, 'light')");
    const invocation = publicFaceInvocation(shell);
    expect(invocation).not.toContain('theme=');
    expect(invocation).not.toContain('mode=');
    expect(invocation).not.toContain('scheme=');
    expect(invocation).not.toContain('palette=');
  });

  test('themes the editor shell semantically while preserving swatches and shareable artwork', () => {
    expect(editor).toContain('const { colors: theme } = useAppTheme();');
    expect(editor).toContain('const styles = useMemo(() => createStyles(theme), [theme]);');
    expect(editor).toContain('function createStyles(theme: AppThemeColors)');
    expect(editor).toContain('backgroundColor: theme.surface.canvas');
    expect(editor).toContain('backgroundColor: theme.surface.card');
    expect(editor).toContain('backgroundColor: theme.surface.raised');
    expect(editor).toContain('borderColor: theme.border.subtle');
    expect(editor).toContain('color: theme.ink.primary');
    expect(editor).toContain('color: theme.ink.muted');
    expect(editor).toContain('borderColor: theme.ink.action');
    expect(editor).toContain('true: theme.ink.action');
    expect(editor).toContain('resolveBuddyCardPalette(optionKey, scheme)');
    expect(editor).toContain('backgroundColor: editorPalette.canvas');
    expect(editor).toContain('<PublicBuddyCardFace');
  });

  test('retains privacy, account-generation, navigation and action boundaries', () => {
    expect(shell).toContain("const ownerView = accessMode === 'self' && currentUserId === id");
    expect(shell).toContain("const isBuddy = accessMode === 'buddy'");
    expect(shell).toContain("accessMode === 'public'");
    expect(shell).toContain('loadContextIsCurrent(loadToken)');
    expect(shell).toContain('moderationContextIsCurrent(context, actionToken)');
    expect(shell).toContain("router.push('/buddy-card-edit' as never)");
    expect(shell).toContain("pathname: '/buddy-chat/[id]'");
    expect(shell).toContain("pathname: '/post/[id]'");
  });
});
