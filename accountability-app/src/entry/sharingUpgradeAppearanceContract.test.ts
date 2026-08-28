import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const winCardSource = readFileSync(require.resolve('../app/win-card'), 'utf8');
const inviteCardSource = readFileSync(require.resolve('../app/invite-card'), 'utf8');
const publicShareSource = readFileSync(require.resolve('../app/share/[id]'), 'utf8');
const paywallSource = readFileSync(require.resolve('../app/paywall'), 'utf8');

describe('sharing and upgrade appearance contract', () => {
  test('Win Card themes its controls without altering captured proof or guarded side effects', () => {
    expect(winCardSource).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(winCardSource).toContain('const { colors: theme } = useAppTheme();');
    expect(winCardSource).toContain('useMemo(() => createStyles(theme), [theme])');
    expect(winCardSource).toContain('canvas: theme.surface.canvas');
    expect(winCardSource).toContain('surface: theme.surface.card');
    expect(winCardSource).toContain('heading: theme.surface.muted');
    expect(winCardSource).toContain('action: theme.ink.action');
    expect(winCardSource).toContain('onAction: theme.ink.inverse');
    expect(winCardSource).toContain('pendingBorder: theme.status.attention');
    expect(winCardSource).toContain('backgroundColor: palette.surface');
    expect(winCardSource).not.toContain("mode === 'light'");
    expect(winCardSource).not.toContain("mode === 'dark'");
    expect(winCardSource).not.toContain("surface: '#FFFFFF'");
    expect(winCardSource).toContain('<ProofCaptureCard context={captureContext} backgroundUri={shareBackgroundUri} />');
    expect(winCardSource).toContain('publishFlexFeedPost({');
    expect(winCardSource).toContain('saveImageToMemories(uri, null, null, expectedProofOwner(token))');
    expect(winCardSource).toContain('hitSlop={2}');
  });

  test('Invite Card keeps its export artwork exact while adapting the surrounding shell', () => {
    expect(inviteCardSource).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(inviteCardSource).toContain('const { colors: theme } = useAppTheme();');
    expect(inviteCardSource).toContain('useMemo(() => createStyles(theme), [theme])');
    expect(inviteCardSource).toContain('canvas: theme.surface.canvas');
    expect(inviteCardSource).toContain('title: theme.ink.primary');
    expect(inviteCardSource).toContain('muted: theme.ink.muted');
    expect(inviteCardSource).toContain('action: theme.ink.action');
    expect(inviteCardSource).toContain('onAction: theme.ink.inverse');
    expect(inviteCardSource).not.toContain("mode === 'light'");
    expect(inviteCardSource).not.toContain("mode === 'dark'");
    expect(inviteCardSource).toContain("colors={['#111411', '#263223', '#446B00']}");
    expect(inviteCardSource).toContain("brand: { color: '#fff'");
    expect(inviteCardSource).toContain("avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#fff' }");
    expect(inviteCardSource).toContain("require('../../assets/images/logo.png')");
    expect(inviteCardSource).toContain("dialogTitle: 'Invite a buddy to AccountAbility'");
    expect(inviteCardSource).toContain('backgroundColor: palette.action');
  });

  test('public Share handoff remains safe in permanent dark appearance', () => {
    expect(publicShareSource).toContain("import { useAppTheme } from '../../ui/AppThemeProvider'");
    expect(publicShareSource).toContain('const { colors: theme } = useAppTheme();');
    expect(publicShareSource).toContain('useMemo(() => createStyles(theme), [theme])');
    expect(publicShareSource).toContain('canvas: theme.surface.canvas');
    expect(publicShareSource).toContain('ink: theme.ink.primary');
    expect(publicShareSource).toContain('muted: theme.ink.muted');
    expect(publicShareSource).toContain('action: theme.ink.action');
    expect(publicShareSource).toContain('onAction: theme.ink.inverse');
    expect(publicShareSource).not.toContain("mode === 'light'");
    expect(publicShareSource).not.toContain("mode === 'dark'");
    expect(publicShareSource).not.toContain('legacyColors');
    expect(publicShareSource).toContain('canonicalPublicShareDestination(shareId)');
    expect(publicShareSource).toContain('executeShareHandoff({');
    expect(publicShareSource).toContain('await WebBrowser.openBrowserAsync(webUrl)');
    expect(publicShareSource).toContain('minHeight: spacing.touch');
  });

  test('Paywall themes all non-hero surfaces and keeps purchase and restore semantics', () => {
    expect(paywallSource).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(paywallSource).toContain('const { colors: theme } = useAppTheme();');
    expect(paywallSource).toContain('useMemo(() => createStyles(theme), [theme])');
    expect(paywallSource).toContain('canvas: theme.surface.canvas');
    expect(paywallSource).toContain("colors={['#263223', '#53634E', '#111411']}");
    expect(paywallSource).toContain('tint="dark"');
    expect(paywallSource).toContain('await billingAdapter().purchase(plan)');
    expect(paywallSource).toContain('await billingAdapter().restore()');
    expect(paywallSource).toContain('<PaywallRestoreButton');
    expect(paywallSource).toContain('backgroundColor: palette.restoreSurface');
    expect(paywallSource).toContain('restorePressed: { opacity: 0.92 }');
    expect(paywallSource).toContain('minHeight: spacing.touch');
    expect(paywallSource).not.toContain("mode === 'light'");
    expect(paywallSource).not.toMatch(/tint=["']light["']/);
  });
});
