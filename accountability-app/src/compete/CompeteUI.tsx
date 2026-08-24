import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '../feed/Avatar';
import { useAppTheme } from '../ui/AppThemeProvider';
import { font, radius, spacing, type AppThemeColors, type AppThemeMode } from '../ui/theme';
import { formatScore, type Metric } from './api';

export const INK = '#111411';
export const INK_SOFT = 'rgba(17,20,17,0.72)';
export const ACCENT = '#446B00';
const GOLD = '#f59e0b';
const SILVER = '#94a3b8';
const BRONZE = '#b45309';

export type CompetitionPalette = {
  ink: string;
  inkSoft: string;
  accent: string;
  onAccent: string;
  segmentSurface: string;
  segmentBorder: string;
  chipSurface: string;
  chipBorder: string;
  selectedRow: string;
  neutralRank: string;
  subtleAccent: string;
  faintAccent: string;
  accentBorder: string;
  accentBorderStrong: string;
  faintInk: string;
  quietInk: string;
  inputSurface: string;
  inputBorder: string;
};

function competitionPalette(
  theme: AppThemeColors,
  mode: AppThemeMode,
): CompetitionPalette {
  return {
    ink: mode === 'light' ? INK : theme.ink.primary,
    inkSoft: mode === 'light' ? INK_SOFT : theme.ink.secondary,
    accent: mode === 'light' ? ACCENT : theme.ink.action,
    onAccent: mode === 'light' ? '#fff' : theme.ink.inverse,
    segmentSurface: mode === 'light' ? 'rgba(255,255,255,0.5)' : theme.surface.card,
    segmentBorder: mode === 'light' ? 'rgba(255,255,255,0.7)' : theme.border.subtle,
    chipSurface: mode === 'light' ? 'rgba(255,255,255,0.55)' : theme.surface.raised,
    chipBorder: mode === 'light' ? 'rgba(255,255,255,0.75)' : theme.border.strong,
    selectedRow: mode === 'light' ? 'rgba(185,255,61,0.16)' : theme.surface.muted,
    neutralRank: mode === 'light' ? 'rgba(17,20,17,0.08)' : theme.surface.raised,
    subtleAccent: mode === 'light' ? 'rgba(185,255,61,0.18)' : theme.surface.muted,
    faintAccent: mode === 'light' ? 'rgba(185,255,61,0.12)' : theme.surface.raised,
    accentBorder: mode === 'light' ? 'rgba(111,159,0,0.42)' : theme.border.action,
    accentBorderStrong: mode === 'light' ? 'rgba(111,159,0,0.56)' : theme.border.action,
    faintInk: mode === 'light' ? 'rgba(17,20,17,0.08)' : theme.surface.muted,
    quietInk: mode === 'light' ? 'rgba(17,20,17,0.06)' : theme.surface.muted,
    inputSurface: mode === 'light' ? 'rgba(255,255,255,0.6)' : theme.surface.raised,
    inputBorder: mode === 'light' ? 'rgba(17,20,17,0.15)' : theme.border.strong,
  };
}

export function useCompetitionTheme() {
  const { colors: theme, mode } = useAppTheme();
  const palette = useMemo(() => competitionPalette(theme, mode), [mode, theme]);
  return { palette, mode, theme };
}

type Opt = { value: string; label: string; icon?: string };

/** Pill segmented control (Rankings / Challenges / Buddies, City / Country, …). */
export function Segmented({
  options,
  value,
  onChange,
}: {
  options: Opt[];
  value: string;
  onChange: (v: string) => void;
}) {
  const { palette } = useCompetitionTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <View style={styles.seg}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={({ pressed }) => [styles.segBtn, active && styles.segActive, pressed && styles.pressed]}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {o.icon ? (
              <Ionicons
                name={o.icon as never}
                size={14}
                color={active ? palette.onAccent : palette.inkSoft}
              />
            ) : null}
            <Text style={[styles.segText, active && styles.segTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Horizontal selectable chips (metric / period). */
export function Chips({
  options,
  value,
  onChange,
}: {
  options: Opt[];
  value: string;
  onChange: (v: string) => void;
}) {
  const { palette } = useCompetitionTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {o.icon ? (
              <Ionicons
                name={o.icon as never}
                size={13}
                color={active ? palette.onAccent : palette.accent}
              />
            ) : null}
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const MEDALS = [GOLD, SILVER, BRONZE];

/** A leaderboard / standings row: rank badge, avatar, name, score. */
export function RankRow({
  rank,
  name,
  avatar,
  score,
  metric,
  highlight,
  subtitle,
}: {
  rank: number;
  name: string | null;
  avatar: string | null;
  score: number;
  metric: Metric;
  highlight?: boolean;
  subtitle?: string | null;
}) {
  const { palette } = useCompetitionTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const medal = rank <= 3 ? MEDALS[rank - 1] : null;
  return (
    <View style={[styles.row, highlight && styles.rowMe]}>
      <View style={[styles.rankBadge, medal ? { backgroundColor: medal } : null]}>
        <Text style={[styles.rankNum, medal ? { color: '#fff' } : null]}>{rank}</Text>
      </View>
      <Avatar url={avatar} name={name} size={38} />
      <View style={styles.rankCopy}>
        <Text style={styles.name}>
          {name?.trim() || 'Member'}
          {highlight ? ' (you)' : ''}
        </Text>
        {subtitle ? (
          <Text style={styles.sub}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Text style={styles.score}>{formatScore(score, metric)}</Text>
    </View>
  );
}

const createStyles = (palette: CompetitionPalette) => StyleSheet.create({
  pressed: { opacity: 0.7 },
  seg: {
    flexDirection: 'row',
    backgroundColor: palette.segmentSurface,
    borderWidth: 1,
    borderColor: palette.segmentBorder,
    borderRadius: radius.pill,
    padding: 3,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: radius.pill,
    minHeight: spacing.touch,
    minWidth: 0,
  },
  segActive: { backgroundColor: palette.accent },
  segText: { flexShrink: 1, fontFamily: font.bold, fontSize: 13.5, color: palette.inkSoft, textAlign: 'center' },
  segTextActive: { color: palette.onAccent },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: palette.chipSurface,
    borderWidth: 1,
    borderColor: palette.chipBorder,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 13,
    minHeight: spacing.touch,
    minWidth: 0,
  },
  chipActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  chipText: { flexShrink: 1, fontFamily: font.semibold, fontSize: 13, color: palette.ink },
  chipTextActive: { color: palette.onAccent },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: spacing.touch,
  },
  rowMe: {
    backgroundColor: palette.selectedRow,
    borderRadius: radius.md,
    paddingHorizontal: 8,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.neutralRank,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNum: { fontFamily: font.extrabold, fontSize: 13, color: palette.inkSoft },
  rankCopy: { flex: 1, minWidth: 0 },
  name: { fontFamily: font.bold, fontSize: 14.5, color: palette.ink },
  sub: { fontFamily: font.medium, fontSize: 12, color: palette.inkSoft, marginTop: 1 },
  score: { flexShrink: 0, fontFamily: font.extrabold, fontSize: 15, color: palette.accent, textAlign: 'right' },
});
