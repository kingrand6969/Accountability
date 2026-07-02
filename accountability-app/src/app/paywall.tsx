import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsPro } from '../pro/ProProvider';
import { Button } from '../ui/Button';
import { colors, font, radius, shadow, spacing } from '../ui/theme';

const BENEFITS = [
  { icon: 'remove-circle-outline' as const, text: 'No ads' },
  { icon: 'trending-up-outline' as const, text: 'Unlimited history + advanced insights' },
  { icon: 'mic-outline' as const, text: 'Smart reminders & voice commands' },
  { icon: 'barbell-outline' as const, text: 'Full exercise library tools' },
  { icon: 'nutrition-outline' as const, text: 'Diet & calorie tracker' },
  { icon: 'people-outline' as const, text: 'Accountability circles & challenges' },
  { icon: 'download-outline' as const, text: 'Data export (PDF / CSV)' },
];

type Plan = 'yearly' | 'monthly';

export default function Paywall() {
  const { isPro } = useIsPro();
  const [plan, setPlan] = useState<Plan>('yearly');

  function onUpgrade() {
    Alert.alert(
      'Subscriptions coming soon',
      'In-app purchases launch with the store release — this is where checkout will open.',
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="star" size={34} color={colors.pro} />
        </View>
        <Text style={styles.title}>Accountability Pro</Text>
        <Text style={styles.subtitle}>Get more out of every day.</Text>
      </View>

      <View style={styles.card}>
        {BENEFITS.map((b) => (
          <View key={b.text} style={styles.benefitRow}>
            <Ionicons name={b.icon} size={18} color={colors.pro} />
            <Text style={styles.benefit}>{b.text}</Text>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          </View>
        ))}
      </View>

      <View style={styles.prices}>
        <Pressable
          style={({ pressed }) => [
            styles.price,
            plan === 'yearly' && styles.priceSelected,
            pressed && styles.pressed,
          ]}
          onPress={() => setPlan('yearly')}
        >
          <View style={styles.bestBadge}>
            <Text style={styles.bestBadgeText}>BEST VALUE</Text>
          </View>
          <Text style={styles.priceLabel}>Yearly</Text>
          <Text style={styles.priceValue}>$29.99</Text>
          <Text style={styles.priceNote}>only $2.50/mo</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.price,
            plan === 'monthly' && styles.priceSelected,
            pressed && styles.pressed,
          ]}
          onPress={() => setPlan('monthly')}
        >
          <Text style={styles.priceLabel}>Monthly</Text>
          <Text style={styles.priceValue}>$3.99</Text>
          <Text style={styles.priceNote}>per month</Text>
        </Pressable>
      </View>

      {isPro ? (
        <View style={styles.proActive}>
          <Ionicons name="star" size={17} color={colors.pro} />
          <Text style={styles.proActiveText}>You&apos;re on Pro</Text>
        </View>
      ) : (
        <Button
          title={plan === 'yearly' ? 'Start Pro — $29.99/yr' : 'Start Pro — $3.99/mo'}
          onPress={onUpgrade}
          style={styles.cta}
        />
      )}

      <Text style={styles.devNote}>
        Subscriptions launch with the store release — checkout opens here. Cancel anytime.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xxl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  pressed: { opacity: 0.8 },
  hero: { alignItems: 'center', gap: 4, marginBottom: spacing.xs },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.proSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: { fontSize: 26, fontFamily: font.extrabold, color: colors.text },
  subtitle: { color: colors.textMuted, fontFamily: font.regular, fontSize: 15 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefit: { fontSize: 15, fontFamily: font.medium, color: colors.text, flex: 1 },
  prices: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  price: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    paddingTop: 18,
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.card,
  },
  priceSelected: { borderColor: colors.pro, backgroundColor: colors.proSoft },
  bestBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: colors.pro,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  bestBadgeText: { color: '#fff', fontSize: 10, fontFamily: font.extrabold, letterSpacing: 0.6 },
  priceLabel: { fontFamily: font.bold, color: colors.text },
  priceValue: { fontSize: 24, fontFamily: font.extrabold, color: colors.text },
  priceNote: { color: colors.textMuted, fontFamily: font.medium, fontSize: 12 },
  cta: { marginTop: spacing.sm, backgroundColor: colors.pro },
  proActive: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.proSoft,
    borderColor: colors.pro,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  proActiveText: { fontSize: 16, fontFamily: font.bold, color: colors.pro },
  devNote: {
    color: colors.textFaint,
    fontFamily: font.regular,
    fontSize: 12,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
