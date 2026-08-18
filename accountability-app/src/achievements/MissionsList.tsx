import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassCard } from '../ui/Glass';
import { useAppTheme } from '../ui/AppThemeProvider';
import { type MissionState } from './missions';
import { MissionIcon } from './MissionIcon';
import { missionArtFor } from './missionArt';
import { font, radius, spacing, type AppThemeColors, type AppThemeMode } from '../ui/theme';
import { INK, INK_SOFT, ACCENT } from '../compete/CompeteUI';

const DONE = '#16a34a';

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
  const { colors: theme, mode } = useAppTheme();
  const palette = useMemo(() => missionPalette(theme, mode), [theme, mode]);
  const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);

  if (states === null) {
    return (
      <GlassCard plateOpacity={mode === 'dark' ? 0 : 0.45}>
        <View style={styles.loading}>
          <ActivityIndicator color={palette.action} />
        </View>
      </GlassCard>
    );
  }

  return (
    <GlassCard plateOpacity={mode === 'dark' ? 0 : 0.45}>
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

function missionPalette(theme: AppThemeColors, mode: AppThemeMode) {
  return {
    ink: mode === 'dark' ? theme.ink.primary : INK,
    muted: mode === 'dark' ? theme.ink.muted : INK_SOFT,
    action: mode === 'dark' ? theme.ink.action : ACCENT,
    actionInk: mode === 'dark' ? theme.ink.inverse : '#fff',
    success: mode === 'dark' ? theme.status.success : DONE,
    divider: mode === 'dark' ? theme.border.subtle : 'rgba(30,27,75,0.08)',
    track: mode === 'dark' ? theme.interaction.skeleton : 'rgba(30,27,75,0.1)',
    icon: mode === 'dark' ? theme.surface.muted : 'rgba(37,99,235,0.12)',
    iconDone: mode === 'dark' ? theme.status.successSoft : 'rgba(22,163,74,0.14)',
    pip: mode === 'dark' ? theme.surface.muted : 'rgba(30,27,75,0.07)',
    pipHit: mode === 'dark' ? theme.surface.raised : 'rgba(37,99,235,0.14)',
    pipHitBorder: mode === 'dark' ? theme.border.action : 'rgba(37,99,235,0.35)',
    chipBorder: mode === 'dark' ? theme.surface.card : '#fff',
  };
}

function createStyles(theme: AppThemeColors, mode: AppThemeMode) {
  const palette = missionPalette(theme, mode);

  return StyleSheet.create({
  loading: {
    padding: spacing.xl,
    alignItems: 'center',
    backgroundColor: mode === 'dark' ? theme.surface.card : 'transparent',
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    backgroundColor: mode === 'dark' ? theme.surface.card : 'transparent',
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
