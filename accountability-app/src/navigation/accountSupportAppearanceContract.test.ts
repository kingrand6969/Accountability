import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = (file: string) => readFileSync(path.resolve(__dirname, file), 'utf8');

const editProfileSource = source('../app/edit-profile.tsx');
const helpSource = source('../app/help.tsx');
const legalSource = source('../app/legal/[doc].tsx');
const booksSource = source('../app/books.tsx');

describe('Account and support manual appearance contract', () => {
  test('edit profile uses permanent dark semantic chrome', () => {
    expect(editProfileSource).toContain('const { colors: theme } = useAppTheme()');
    expect(editProfileSource).toContain('useMemo(() => createStyles(theme), [theme])');
    expect(editProfileSource).toContain('background: theme.surface.canvas');
    expect(editProfileSource).toContain('card: theme.surface.card');
    expect(editProfileSource).toContain('field: theme.surface.raised');
    expect(editProfileSource).toContain('ink: theme.ink.primary');
    expect(editProfileSource).toContain('border: theme.border.subtle');
    expect(editProfileSource).toContain('danger: theme.status.danger');
    expect(editProfileSource).not.toContain("mode === 'light'");
  });

  test.each([
    ['help', helpSource],
    ['legal reader', legalSource],
    ['books', booksSource],
  ])('%s follows the live Light/Dark appearance', (_name, screenSource) => {
    expect(screenSource).toContain('useAppTheme');
    expect(screenSource).toContain('const { colors: theme, mode } = useAppTheme()');
    expect(screenSource).toContain('useMemo(() => createStyles(theme, mode), [theme, mode])');
    expect(screenSource).not.toContain('const styles = StyleSheet.create({');
  });

  test.each([
    ['help', helpSource],
    ['books', booksSource],
  ])('%s keeps its exact Light surfaces and gains semantic Dark equivalents', (_name, screenSource) => {
    expect(screenSource).toContain(
      "background: mode === 'light' ? legacyColors.background : theme.surface.canvas",
    );
    expect(screenSource).toContain(
      "card: mode === 'light' ? legacyColors.card : theme.surface.card",
    );
    expect(screenSource).toContain(
      "field: mode === 'light' ? legacyColors.surfaceAlt : theme.surface.raised",
    );
    expect(screenSource).toContain(
      "ink: mode === 'light' ? legacyColors.text : theme.ink.primary",
    );
    expect(screenSource).toContain(
      "border: mode === 'light' ? legacyColors.border : theme.border.subtle",
    );
    expect(screenSource).toContain('backgroundColor: palette.background');
    expect(screenSource).toContain('backgroundColor: palette.card');
    expect(screenSource).toContain('borderColor: palette.border');
  });

  test('profile editing retains owner data, privacy fields, validation and account deletion guards', () => {
    expect(editProfileSource).toContain('const { session } = useAuth()');
    expect(editProfileSource).toContain('const birthdayError = validateBirthday(birthday)');
    expect(editProfileSource).toContain('gender_private: genderPrivate');
    expect(editProfileSource).toContain('sexual_orientation_private: orientationPrivate');
    expect(editProfileSource).toContain('birthday_private: birthdayPrivate');
    expect(editProfileSource).toContain("'Delete your account?'");
    expect(editProfileSource).toContain("Alert.alert('Are you absolutely sure?'");
    expect(editProfileSource).toContain("text: 'Delete forever'");
    expect(editProfileSource).toContain('prepareAccountDeletionDraftCleanup(deletionDependencies())');
    expect(editProfileSource).toContain('if (!tryBeginAccountDeletionAttempt(deletionAttempt)) return');
    expect(editProfileSource).toContain('ImagePicker.requestMediaLibraryPermissionsAsync()');
  });

  test('support keeps authenticated submission, validation, email fallback and legal routes', () => {
    expect(helpSource).toContain('if (!body.trim() || busy) return');
    expect(helpSource).toContain('await sendSupportMessage(kind, body, subject)');
    expect(helpSource).toContain('Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${subj}`)');
    expect(helpSource).toContain("router.push('/legal/terms')");
    expect(helpSource).toContain("router.push('/legal/privacy')");
    expect(helpSource).toContain('keyboardShouldPersistTaps="handled"');
  });

  test('legal reader retains the canonical copy selection and every document section', () => {
    expect(legalSource).toContain("const key: LegalDocKey = doc === 'privacy' ? 'privacy' : 'terms'");
    expect(legalSource).toContain('const d = DOCS[key]');
    expect(legalSource).toContain('<Stack.Screen options={{ title: d.title }} />');
    expect(legalSource).toContain('Effective {EFFECTIVE_DATE}');
    expect(legalSource).toContain('{d.sections.map((s) => (');
    expect(legalSource).toContain('{s.p.map((para, i) => (');
  });

  test('books keeps Pro gating, preference persistence and external-reader behavior', () => {
    expect(booksSource).toContain('const { isPro, loading: proLoading } = useIsPro()');
    expect(booksSource).toContain('setBookPrefs(next).catch(() => {})');
    expect(booksSource).toContain('if (interests.length === 0) return; // keep at least one');
    expect(booksSource).toContain('await WebBrowser.openBrowserAsync(book.readUrl)');
    expect(booksSource).toContain("router.push('/paywall')");
  });

  test('direct account and support controls retain at least a 48dp target', () => {
    expect(editProfileSource).toContain('hitSlop={8}');
    expect(editProfileSource).toMatch(/input:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(editProfileSource).toMatch(/signOutButton:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(editProfileSource).toMatch(/deleteButton:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(helpSource).toMatch(/pill:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(helpSource).toMatch(/emailRow:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(helpSource).toMatch(/linkRow:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(booksSource).toMatch(/chip:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(booksSource).toMatch(/toggleBtn:\s*\{[^}]*minHeight: spacing\.touch/s);
  });
});
