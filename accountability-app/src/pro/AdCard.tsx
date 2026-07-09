import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius, spacing, shadow } from '../ui/theme';

/**
 * In-feed sponsored card (placeholder). Free members see one every few posts;
 * Pro members never see it (the Feed simply doesn't interleave it). Swap the
 * `slot` block for a real AdMob native ad once there's a store account + a dev
 * build — the feed interleaving and free/Pro gating stay exactly the same.
 */
export function AdCard({ onGoPro }: { onGoPro: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <Ionicons name="megaphone-outline" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Sponsored</Text>
          <Text style={styles.sub}>Ad · shown to free members</Text>
        </View>
        <Pressable
          onPress={onGoPro}
          hitSlop={6}
          style={({ pressed }) => [styles.proBtn, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Go Pro to remove ads"
        >
          <Text style={styles.proText}>Remove ads</Text>
        </Pressable>
      </View>
      <View style={styles.slot}>
        <Ionicons name="image-outline" size={26} color={colors.textFaint} />
        <Text style={styles.slotText}>Ad space</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15, fontFamily: font.bold, color: colors.text },
  sub: { color: colors.textFaint, fontSize: 12, fontFamily: font.medium, marginTop: 1 },
  proBtn: {
    backgroundColor: colors.proSoft,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  proText: { color: colors.pro, fontFamily: font.bold, fontSize: 12.5 },
  slot: {
    height: 150,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  slotText: { color: colors.textFaint, fontFamily: font.semibold, fontSize: 13 },
});
