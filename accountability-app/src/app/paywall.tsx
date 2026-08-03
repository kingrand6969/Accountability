import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useIsPro } from '../pro/ProProvider';
import {
  billingAdapter,
  type BillingAvailability,
  type ProPlan,
} from '../pro/billingAdapter';
import { PRO_PRICING } from '../pro/monetization';
import { Button } from '../ui/Button';
import { colors, font, radius, shadow, spacing } from '../ui/theme';

const BENEFITS = [
  { icon: 'trending-up-outline' as const, text: 'Unlimited history + advanced insights' },
  { icon: 'mic-outline' as const, text: 'Smart reminders & voice commands' },
  { icon: 'barbell-outline' as const, text: 'Full exercise library tools' },
  { icon: 'nutrition-outline' as const, text: 'Diet & calorie tracker' },
  { icon: 'people-outline' as const, text: 'Create challenges for your buddies & city' },
  { icon: 'sparkles-outline' as const, text: 'Early access to new Journey tools' },
];

export default function Paywall() {
  const { isPro, refresh } = useIsPro();
  const [plan, setPlan] = useState<ProPlan>('yearly');
  const [availability, setAvailability] = useState<BillingAvailability | null>(null);
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);

  useEffect(() => {
    let live = true;
    billingAdapter()
      .availability()
      .then((state) => {
        if (live) setAvailability(state);
      })
      .catch(() => {
        if (live) {
          setAvailability({
            ready: false,
            environment: 'development',
            reason: 'provider_error',
            message: 'Could not connect to the store.',
          });
        }
      });
    return () => {
      live = false;
    };
  }, []);

  async function onUpgrade() {
    if (!availability?.ready || busy) return;
    setBusy('purchase');
    try {
      const result = await billingAdapter().purchase(plan);
      if (result.status === 'purchased' || result.status === 'restored') {
        await refresh();
        Alert.alert(
          'Purchase confirmed',
          'We are refreshing your Pro access. Reopen this page if it does not appear immediately.',
        );
      } else if (result.status === 'unavailable') {
        Alert.alert('Purchase unavailable', result.message);
      }
    } catch (error) {
      Alert.alert('Purchase did not complete', String((error as Error).message ?? error));
    } finally {
      setBusy(null);
    }
  }

  async function onRestore() {
    if (busy) return;
    setBusy('restore');
    try {
      const result = await billingAdapter().restore();
      if (result.status === 'restored' || result.status === 'purchased') {
        await refresh();
        Alert.alert(
          'Restore confirmed',
          'We are refreshing your Pro access. Reopen this page if it does not appear immediately.',
        );
      } else if (result.status === 'unavailable') {
        Alert.alert('Restore unavailable', result.message);
      }
    } catch (error) {
      Alert.alert('Could not restore', String((error as Error).message ?? error));
    } finally {
      setBusy(null);
    }
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
        {BENEFITS.map((benefit) => (
          <View key={benefit.text} style={styles.benefitRow}>
            <Ionicons name={benefit.icon} size={18} color={colors.pro} />
            <Text style={styles.benefit}>{benefit.text}</Text>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          </View>
        ))}
      </View>

      {!isPro ? (
        <View style={styles.prices} accessibilityRole="radiogroup">
          <PlanCard
            selected={plan === 'yearly'}
            label="Yearly"
            price={PRO_PRICING.yearly.displayPrice}
            note="only $3.33/mo"
            badge="BEST VALUE"
            onPress={() => setPlan('yearly')}
          />
          <PlanCard
            selected={plan === 'monthly'}
            label="Monthly"
            price={PRO_PRICING.monthly.displayPrice}
            note="per month"
            onPress={() => setPlan('monthly')}
          />
        </View>
      ) : null}

      {isPro ? (
        <View style={styles.proActive}>
          <Ionicons name="star" size={17} color={colors.pro} />
          <Text style={styles.proActiveText}>You&apos;re on Pro</Text>
        </View>
      ) : (
        <>
          {availability?.ready ? (
            <Button
              title={
                plan === 'yearly'
                  ? `Start Pro — ${PRO_PRICING.yearly.displayPrice}/yr`
                  : `Start Pro — ${PRO_PRICING.monthly.displayPrice}/mo`
              }
              onPress={onUpgrade}
              loading={busy === 'purchase'}
              disabled={!!busy}
              style={styles.cta}
            />
          ) : (
            <View style={styles.unavailable} accessibilityRole="alert">
              <Ionicons name="construct-outline" size={18} color={colors.pro} />
              <View style={{ flex: 1 }}>
                <Text style={styles.unavailableTitle}>
                  {availability?.message ?? 'Checking store availability…'}
                </Text>
                {availability?.environment === 'preview' ? (
                  <Text style={styles.unavailableDetail}>
                    Staging does not charge real money or activate a subscription.
                  </Text>
                ) : null}
              </View>
            </View>
          )}
          <Button
            title="Restore purchases"
            onPress={onRestore}
            loading={busy === 'restore'}
            disabled={!!busy}
            variant="ghost"
          />
        </>
      )}

      <Text style={styles.devNote}>
        Cancel anytime through your app-store account. Store prices and taxes may vary.
      </Text>
    </ScrollView>
  );
}

function PlanCard({
  selected,
  label,
  price,
  note,
  badge,
  onPress,
}: {
  selected: boolean;
  label: string;
  price: string;
  note: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.price,
        selected && styles.priceSelected,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${price}, ${note}`}
    >
      {badge ? (
        <View style={styles.bestBadge}>
          <Text style={styles.bestBadgeText}>{badge}</Text>
        </View>
      ) : null}
      <Text style={styles.priceLabel}>{label}</Text>
      <Text style={styles.priceValue}>{price}</Text>
      <Text style={styles.priceNote}>{note}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xxl,
    paddingBottom: 48,
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
    minHeight: 112,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    paddingTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
  unavailable: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.proSoft,
    borderColor: colors.pro,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  unavailableTitle: { fontSize: 14, fontFamily: font.bold, color: colors.pro },
  unavailableDetail: {
    color: colors.textMuted,
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  devNote: {
    color: colors.textFaint,
    fontFamily: font.regular,
    fontSize: 12,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
