import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import { useAppTheme } from '../ui/AppThemeProvider';
import {
  font,
  radius,
  shadow,
  spacing,
  type AppThemeColors,
} from '../ui/theme';

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
  const { colors: theme } = useAppTheme();
  const palette = useMemo(() => paywallPalette(theme), [theme]);
  const styles = useMemo(() => createStyles(theme), [theme]);
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
          colors={['#263223', '#53634E', '#111411']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroIconWrap}>
            <BlurView
              intensity={24}
              tint="dark"
              style={[StyleSheet.absoluteFill, { borderRadius: 36 }]}
            />
            <Ionicons name="star" size={32} color={theme.ink.action} />
          </View>
          <Text style={styles.title}>Mantle Pro</Text>
          <Text style={styles.subtitle}>Get more out of every day.</Text>
        </LinearGradient>
      </View>

      <View style={styles.card}>
        {BENEFITS.map((benefit) => (
          <View key={benefit.text} style={styles.benefitRow}>
            <Ionicons name={benefit.icon} size={18} color={palette.proAccent} />
            <Text style={styles.benefit}>{benefit.text}</Text>
            <Ionicons name="checkmark-circle" size={18} color={palette.success} />
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
          <Ionicons name="star" size={17} color={palette.proAccent} />
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
              <Ionicons name="construct-outline" size={18} color={palette.proAccent} />
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
          <PaywallRestoreButton
            title="Restore purchases"
            onPress={onRestore}
            busy={busy === 'restore'}
            disabled={!!busy}
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
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

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

function PaywallRestoreButton({
  title,
  onPress,
  busy,
  disabled,
}: {
  title: string;
  onPress: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const palette = useMemo(() => paywallPalette(theme), [theme]);
  const [scale] = useState(() => new Animated.Value(1));
  const inactive = busy || disabled;

  function pressTo(value: number) {
    Animated.spring(scale, {
      toValue: value,
      speed: 40,
      bounciness: value === 1 ? 8 : 0,
      useNativeDriver: true,
    }).start();
  }

  return (
    <Animated.View style={[styles.restoreWrap, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => !inactive && pressTo(0.96)}
        onPressOut={() => pressTo(1)}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ busy, disabled: inactive }}
        style={({ pressed }) => [
          styles.restoreButton,
          pressed && !inactive && styles.restorePressed,
          inactive && styles.restoreDisabled,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={palette.restoreText} />
        ) : (
          <Text style={styles.restoreText}>{title}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

function paywallPalette(theme: AppThemeColors) {
  return {
    canvas: theme.surface.canvas,
    surface: theme.surface.card,
    border: theme.border.subtle,
    ink: theme.ink.primary,
    muted: theme.ink.muted,
    faint: theme.ink.muted,
    proAccent: theme.ink.action,
    proSurface: theme.surface.muted,
    success: theme.status.success,
    restoreSurface: theme.surface.raised,
    restoreText: theme.ink.primary,
    cardShadow: theme.surface.canvas,
  } as const;
}

const createStyles = (theme: AppThemeColors) => {
  const palette = paywallPalette(theme);

  return StyleSheet.create({
  container: {
    padding: spacing.xxl,
    paddingBottom: 48,
    gap: spacing.md,
    backgroundColor: palette.canvas,
  },
  pressed: { opacity: 0.8 },
  heroWrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.xs,
    shadowColor: theme.ink.action,
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
    borderColor: theme.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: 26, fontFamily: font.extrabold, color: theme.ink.primary },
  subtitle: { color: theme.ink.secondary, fontFamily: font.medium, fontSize: 15 },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
    shadowColor: palette.cardShadow,
  },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefit: { fontSize: 15, fontFamily: font.medium, color: palette.ink, flex: 1 },
  prices: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  price: {
    flex: 1,
    minHeight: 112,
    borderWidth: 2,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    paddingTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: palette.surface,
  },
  priceSelected: { borderColor: palette.proAccent, backgroundColor: palette.proSurface },
  bestBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: theme.ink.action,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  bestBadgeText: { color: theme.ink.inverse, fontSize: 10, fontFamily: font.extrabold, letterSpacing: 0.6 },
  priceLabel: { fontFamily: font.bold, color: palette.ink },
  priceValue: { fontSize: 24, fontFamily: font.extrabold, color: palette.ink },
  priceNote: { color: palette.muted, fontFamily: font.medium, fontSize: 12 },
  cta: { marginTop: spacing.sm },
  proActive: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: palette.proSurface,
    borderColor: palette.proAccent,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  proActiveText: { fontSize: 16, fontFamily: font.bold, color: palette.proAccent },
  unavailable: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.proSurface,
    borderColor: palette.proAccent,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  unavailableTitle: { fontSize: 14, fontFamily: font.bold, color: palette.proAccent },
  unavailableDetail: {
    color: palette.muted,
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  devNote: {
    color: palette.faint,
    fontFamily: font.regular,
    fontSize: 12,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  restoreWrap: { alignSelf: 'stretch' },
  restoreButton: {
    minHeight: spacing.touch,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: palette.restoreSurface,
  },
  restoreText: { color: palette.restoreText, fontFamily: font.bold, fontSize: 16 },
  restorePressed: { opacity: 0.92 },
  restoreDisabled: { opacity: 0.5 },
  });
};
