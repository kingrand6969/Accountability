import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useIsPro } from './ProProvider';
import { Button } from '../ui/Button';
import { colors, font, radius, spacing } from '../ui/theme';

/**
 * Wrap any Pro-only feature. Pro users see the feature; free users see an
 * upsell card that opens the paywall.
 */
export function ProLock({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { isPro } = useIsPro();
  const router = useRouter();

  if (isPro) return <>{children}</>;

  return (
    <View style={styles.card}>
      <View style={styles.badge}>
        <Ionicons name="star" size={12} color={colors.pro} />
        <Text style={styles.badgeText}>PRO</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.desc}>{description}</Text> : null}
      <Button
        title="Upgrade to Pro"
        onPress={() => router.push('/paywall')}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.pro,
    backgroundColor: colors.proSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 6,
    alignItems: 'flex-start',
  },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeText: { fontFamily: font.extrabold, color: colors.pro, fontSize: 12 },
  title: { fontSize: 16, fontFamily: font.bold, color: colors.text },
  desc: { color: colors.textMuted, fontFamily: font.regular },
  button: { marginTop: spacing.sm },
});
