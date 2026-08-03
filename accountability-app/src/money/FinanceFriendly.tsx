import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { formatAmount } from './categories';
import { colors, font, radius, shadow, spacing } from '../ui/theme';

export type FriendlyFinanceSummary = {
  available: number;
  spent: number;
  saved: number;
  needsAttention: number;
};

export function usesLargeTextFinanceLayout(fontScale: number): boolean {
  return fontScale >= 1.75;
}

export function buildFriendlyFinanceSummary(input: FriendlyFinanceSummary): FriendlyFinanceSummary {
  return {
    available: input.available,
    spent: Math.max(0, input.spent),
    saved: Math.max(0, input.saved),
    needsAttention: Math.max(0, input.needsAttention),
  };
}

type Action = {
  label: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

export function FriendlyFinanceHeader({
  summary,
  monthLabel,
  insight,
  actions,
  onSwitchMode,
}: {
  summary: FriendlyFinanceSummary;
  monthLabel: string;
  insight?: string | null;
  actions: Action[];
  onSwitchMode: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const largeText = usesLargeTextFinanceLayout(fontScale);
  const tiles = [
    { label: 'Available', value: summary.available, icon: 'wallet-outline' as const, tone: colors.navy },
    { label: 'Spent', value: summary.spent, icon: 'cart-outline' as const, tone: '#9A3412' },
    { label: 'Saved', value: summary.saved, icon: 'leaf-outline' as const, tone: '#047857' },
    {
      label: 'Needs attention',
      value: summary.needsAttention,
      icon: 'calendar-outline' as const,
      tone: '#9A3412',
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={[styles.titleRow, largeText && styles.titleRowLargeText]}>
        <View style={styles.titleCopy}>
          <Text style={styles.eyebrow}>{monthLabel}</Text>
          <Text style={styles.title}>Your money, at a glance.</Text>
          <Text style={styles.subtitle}>A calm view of what you can use and what needs attention.</Text>
        </View>
        <Pressable
          onPress={onSwitchMode}
          accessibilityRole="button"
          accessibilityLabel="Switch to Accounting mode"
          accessibilityHint="Shows detailed charts and controls"
          style={({ pressed }) => [
            styles.modeButton,
            largeText && styles.modeButtonLargeText,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="calculator-outline" size={17} color={colors.navy} />
          <Text style={styles.modeText}>Accounting</Text>
        </Pressable>
      </View>

      <View style={styles.summaryGrid} accessibilityLabel="Money summary">
        {tiles.map((tile) => (
          <View
            key={tile.label}
            style={[styles.summaryTile, largeText && styles.summaryTileLargeText]}
          >
            <View style={[styles.tileIcon, { backgroundColor: `${tile.tone}12` }]}>
              <Ionicons name={tile.icon} size={19} color={tile.tone} />
            </View>
            <Text style={styles.tileLabel}>{tile.label}</Text>
            <Text style={[styles.tileValue, { color: tile.tone }]}>
              {formatAmount(tile.value)}
            </Text>
          </View>
        ))}
      </View>

      {insight ? (
        <View style={styles.insight}>
          <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
          <Text style={styles.insightText}>{insight}</Text>
        </View>
      ) : null}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>What would you like to do?</Text>
        <Text style={styles.sectionNote}>Your records stay private.</Text>
      </View>
      <View style={styles.actionList}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityHint={action.detail}
            style={({ pressed }) => [
              styles.action,
              largeText && styles.actionLargeText,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.actionIcon}>
              <Ionicons name={action.icon} size={20} color={colors.primary} />
            </View>
            <View style={styles.actionCopy}>
              <Text style={styles.actionLabel}>{action.label}</Text>
              <Text style={styles.actionDetail}>{action.detail}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>

      <View style={styles.transactionsHead}>
        <View>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <Text style={styles.actionDetail}>Income and spending from this month</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.cream,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  titleRowLargeText: { flexDirection: 'column', alignItems: 'stretch' },
  titleCopy: { flex: 1 },
  eyebrow: {
    color: colors.primary,
    fontFamily: font.bold,
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.navy,
    fontFamily: font.bold,
    fontSize: 27,
    lineHeight: 32,
    marginTop: spacing.xs,
  },
  subtitle: {
    color: colors.inkSoft,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  modeButton: {
    minHeight: 48,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(8,26,58,0.14)',
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  modeButtonLargeText: { alignSelf: 'flex-start' },
  modeText: { color: colors.navy, fontFamily: font.semibold, fontSize: 10.5 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  summaryTile: {
    width: '48%',
    minHeight: 116,
    flexGrow: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: '#FFFCF7',
    borderWidth: 1,
    borderColor: 'rgba(8,26,58,0.08)',
    ...shadow.card,
  },
  summaryTileLargeText: { width: '100%', minHeight: 148 },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    color: colors.textMuted,
    fontFamily: font.medium,
    fontSize: 12.5,
    marginTop: spacing.sm,
  },
  tileValue: { fontFamily: font.bold, fontSize: 20, marginTop: 2 },
  insight: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primarySoft,
  },
  insightText: {
    flex: 1,
    color: colors.navy,
    fontFamily: font.medium,
    fontSize: 13.5,
    lineHeight: 19,
  },
  sectionHead: { gap: 2 },
  sectionTitle: { color: colors.navy, fontFamily: font.bold, fontSize: 17 },
  sectionNote: { color: colors.textMuted, fontFamily: font.regular, fontSize: 12.5 },
  actionList: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(8,26,58,0.08)',
    backgroundColor: '#FFFCF7',
  },
  action: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(8,26,58,0.10)',
  },
  actionLargeText: {
    minHeight: 88,
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  actionCopy: { flex: 1 },
  actionLabel: { color: colors.navy, fontFamily: font.semibold, fontSize: 14.5 },
  actionDetail: { color: colors.textMuted, fontFamily: font.regular, fontSize: 12.5, marginTop: 1 },
  transactionsHead: {
    minHeight: 44,
    justifyContent: 'center',
    paddingTop: spacing.xs,
  },
  pressed: { opacity: 0.72 },
});
