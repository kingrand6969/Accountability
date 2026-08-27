import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { Candidate } from '../buddy/api';
import { useAppTheme } from '../ui/AppThemeProvider';
import { font, spacing, type AppThemeColors } from '../ui/theme';
import { Avatar } from './Avatar';

type FeedBuddyRailProps = {
  candidates: readonly Candidate[];
  busyIds: ReadonlySet<string>;
  onOpen: (candidate: Candidate) => void;
  onAdd: (candidate: Candidate) => void;
  onSeeAll: () => void;
};

export function FeedBuddyRail({ candidates, busyIds, onOpen, onAdd, onSeeAll }: FeedBuddyRailProps) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const visibleCandidates = candidates.slice(0, 4);

  if (visibleCandidates.length === 0) return null;

  return (
    <View testID="feed-buddy-rail" accessibilityLabel="Suggested buddies" style={styles.section}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>Suggested buddies</Text>
        <Pressable
          style={({ pressed }) => [styles.seeAll, pressed && styles.pressed]}
          onPress={onSeeAll}
          accessibilityRole="button"
          accessibilityLabel="See all suggested buddies"
        >
          <Text style={styles.seeAllText}>See all</Text>
        </Pressable>
      </View>
      <View style={styles.people}>
        {visibleCandidates.map((candidate) => {
          const name = candidate.display_name?.trim() || 'AccountAbility member';
          const context = candidate.area?.trim() || 'Suggested';
          const busy = busyIds.has(candidate.id);
          return (
            <View key={candidate.id} style={styles.person}>
              <Pressable
                style={({ pressed }) => [styles.avatarTarget, pressed && styles.pressed]}
                onPress={() => onOpen(candidate)}
                accessibilityRole="button"
                accessibilityLabel={`Open Buddy Card for ${name}`}
              >
                <Avatar url={candidate.avatar_url} name={name} size={44} />
              </Pressable>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              <Text style={styles.context} numberOfLines={1}>{context}</Text>
              <Pressable
                style={({ pressed }) => [styles.add, pressed && !busy && styles.pressed]}
                onPress={() => onAdd(candidate)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Add ${name} as a buddy`}
                accessibilityState={busy ? { busy: true, disabled: true } : undefined}
              >
                <View
                  testID={`feed-buddy-add-visual-${candidate.id}`}
                  style={styles.addVisual}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={theme.ink.inverse} />
                  ) : (
                    <Ionicons name="add" size={18} color={theme.ink.inverse} />
                  )}
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  section: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: theme.surface.canvas,
  },
  headingRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: { fontFamily: font.bold, fontSize: 14, color: theme.ink.primary },
  seeAll: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  seeAllText: { fontFamily: font.semibold, fontSize: 12, color: theme.ink.action },
  people: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  person: { flex: 1, minWidth: 0, alignItems: 'center' },
  avatarTarget: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  name: {
    width: '100%',
    marginTop: spacing.xs,
    fontFamily: font.semibold,
    fontSize: 11,
    color: theme.ink.primary,
    textAlign: 'center',
  },
  context: {
    width: '100%',
    marginTop: 2,
    fontFamily: font.regular,
    fontSize: 9,
    color: theme.ink.muted,
    textAlign: 'center',
  },
  add: {
    width: 44,
    height: 44,
    marginTop: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addVisual: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.ink.action,
  },
  pressed: { opacity: 0.7 },
});
