import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useIsPro } from '../pro/ProProvider';
import { CHECKOUT_ENABLED } from '../pro/monetization';
import { Button } from '../ui/Button';
import { colors, font, radius, shadow, spacing } from '../ui/theme';

const BENEFITS = [
  { icon: 'remove-circle-outline' as const, text: 'No ads' },
  { icon: 'trending-up-outline' as const, text: 'Unlimited history + advanced insights' },
  { icon: 'mic-outline' as const, text: 'Smart reminders & voice commands' },
  { icon: 'barbell-outline' as const, text: 'Full exercise library tools' },
  { icon: 'nutrition-outline' as const, text: 'Diet & calorie tracker' },
  { icon: 'people-outline' as const, text: 'Create challenges for your buddies & city' },
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
      <View style={styles.heroWrap}>
        <LinearGradient
          colors={['#8b5cf6', '#7c3aed', '#5b21b6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroIconWrap}>
            <BlurView
              intensity={24}
              tint="light"
              style={[StyleSheet.absoluteFill, { borderRadius: 36 }]}
            />
            <Ionicons name="star" size={32} color="#fde68a" />
          </View>
          <Text style={styles.title}>AccountAbility Pro</Text>
          <Text style={styles.subtitle}>Get more out of every day.</Text>
        </LinearGradient>
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

      {CHECKOUT_ENABLED && !isPro && (
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
          <Text style={styles.priceValue}>$19.99</Text>
          <Text style={styles.priceNote}>only $1.67/mo</Text>
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
      )}

      {isPro ? (
        <View style={styles.proActive}>
          <Ionicons name="star" size={17} color={colors.pro} />
          <Text style={styles.proActiveText}>You&apos;re on Pro</Text>
        </View>
      ) : CHECKOUT_ENABLED ? (
        <Button
          title={plan === 'yearly' ? 'Start Pro — $19.99/yr' : 'Start Pro — $3.99/mo'}
          onPress={onUpgrade}
          style={styles.cta}
        />
      ) : (
        <View style={styles.comingSoon}>
          <Ionicons name="sparkles-outline" size={17} color={colors.pro} />
          <Text style={styles.comingSoonText}>
            Pro is launching soon — these features are on the way.
          </Text>
        </View>
      )}

      {CHECKOUT_ENABLED && (
        <Text style={styles.devNote}>
          Subscriptions launch with the store release — checkout opens here. Cancel anytime.
        </Text>
      )}
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
  heroWrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.xs,
    shadowColor: colors.pro,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  hero: { alignItems: 'center', gap: 4, padding: spacing.xl, paddingVertical: spacing.xxl },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: 26, fontFamily: font.extrabold, color: '#fff' },
  subtitle: { color: '#ede9fe', fontFamily: font.medium, fontSize: 15 },
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
  comingSoon: {
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
  comingSoonText: { fontSize: 14, fontFamily: font.bold, color: colors.pro, flexShrink: 1 },
  devNote: {
    color: colors.textFaint,
    fontFamily: font.regular,
    fontSize: 12,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
