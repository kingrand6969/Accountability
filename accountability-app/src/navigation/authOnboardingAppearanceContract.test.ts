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
    expect(authShell).toContain('backgroundColor: AUTH_CANVAS');
  });

  test('binds both onboarding steps and their safe areas to the manual appearance', () => {
    const onboarding = source('src/app/onboarding.tsx');

    expect(onboarding).toContain("import { StatusBar } from 'expo-status-bar';");
    expect(onboarding).toContain(
      "import { SafeAreaView } from 'react-native-safe-area-context';",
    );
    expect(onboarding).toContain("import { useAppTheme } from '../ui/AppThemeProvider';");
    expect(onboarding).toContain('const { colors: theme, mode } = useAppTheme();');
    expect(onboarding).toContain('const styles = createStyles(theme);');
    expect(onboarding).toContain("<StatusBar style={mode === 'dark' ? 'light' : 'dark'} />");
    expect(onboarding).not.toContain('<StatusBar backgroundColor=');
    expect(onboarding).toContain('<SafeAreaView style={styles.screen}>');
    expect(onboarding).toContain('screen: { flex: 1, backgroundColor: theme.surface.canvas }');
    expect(onboarding).not.toContain('const styles = StyleSheet.create({');
    expect(onboarding).not.toContain('backgroundColor: colors.cream');
  });
});
