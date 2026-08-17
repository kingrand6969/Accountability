import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Medal } from '../achievements/Medal';
import type { MedalState } from '../achievements/catalog';
import { font, spacing } from '../ui/theme';
import { allMedalsFromCard } from './BuddyCardFace';
import type { BuddyCard } from './card';
import { MAX_FEATURED_MEDALS, normalizeFeaturedMedalIds } from './featuredMedals';
import type { BuddyCardPaletteTokens } from './palette';

function isMedalState(value: MedalState | undefined): value is MedalState {
  return value !== undefined;
}

export function BuddyCardAchievements({
  card,
  palette,
  onPress,
}: {
  card: BuddyCard;
  palette: BuddyCardPaletteTokens;
  onPress: () => void;
}) {
  const all = card.show_medals ? allMedalsFromCard(card) : [];

  const featuredIds = normalizeFeaturedMedalIds(
    card.featured_medal_ids,
    all.map((state) => state.def.id),
  );
  const byId = new Map(all.map((state) => [state.def.id, state]));
  const featured = featuredIds.map((id) => byId.get(id)).filter(isMedalState);

  return (
    <View
      testID="buddy-card-achievements"
      style={[styles.root, { borderBottomColor: palette.border }]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="View all medals and completed challenges"
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <Text style={[styles.title, { color: palette.text }]}>Medals and Challenges</Text>
        <Ionicons name="chevron-forward" size={18} color={palette.accent} />
      </Pressable>
      {featured.length > 0 ? (
        <View style={styles.row}>
          {featured.slice(0, MAX_FEATURED_MEDALS).map((state) => (
            <Pressable
              key={state.def.id}
              testID={`featured-medal-${state.def.id}`}
              style={[styles.medalFrame, { borderColor: palette.border }]}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={`${state.def.title}, ${state.tierName}`}
              accessibilityHint="Opens medals and completed challenges"
            >
              <Medal state={state} size={52} animate={false} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={[styles.empty, { color: palette.textMuted }]}>No earned medals shared yet</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.72,
  },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: font.bold,
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  empty: {
    paddingBottom: spacing.sm,
    fontFamily: font.regular,
    fontSize: 12,
  },
  medalFrame: {
    width: 62,
    height: 62,
    minWidth: 48,
    minHeight: 48,
    borderRadius: 31,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
