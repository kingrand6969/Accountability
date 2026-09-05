import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassCard } from '../ui/Glass';
import { useAppTheme } from '../ui/AppThemeProvider';
import { type MissionState } from './missions';
import { MissionIcon } from './MissionIcon';
import { missionArtFor } from './missionArt';
import { font, radius, spacing, type AppThemeColors } from '../ui/theme';

/** The member's missions as a tidy list. The flex mission carries a "Flex now"
 *  button; the selfie mission shows its 2/5/10/25 km milestone pips. */
export function MissionsList({
  states,
  onFlex,
  flexing,
}: {
  states: MissionState[] | null;
  onFlex: () => void;
  flexing?: boolean;
}) {
  const { colors: theme } = useAppTheme();
  const palette = useMemo(() => missionPalette(theme), [theme]);
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (states === null) {
    return (
      <GlassCard plateOpacity={0}>
        <View style={styles.loading}>
          <ActivityIndicator color={palette.action} />
        </View>
      </GlassCard>
    );
  }

  return (
    <GlassCard plateOpacity={0}>
      <View style={styles.list}>
        {states.map((s, i) => (
          <View key={s.def.id} style={[styles.row, i > 0 && styles.rowDivider]}>
            {(() => {
              const art = missionArtFor(s.def.id);
              if (!art) {
                // family without dedicated art — keep the original badge
                return (
                  <View style={[styles.icon, s.completed && styles.iconDone]}>
                    <Ionicons
                      name={s.completed ? 'checkmark' : s.def.icon}
                      size={20}
                      color={s.completed ? palette.success : palette.action}
                    />
                  </View>
                );
              }
              return (
                <View style={styles.artWrap}>
                  <MissionIcon source={art} size={46} animated={!s.completed} />
                  {s.completed ? (
                    <View style={styles.doneChip}>
                      <Ionicons name="checkmark" size={11} color={palette.actionInk} />
                    </View>
                  ) : null}
                </View>
              );
            })()}

            <View style={{ flex: 1 }}>
              <View style={styles.top}>
                <Text style={styles.title} numberOfLines={1}>
                  {s.def.title}
                </Text>
                <Text style={[styles.reward, s.completed && { color: palette.success }]}>
                  {s.completed ? 'Earned ✓' : `+${s.def.points} pts`}
                </Text>
              </View>
              <Text style={styles.desc} numberOfLines={2}>
                {s.def.desc}
              </Text>

              {s.def.milestones ? (
                <View style={styles.pips}>
                  {s.def.milestones.map((m) => {
                    const hit = s.value >= m;
                    return (
                      <View key={m} style={[styles.pip, hit && styles.pipHit]}>
                        <Text style={[styles.pipText, hit && styles.pipTextHit]}>{m}km</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      { width: `${Math.round(s.progress * 100)}%` },
                      s.completed && { backgroundColor: palette.success },
                    ]}
                  />
                </View>
              )}

              <View style={styles.bottom}>
                <Text style={styles.label}>{s.label}</Text>
                {s.def.cta === 'flex' && !s.completed ? (
                  <Pressable
                    onPress={onFlex}
                    disabled={flexing}
                    style={({ pressed }) => [styles.flexBtn, pressed && { opacity: 0.8 }]}
                    accessibilityRole="button"
                    accessibilityLabel="Flex your rank to your buddies"
                  >
                    {flexing ? (
                      <ActivityIndicator size="small" color={palette.actionInk} />
                    ) : (
                      <Text style={styles.flexBtnText}>Flex now</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        ))}
      </View>
    </GlassCard>
  );
}

function missionPalette(theme: AppThemeColors) {
  return {
    ink: theme.ink.primary,
    muted: theme.ink.muted,
    action: theme.ink.action,
    actionInk: theme.ink.inverse,
    success: theme.status.success,
    divider: theme.border.subtle,
    track: theme.interaction.skeleton,
    icon: theme.surface.muted,
    iconDone: theme.status.successSoft,
    pip: theme.surface.muted,
    pipHit: theme.surface.raised,
    pipHitBorder: theme.border.action,
    chipBorder: theme.surface.card,
  };
}

function createStyles(theme: AppThemeColors) {
  const palette = missionPalette(theme);

  return StyleSheet.create({
  loading: {
    padding: spacing.xl,
    alignItems: 'center',
    backgroundColor: theme.surface.card,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    backgroundColor: theme.surface.card,
  },
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, alignItems: 'flex-start' },
  rowDivider: { borderTopWidth: 1, borderTopColor: palette.divider },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.icon,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  iconDone: { backgroundColor: palette.iconDone },
  artWrap: { width: 46, height: 46, marginTop: 1 },
  doneChip: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: palette.chipBorder,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontFamily: font.bold, fontSize: 15, color: palette.ink },
  reward: { fontFamily: font.extrabold, fontSize: 12.5, color: palette.action },
  desc: { fontFamily: font.regular, fontSize: 12.5, color: palette.muted, marginTop: 1 },
  track: {
    height: 7,
    borderRadius: 4,
    backgroundColor: palette.track,
    overflow: 'hidden',
    marginTop: 8,
  },
  fill: { height: 7, borderRadius: 4, backgroundColor: palette.action },
  pips: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  pip: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: palette.pip,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pipHit: { backgroundColor: palette.pipHit, borderColor: palette.pipHitBorder },
  pipText: { fontFamily: font.bold, fontSize: 11.5, color: palette.muted },
  pipTextHit: { color: palette.action },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 8 },
  label: { flex: 1, fontFamily: font.medium, fontSize: 11.5, color: palette.muted },
  flexBtn: {
    backgroundColor: palette.action,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 16,
    minHeight: spacing.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flexBtnText: { color: palette.actionInk, fontFamily: font.bold, fontSize: 12.5 },
  });
}
