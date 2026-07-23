import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { DOCS, EFFECTIVE_DATE, type LegalDocKey } from '../../legal/content';
import { colors, contentMax, font, spacing } from '../../ui/theme';

/** Reader for the Terms of Service / Privacy Policy — reachable from the sign-up
 *  consent line and from Settings. Content lives in one place (legal/content). */
export default function LegalScreen() {
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
        <Text style={styles.meta}>Effective {EFFECTIVE_DATE}</Text>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.lg, paddingBottom: 48, gap: 4 },
  title: { fontFamily: font.extrabold, fontSize: 24, color: colors.text },
  meta: { fontFamily: font.medium, fontSize: 12.5, color: colors.textFaint, marginBottom: spacing.md },
  intro: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: colors.textMuted, marginBottom: spacing.md },
  section: { marginBottom: spacing.md, gap: 6 },
  h: { fontFamily: font.bold, fontSize: 16, color: colors.text },
  p: { fontFamily: font.regular, fontSize: 14.5, lineHeight: 22, color: colors.textMuted },
  foot: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textFaint,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
});
