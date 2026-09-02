import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('auth and onboarding appearance contract', () => {
  test('keeps root status icons light over the permanent dark canvas', () => {
    const rootLayout = source('src/app/_layout.tsx');

    expect(rootLayout).toContain('<StatusBar style="light" />');
    expect(rootLayout).not.toContain("<StatusBar style={mode === 'dark' ? 'light' : 'dark'} />");
    expect(rootLayout).toContain('contentStyle: { backgroundColor: theme.surface.canvas }');
    expect(rootLayout).not.toContain('<StatusBar backgroundColor=');
  });

  test('keeps the dark auth hero continuous through the native safe areas', () => {
    const authShell = source('src/ui/AuthShell.tsx');

    expect(authShell).toContain("import { SafeAreaView } from 'react-native-safe-area-context';");
    expect(authShell).not.toMatch(/SafeAreaView,[\s\S]*from 'react-native'/);
    expect(authShell).toContain('<StatusBar style="light" />');
    expect(authShell).toContain("import { useAppTheme } from './AppThemeProvider';");
    expect(authShell).toContain('backgroundColor: theme.surface.canvas');
    expect(authShell).toContain('backgroundColor: theme.surface.card');
    expect(authShell).toContain('tint="dark"');
    expect(authShell).toContain('color={theme.ink.action}');
    expect(authShell).toContain('fontFamily: font.brand');
    expect(authShell).toContain('color: theme.ink.primary');
    expect(authShell.match(/\{BRAND_WORDMARK\}<\/Text>/g)).toHaveLength(1);
    expect(authShell).not.toContain('AUTH_CANVAS');
    expect(authShell).not.toMatch(/backgroundColor:\s*['"]#(?:fff|FFFFFF|F4F5F1)['"]/);
  });

  test('binds both onboarding steps and their safe areas to permanent dark roles', () => {
    const onboarding = source('src/app/onboarding.tsx');

    expect(onboarding).toContain("import { StatusBar } from 'expo-status-bar';");
    expect(onboarding).toContain(
      "import { SafeAreaView } from 'react-native-safe-area-context';",
    );
    expect(onboarding).toContain("import { useAppTheme } from '../ui/AppThemeProvider';");
    expect(onboarding).toContain('const { colors: theme } = useAppTheme();');
    expect(onboarding).toContain('const styles = createStyles(theme);');
    expect(onboarding).toContain('<StatusBar style="light" />');
    expect(onboarding).not.toContain('<StatusBar backgroundColor=');
    expect(onboarding).toContain('<SafeAreaView style={styles.screen}>');
    expect(onboarding).toContain('screen: { flex: 1, backgroundColor: theme.surface.canvas }');
    expect(onboarding).not.toContain('const styles = StyleSheet.create({');
    expect(onboarding).not.toContain('backgroundColor: colors.cream');
    expect(onboarding).not.toContain("mode === 'light'");
  });

  test.each([
    'src/app/sign-in.tsx',
    'src/app/sign-up.tsx',
    'src/app/forgot-password.tsx',
    'src/app/verify-email.tsx',
  ])('%s uses permanent dark semantic ink and surfaces without light islands', (file) => {
    const entry = source(file);

    expect(entry).toContain("import { useAppTheme } from '../ui/AppThemeProvider';");
    expect(entry).toContain('const { colors: theme } = useAppTheme();');
    expect(entry).toContain('const styles = useMemo(() => createStyles(theme), [theme]);');
    expect(entry).not.toMatch(/import \{[^}]*\bcolors\b[^}]*\} from ['"]\.\.\/ui\/theme['"]/s);
    expect(entry).not.toContain('colors.primaryDark');
    expect(entry).not.toContain("mode === 'light'");
    expect(entry).not.toMatch(/backgroundColor:\s*['"]#(?:fff|FFFFFF|fef2f2|F4F5F1)['"]/);
  });

  test('signup and verification notify consent revalidation for the authenticated owner', () => {
    const signUp = source('src/app/sign-up.tsx');
    const verifyEmail = source('src/app/verify-email.tsx');

    expect(signUp).toContain('await recordConsent(data.session.user.id)');
    expect(verifyEmail).toContain('const { data, error } = await supabase.auth.verifyOtp');
    expect(verifyEmail).toContain('await recordConsent(data.session.user.id)');
  });
});
