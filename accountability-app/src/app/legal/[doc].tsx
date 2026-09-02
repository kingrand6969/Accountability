import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { DOCS, EFFECTIVE_DATE, LEGAL_VERSION, type LegalDocKey } from '../../legal/content';
import {
  contentMax,
  font,
  spacing,
  type AppThemeColors,
} from '../../ui/theme';
import { useAppTheme } from '../../ui/AppThemeProvider';

/** Reader for the Terms of Service / Privacy Policy — reachable from the sign-up
 *  consent line and from Settings. Content lives in one place (legal/content). */
export default function LegalScreen() {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const key: LegalDocKey = doc === 'privacy' ? 'privacy' : 'terms';
  const d = DOCS[key];

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: d.title }} />
      <ScrollView
        style={contentMax}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.meta}>Effective {EFFECTIVE_DATE} · Version {LEGAL_VERSION}</Text>
        <Text style={styles.intro}>{d.intro}</Text>
        {d.sections.map((s) => (
          <View key={s.h} style={styles.section}>
            <Text style={styles.h}>{s.h}</Text>
            {s.p.map((para, i) => (
              <Text key={i} style={styles.p}>
                {para}
              </Text>
            ))}
          </View>
        ))}
        <Text style={styles.foot}>
          This is a plain-language summary of our commitments. If anything here is unclear, contact
          us and we’ll help.
        </Text>
      </ScrollView>
    </View>
  );
}

function legalPalette(theme: AppThemeColors) {
  return {
    background: theme.surface.canvas,
    ink: theme.ink.primary,
    muted: theme.ink.muted,
    faint: theme.ink.muted,
  };
}

function createStyles(theme: AppThemeColors) {
  const palette = legalPalette(theme);
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  body: { padding: spacing.lg, paddingBottom: 48, gap: 4 },
  title: { fontFamily: font.extrabold, fontSize: 24, color: palette.ink },
  meta: { fontFamily: font.medium, fontSize: 12.5, color: palette.faint, marginBottom: spacing.md },
  intro: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: palette.muted, marginBottom: spacing.md },
  section: { marginBottom: spacing.md, gap: 6 },
  h: { fontFamily: font.bold, fontSize: 16, color: palette.ink },
  p: { fontFamily: font.regular, fontSize: 14.5, lineHeight: 22, color: palette.muted },
  foot: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 20,
    color: palette.faint,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
  });
}
