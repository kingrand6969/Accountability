import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getBuddyCard } from '../../buddy/card';
import { Medal } from '../../achievements/Medal';
import { MEDALS, medalState, type MedalState } from '../../achievements/catalog';
import { authorLabel } from '../../feed/format';
import { colors, font, radius, spacing, contentMax } from '../../ui/theme';

/**
 * A member's full medal shelf, opened by tapping the Medals box on their buddy
 * card. Earned medals show at the tier the owner reached (snapshotted onto their
 * card); the rest of the catalogue shows locked, so a visitor sees what's still
 * to come.
 */
export default function BuddyMedals() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState<string | null>(null);
  const [states, setStates] = useState<MedalState[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      getBuddyCard(id)
        .then((v) => {
          setName(v?.name ?? null);
          const earned = new Map((v?.card.medals_list ?? []).map((m) => [m.id, m.tier]));
          setStates(
            MEDALS.map((def) => {
              const tier = earned.get(def.id);
              const at =
                tier != null ? def.tiers[Math.min(Math.max(tier, 0), def.tiers.length - 1)].at : 0;
              return medalState(def, at);
            }),
          );
        })
        .catch(() => setStates(MEDALS.map((def) => medalState(def, 0))));
    }, [id]),
  );

  if (states === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const earnedCount = states.filter((s) => s.unlocked).length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>{authorLabel(name)}&apos;s Medals</Text>
      <Text style={styles.sub}>
        {earnedCount} of {MEDALS.length} earned
      </Text>
      <View style={styles.grid}>
        {states.map((s) => (
          <View key={s.def.id} style={styles.cell}>
            <Medal state={s} size={82} />
            <Text style={styles.cellTitle} numberOfLines={1}>
              {s.def.title}
            </Text>
            <Text
              style={[styles.cellTier, s.unlocked && { color: colors.primary }]}
              numberOfLines={1}
            >
              {s.tierName ?? 'Locked'}
            </Text>
            <Text style={styles.cellBlurb} numberOfLines={3}>
              {s.def.blurb}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing.lg, paddingBottom: 48, ...contentMax },
  title: { fontFamily: font.extrabold, fontSize: 22, color: colors.text, textAlign: 'center' },
  sub: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 3,
    marginBottom: spacing.lg,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  cell: {
    width: 150,
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  cellTitle: { fontFamily: font.bold, fontSize: 14, color: colors.text, marginTop: 4 },
  cellTier: { fontFamily: font.semibold, fontSize: 12, color: colors.textMuted },
  cellBlurb: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 2,
  },
});
